import type { IncomingMessage, ServerResponse } from "node:http";
import { ApiError, readBoard, readJsonBody, requireAuth, writeBoard } from "./boardStorage";

const sendError = (res: ServerResponse, error: unknown) => {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (status >= 500) console.error("Board API failed:", error);
  res.statusCode = status;
  res.end(JSON.stringify({ error: message }));
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET") {
    try {
      res.statusCode = 200;
      res.end(JSON.stringify(await readBoard(await requireAuth(req))));
    } catch (error) {
      sendError(res, error);
    }
    return;
  }

  if (req.method === "POST" || req.method === "PUT") {
    try {
      const context = await requireAuth(req);
      const board = await writeBoard(context, await readJsonBody(req));
      res.statusCode = 200;
      res.end(JSON.stringify(board));
    } catch (error) {
      sendError(res, error);
    }
    return;
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ error: "Method not allowed" }));
}
