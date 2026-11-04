import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const boardFile = path.resolve("board-data.json");

const emptyBoard = () =>
  JSON.stringify({ members: [], tasks: [], updatedAt: 0 }, null, 2);

const readBoardFile = () => {
  if (!fs.existsSync(boardFile)) {
    fs.writeFileSync(boardFile, emptyBoard());
  }
  return fs.readFileSync(boardFile, "utf8");
};

const sendJson = (res: ServerResponse, status: number, payload: string) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(payload);
};

const attachBoardApi = (server: ViteDevServer | PreviewServer) => {
  server.middlewares.use(
    "/api/board",
    (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (req.method === "GET") {
        sendJson(res, 200, readBoardFile());
        return;
      }

      if (req.method === "PUT" || req.method === "POST") {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          try {
            const body = Buffer.concat(chunks).toString("utf8");
            const parsed = JSON.parse(body || "{}") as {
              members?: unknown;
              tasks?: unknown;
              updatedAt?: number;
            };
            const payload = {
              members: Array.isArray(parsed.members) ? parsed.members : [],
              tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
              updatedAt:
                typeof parsed.updatedAt === "number"
                  ? parsed.updatedAt
                  : Date.now(),
            };
            const serialized = JSON.stringify(payload, null, 2);
            fs.writeFileSync(boardFile, serialized);
            sendJson(res, 200, serialized);
          } catch {
            sendJson(res, 400, JSON.stringify({ error: "Invalid board data" }));
          }
        });
        return;
      }

      next();
    }
  );
};

const sharedBoardPlugin = (): Plugin => ({
  name: "shared-board",
  configureServer(server) {
    attachBoardApi(server);
  },
  configurePreviewServer(server) {
    attachBoardApi(server);
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), sharedBoardPlugin()],
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    include: ["yjs", "y-webrtc"],
  },
});
