import type { IncomingMessage, ServerResponse } from "node:http";
import { getInviteRedirectUrl } from "./appUrl";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://fnyshqcxndhevdkglvpo.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZueXNocWN4bmRoZXZka2dsdnBvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5ODE2ODksImV4cCI6MjEwOTU1NzY4OX0.NZj9BmWV1LIlO4k2hGQg15a0_6HwnAijHBvpj2B2LTU";
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(body));
};

const parseJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(text.slice(0, 120) || "Supabase request failed");
  }
};

const readBody = async (request: IncomingMessage) => {
  const existing = (request as IncomingMessage & { body?: unknown }).body;
  if (typeof existing === "string") {
    return JSON.parse(existing || "{}") as Record<string, unknown>;
  }
  if (existing && typeof existing === "object") {
    return existing as Record<string, unknown>;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
};

const supabaseHeaders = (token: string, extra: Record<string, string> = {}) => ({
  apikey: token,
  Authorization: `Bearer ${token}`,
  ...extra,
});

const requireAdmin = async (userToken: string) => {
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: supabaseHeaders(SUPABASE_ANON_KEY, { Authorization: `Bearer ${userToken}` }),
  });
  const userData = (await parseJson(userResponse)) as { id?: string; message?: string } | null;
  if (!userResponse.ok || !userData?.id) {
    throw Object.assign(new Error(userData?.message || "Invalid session"), { status: 401 });
  }

  const profileResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userData.id}&select=role`,
    { headers: supabaseHeaders(SUPABASE_ANON_KEY, { Authorization: `Bearer ${userToken}` }) }
  );
  const profiles = (await parseJson(profileResponse)) as Array<{ role?: string }> | null;
  if (!Array.isArray(profiles) || profiles[0]?.role !== "admin") {
    throw Object.assign(new Error("Administrator access is required"), { status: 403 });
  }
  return userData.id;
};

const rest = async (
  path: string,
  token: string,
  init: RequestInit = {}
) => {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      ...supabaseHeaders(token, { "Content-Type": "application/json", Prefer: "return=representation" }),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const data = await parseJson(response);
  return { response, data };
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const userToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!userToken) {
      json(res, 401, { error: "Sign in to continue" });
      return;
    }
    await requireAdmin(userToken);
    const adminKey = SUPABASE_SECRET_KEY || userToken;

    if (req.method === "POST") {
      const body = await readBody(req);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const role = typeof body.role === "string" ? body.role.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!name || !role || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        json(res, 400, { error: "Name, role, and valid email are required" });
        return;
      }
      if (!SUPABASE_SECRET_KEY) {
        json(res, 503, {
          error:
            "Set SUPABASE_SECRET_KEY on the Vercel project, then invite again. Email invites need the service role key.",
        });
        return;
      }

      const id = Date.now();
      const colors = ["bg-indigo-500", "bg-emerald-500", "bg-sky-500", "bg-amber-500", "bg-rose-500", "bg-violet-500"];
      const insert = await rest("/rest/v1/members", adminKey, {
        method: "POST",
        body: JSON.stringify({
          id,
          name,
          role,
          email,
          color: colors[id % colors.length],
        }),
      });
      if (!insert.response.ok) {
        const message =
          typeof insert.data === "object" && insert.data && "message" in insert.data
            ? String((insert.data as { message?: string }).message)
            : "Could not create member";
        json(res, insert.response.status === 409 ? 409 : 500, {
          error: message.includes("duplicate") ? "A member with this email already exists" : message,
        });
        return;
      }

      const inviteResponse = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
        method: "POST",
        headers: supabaseHeaders(SUPABASE_SECRET_KEY, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          email,
          data: { name, role },
          redirect_to: getInviteRedirectUrl(),
        }),
      });
      const invitePayload = (await parseJson(inviteResponse)) as {
        id?: string;
        user?: { id?: string };
        msg?: string;
        message?: string;
        error_description?: string;
      } | null;
      const inviteId = invitePayload?.id || invitePayload?.user?.id;
      if (!inviteResponse.ok || !inviteId) {
        await rest(`/rest/v1/members?id=eq.${id}`, adminKey, { method: "DELETE" });
        json(res, 502, {
          error:
            invitePayload?.msg ||
            invitePayload?.message ||
            invitePayload?.error_description ||
            "Could not send invitation email",
        });
        return;
      }

      const memberUpdate = await rest(`/rest/v1/members?id=eq.${id}`, adminKey, {
        method: "PATCH",
        body: JSON.stringify({ auth_user_id: inviteId }),
      });
      const profileUpdate = await rest(`/rest/v1/profiles?user_id=eq.${inviteId}`, adminKey, {
        method: "PATCH",
        body: JSON.stringify({ member_id: id, role: "member" }),
      });
      if (!memberUpdate.response.ok || !profileUpdate.response.ok) {
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${inviteId}`, {
          method: "DELETE",
          headers: supabaseHeaders(SUPABASE_SECRET_KEY),
        });
        await rest(`/rest/v1/members?id=eq.${id}`, adminKey, { method: "DELETE" });
        json(res, 500, { error: "Invitation was created but could not be linked" });
        return;
      }

      json(res, 201, { invited: true });
      return;
    }

    if (req.method === "DELETE") {
      const id = Number(new URL(req.url ?? "/", "http://localhost").searchParams.get("id"));
      if (!Number.isSafeInteger(id) || id <= 0) {
        json(res, 400, { error: "A valid member id is required" });
        return;
      }
      const loaded = await rest(
        `/rest/v1/members?id=eq.${id}&select=auth_user_id`,
        adminKey
      );
      const members = Array.isArray(loaded.data) ? loaded.data : [];
      if (!loaded.response.ok) {
        json(res, 500, { error: "Could not load member" });
        return;
      }
      if (!members[0]) {
        json(res, 404, { error: "Member not found" });
        return;
      }
      const authUserId = (members[0] as { auth_user_id?: string | null }).auth_user_id;
      if (authUserId && SUPABASE_SECRET_KEY) {
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authUserId}`, {
          method: "DELETE",
          headers: supabaseHeaders(SUPABASE_SECRET_KEY),
        });
      }
      const removed = await rest(`/rest/v1/members?id=eq.${id}`, adminKey, { method: "DELETE" });
      if (!removed.response.ok) {
        json(res, 500, { error: "Could not remove member" });
        return;
      }
      json(res, 200, { removed: true });
      return;
    }

    json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
    json(res, Number.isFinite(status) ? status : 500, {
      error: error instanceof Error ? error.message : "Could not invite member",
    });
  }
}
