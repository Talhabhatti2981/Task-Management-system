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

const PRODUCTION_SUPABASE_URL = "https://fnyshqcxndhevdkglvpo.supabase.co";
const PRODUCTION_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZueXNocWN4bmRoZXZka2dsdnBvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5ODE2ODksImV4cCI6MjEwOTU1NzY4OX0.NZj9BmWV1LIlO4k2hGQg15a0_6HwnAijHBvpj2B2LTU";
const PRODUCTION_APP_URL = "https://task-management-system-4xj4.vercel.app";
const PRODUCTION_ADMIN_EMAIL = "admin@gmail.com";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl =
    env.SUPABASE_URL || env.VITE_SUPABASE_URL || PRODUCTION_SUPABASE_URL;
  const publishableKey =
    env.SUPABASE_PUBLISHABLE_KEY ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    PRODUCTION_PUBLISHABLE_KEY;
  const adminEmail = env.ADMIN_EMAIL || env.VITE_ADMIN_EMAIL || PRODUCTION_ADMIN_EMAIL;
  const appUrl = env.APP_URL || env.VITE_APP_URL || PRODUCTION_APP_URL;

  process.env.SUPABASE_URL ||= supabaseUrl;
  process.env.SUPABASE_SECRET_KEY ||= env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_PUBLISHABLE_KEY ||= publishableKey;
  process.env.APP_URL ||= appUrl;
  process.env.ADMIN_EMAIL ||= adminEmail;

  return {
    plugins: [react(), tailwindcss(), taskflowApiPlugin()],
    define: {
      global: "globalThis",
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        publishableKey
      ),
      "import.meta.env.VITE_ADMIN_EMAIL": JSON.stringify(adminEmail),
      "import.meta.env.VITE_APP_URL": JSON.stringify(appUrl),
    },
  };
});
