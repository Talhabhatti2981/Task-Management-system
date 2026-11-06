import type { IncomingMessage, ServerResponse } from "node:http";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://fnyshqcxndhevdkglvpo.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZueXNocWN4bmRoZXZka2dsdnBvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5ODE2ODksImV4cCI6MjEwOTU1NzY4OX0.NZj9BmWV1LIlO4k2hGQg15a0_6HwnAijHBvpj2B2LTU";

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      json(res, 401, { error: "Sign in to continue" });
      return;
    }

    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    };
    const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers });
    const userData = (await userResponse.json().catch(() => null)) as { id?: string } | null;
    if (!userResponse.ok || !userData?.id) {
      json(res, 401, { error: "Invalid session" });
      return;
    }

    await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userData.id}`,
      {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
      }
    );
    res.statusCode = 204;
    res.end();
  } catch (error) {
    json(res, 500, {
      error: error instanceof Error ? error.message : "Could not update activity",
    });
  }
}
