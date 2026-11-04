import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

type BoardSnapshot = {
  members: unknown[];
  tasks: unknown[];
  updatedAt: number;
};

const boardFile = "/tmp/taskflow-board.json";

const emptyBoard = (): BoardSnapshot => ({
  members: [],
  tasks: [],
  updatedAt: 0,
});

const readBoard = (): BoardSnapshot => {
  try {
    return JSON.parse(fs.readFileSync(boardFile, "utf8")) as BoardSnapshot;
  } catch {
    return emptyBoard();
  }
};

const writeBoard = (board: BoardSnapshot) => {
  fs.writeFileSync(boardFile, JSON.stringify(board));
};

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET") {
    res.statusCode = 200;
    res.end(JSON.stringify(readBoard()));
    return;
  }

  if (req.method === "POST" || req.method === "PUT") {
    try {
      const raw =
        "body" in req && req.body
          ? typeof req.body === "string"
            ? req.body
            : JSON.stringify(req.body)
          : await readBody(req);
      const parsed = JSON.parse(raw || "{}") as Partial<BoardSnapshot>;
      const payload: BoardSnapshot = {
        members: Array.isArray(parsed.members) ? parsed.members : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        updatedAt:
          typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
      };
      writeBoard(payload);
      res.statusCode = 200;
      res.end(JSON.stringify(payload));
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid board data" }));
    }
    return;
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ error: "Method not allowed" }));
}
