import type { BoardSnapshot, Task } from "../types";

const BOARD_KEY = "taskflow-board-v1";
const LEGACY_MEMBERS_KEY = "members";
const LEGACY_TASKS_KEY = "tasks";

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

export const loadBoard = async (): Promise<{
  board: BoardSnapshot;
  shared: boolean;
}> => {
  const local = readLocalBoard();

  try {
    const response = await fetch("/api/board", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return { board: local, shared: false };

    const remote = normalizeBoard(await response.json());
    const remoteEmpty =
      remote.members.length === 0 &&
      remote.tasks.length === 0 &&
      remote.updatedAt === 0;
    const localHasData = local.members.length > 0 || local.tasks.length > 0;

    if (remoteEmpty && localHasData) {
      const uploaded = { ...local, updatedAt: Date.now() };
      await saveBoard(uploaded);
      return { board: uploaded, shared: true };
    }

    return { board: remote, shared: true };
  } catch {
    return { board: local, shared: false };
  }
};

export const saveBoard = async (board: BoardSnapshot): Promise<boolean> => {
  writeLocalBoard(board);

  try {
    const response = await fetch("/api/board", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(board),
    });
    return response.ok;
  } catch {
    return false;
  }
};
