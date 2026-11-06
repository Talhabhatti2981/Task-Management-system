import type { BoardSnapshot } from "../types";
import {
  emptyBoard,
  loadWorkspaceBoard,
  saveWorkspaceBoard,
} from "./workspace";

export const loadBoard = async (
  _accessToken: string
): Promise<{
  board: BoardSnapshot;
  shared: boolean;
}> => {
  try {
    const board = await loadWorkspaceBoard();
    return { board, shared: true };
  } catch {
    return { board: emptyBoard(), shared: false };
  }
};

export const saveBoard = async (
  board: BoardSnapshot,
  _accessToken: string
): Promise<boolean> => {
  try {
    await saveWorkspaceBoard(board);
    return true;
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
