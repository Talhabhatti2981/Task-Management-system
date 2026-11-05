import type { BoardSnapshot, Task } from "../types";

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

const apiHeaders = (accessToken: string, includeJson = false) => ({
  Accept: "application/json",
  Authorization: `Bearer ${accessToken}`,
  ...(includeJson ? { "Content-Type": "application/json" } : {}),
});

const fetchApiBoard = async (
  accessToken: string
): Promise<BoardSnapshot | null> => {
  try {
    const response = await fetch("/api/board", {
      headers: apiHeaders(accessToken),
    });
    if (!response.ok) return null;
    return normalizeBoard(await response.json());
  } catch {
    return null;
  }
};

export const loadBoard = async (
  accessToken: string
): Promise<{
  board: BoardSnapshot;
  shared: boolean;
}> => {
  const board = await fetchApiBoard(accessToken);
  return { board: board ?? emptyBoard(), shared: board !== null };
};

export const saveBoard = async (
  board: BoardSnapshot,
  accessToken: string
): Promise<boolean> => {
  try {
    const response = await fetch("/api/board", {
      method: "POST",
      headers: apiHeaders(accessToken, true),
      body: JSON.stringify(board),
    });
    return response.ok;
  } catch {
    return false;
  }
};

export const subscribeBoard = (
  accessToken: string,
  onChange: (board: BoardSnapshot, shared: boolean) => void
) => {
  let stopped = false;
  let loading = false;
  const poll = window.setInterval(async () => {
    if (stopped || loading) return;
    loading = true;
    const { board, shared } = await loadBoard(accessToken);
    loading = false;
    if (!stopped) onChange(board, shared);
  }, 5000);

  return () => {
    stopped = true;
    window.clearInterval(poll);
  };
};
