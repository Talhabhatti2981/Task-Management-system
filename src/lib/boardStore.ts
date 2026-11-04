import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import type { BoardSnapshot, Task } from "../types";

const BOARD_KEY = "taskflow-board-v1";
const LEGACY_MEMBERS_KEY = "members";
const LEGACY_TASKS_KEY = "tasks";
const ROOM_NAME = "taskflow-team-board-v1";

const emptyBoard = (): BoardSnapshot => ({
  members: [],
  tasks: [],
  updatedAt: 0,
});

const normalizeBoard = (value: unknown): BoardSnapshot => {
  if (!value || typeof value !== "object") return emptyBoard();
  const data = value as Partial<BoardSnapshot>;
  const tasks = Array.isArray(data.tasks)
    ? data.tasks.map((task: Task) => ({
        ...task,
        memberId: task.memberId ?? null,
        priority: task.priority ?? "medium",
      }))
    : [];

  return {
    members: Array.isArray(data.members) ? data.members : [],
    tasks,
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Date.now(),
  };
};

const cloneBoard = (board: BoardSnapshot): BoardSnapshot =>
  JSON.parse(JSON.stringify(board)) as BoardSnapshot;

export const readLocalBoard = (): BoardSnapshot => {
  try {
    const combined = localStorage.getItem(BOARD_KEY);
    if (combined) return normalizeBoard(JSON.parse(combined));

    const members = localStorage.getItem(LEGACY_MEMBERS_KEY);
    const tasks = localStorage.getItem(LEGACY_TASKS_KEY);
    if (!members && !tasks) return emptyBoard();

    return normalizeBoard({
      members: members ? JSON.parse(members) : [],
      tasks: tasks ? JSON.parse(tasks) : [],
      updatedAt: Date.now(),
    });
  } catch {
    return emptyBoard();
  }
};

const writeLocalBoard = (board: BoardSnapshot) => {
  localStorage.setItem(BOARD_KEY, JSON.stringify(board));
  localStorage.setItem(LEGACY_MEMBERS_KEY, JSON.stringify(board.members));
  localStorage.setItem(LEGACY_TASKS_KEY, JSON.stringify(board.tasks));
};

const isJsonResponse = (response: Response) => {
  const type = response.headers.get("content-type") ?? "";
  return type.includes("application/json");
};

const fetchApiBoard = async (): Promise<BoardSnapshot | null> => {
  try {
    const response = await fetch("/api/board", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok || !isJsonResponse(response)) return null;
    return normalizeBoard(await response.json());
  } catch {
    return null;
  }
};

const saveApiBoard = async (board: BoardSnapshot): Promise<boolean> => {
  try {
    const response = await fetch("/api/board", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(board),
    });
    return response.ok && isJsonResponse(response);
  } catch {
    return false;
  }
};

const ydoc = new Y.Doc();
const yBoard = ydoc.getMap<BoardSnapshot>("state");
let provider: WebrtcProvider | null = null;
let livePeers = false;

const publishYjs = (board: BoardSnapshot) => {
  const current = yBoard.get("snapshot");
  if (current && current.updatedAt >= board.updatedAt) return;
  yBoard.set("snapshot", cloneBoard(board));
};

export const loadBoard = async (): Promise<{
  board: BoardSnapshot;
  shared: boolean;
}> => {
  const local = readLocalBoard();
  const remote = await fetchApiBoard();

  if (!remote) {
    const yjsBoard = yBoard.get("snapshot");
    if (yjsBoard && yjsBoard.updatedAt >= local.updatedAt) {
      writeLocalBoard(yjsBoard);
      return { board: yjsBoard, shared: livePeers };
    }
    if (local.members.length > 0 || local.tasks.length > 0) {
      publishYjs(local);
    }
    return { board: local, shared: livePeers };
  }

  const remoteEmpty =
    remote.members.length === 0 &&
    remote.tasks.length === 0 &&
    remote.updatedAt === 0;
  const localHasData = local.members.length > 0 || local.tasks.length > 0;

  if (remoteEmpty && localHasData) {
    const uploaded = { ...local, updatedAt: Date.now() };
    await saveApiBoard(uploaded);
    writeLocalBoard(uploaded);
    publishYjs(uploaded);
    return { board: uploaded, shared: true };
  }

  writeLocalBoard(remote);
  publishYjs(remote);
  return { board: remote, shared: true };
};

export const saveBoard = async (board: BoardSnapshot): Promise<boolean> => {
  writeLocalBoard(board);
  publishYjs(board);
  const saved = await saveApiBoard(board);
  return saved || livePeers;
};

export const subscribeBoard = (
  onChange: (board: BoardSnapshot, shared: boolean) => void
) => {
  if (!provider) {
    try {
      provider = new WebrtcProvider(ROOM_NAME, ydoc, {
        signaling: ["wss://signaling.yjs.dev"],
      });
      const markLive = () => {
        livePeers = true;
        const snapshot = yBoard.get("snapshot") ?? readLocalBoard();
        onChange(snapshot, true);
      };
      provider.on("synced", (event: { synced: boolean } | boolean) => {
        const synced = typeof event === "boolean" ? event : event.synced;
        if (synced) markLive();
      });
      provider.on("peers", () => {
        livePeers = true;
      });
    } catch {
      provider = null;
    }
  }

  const observer = () => {
    const snapshot = yBoard.get("snapshot");
    if (!snapshot) return;
    writeLocalBoard(snapshot);
    onChange(snapshot, true);
  };
  yBoard.observe(observer);

  const poll = window.setInterval(async () => {
    const { board, shared } = await loadBoard();
    onChange(board, shared);
  }, 2500);

  const local = readLocalBoard();
  if (local.updatedAt > 0) publishYjs(local);

  return () => {
    yBoard.unobserve(observer);
    window.clearInterval(poll);
  };
};
