import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";

const boardFile = path.resolve("board-data.json");

const emptyBoard = () =>
  JSON.stringify({ members: [], tasks: [], updatedAt: 0 }, null, 2);

const readBoardFile = () => {
  if (!fs.existsSync(boardFile)) {
    fs.writeFileSync(boardFile, emptyBoard());
  }
  return fs.readFileSync(boardFile, "utf8");
};

const attachBoardApi = (server: ViteDevServer | PreviewServer) => {
  server.middlewares.use("/api/board", (req, res, next) => {
    if (req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      res.end(readBoardFile());
      return;
    }

    if (req.method === "PUT" || req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk as Buffer));
      req.on("end", () => {
        try {
          const body = Buffer.concat(chunks).toString("utf8");
          const parsed = JSON.parse(body || "{}");
          const payload = {
            members: Array.isArray(parsed.members) ? parsed.members : [],
            tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
            updatedAt:
              typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
          };
          fs.writeFileSync(boardFile, JSON.stringify(payload, null, 2));
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(payload));
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Invalid board data" }));
        }
      });
      return;
    }

    next();
  });
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
});
