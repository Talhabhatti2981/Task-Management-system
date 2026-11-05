import {
  defineConfig,
  loadEnv,
  type Plugin,
  type PreviewServer,
  type ViteDevServer,
} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import boardHandler from "./api/board";
import membersHandler from "./api/members";
import profileHandler from "./api/profile";
import activityHandler from "./api/activity";

const attachApi = (server: ViteDevServer | PreviewServer) => {
  const routes = [
    ["/api/board", boardHandler],
    ["/api/members", membersHandler],
    ["/api/profile", profileHandler],
    ["/api/activity", activityHandler],
  ] as const;

  for (const [route, handler] of routes) {
    server.middlewares.use(route, (req, res, next) => {
      void handler(req as IncomingMessage, res as ServerResponse).catch(next);
    });
  }
};

const taskflowApiPlugin = (): Plugin => ({
  name: "taskflow-api",
  configureServer(server) {
    attachApi(server);
  },
  configurePreviewServer(server) {
    attachApi(server);
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  process.env.SUPABASE_URL ||= env.SUPABASE_URL;
  process.env.SUPABASE_SECRET_KEY ||= env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_PUBLISHABLE_KEY ||= env.SUPABASE_PUBLISHABLE_KEY;

  return {
    plugins: [react(), tailwindcss(), taskflowApiPlugin()],
    define: {
      global: "globalThis",
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(env.SUPABASE_URL),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        env.SUPABASE_PUBLISHABLE_KEY
      ),
      "import.meta.env.VITE_ADMIN_EMAIL": JSON.stringify(env.ADMIN_EMAIL),
    },
  };
});
