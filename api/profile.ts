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

const readJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(text.slice(0, 80) || "Supabase request failed");
  }
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "GET") {
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
    const userData = (await readJson(userResponse)) as {
      id?: string;
      email?: string;
      user_metadata?: { name?: string };
      message?: string;
      msg?: string;
    } | null;
    if (!userResponse.ok || !userData?.id) {
      json(res, 401, { error: userData?.message || userData?.msg || "Invalid session" });
      return;
    }

    const profileResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userData.id}&select=role,member_id`,
      { headers }
    );
    const profiles = (await readJson(profileResponse)) as
      | Array<{ role?: string; member_id?: number | null }>
      | { message?: string };
    if (!profileResponse.ok || !Array.isArray(profiles) || !profiles[0]) {
      json(res, 403, { error: "User profile is not set up" });
      return;
    }

    const profile = profiles[0];
    if (profile.role !== "admin" && profile.role !== "member") {
      json(res, 403, { error: "User role is not valid" });
      return;
    }

    let memberName = "";
    let memberEmail = "";
    if (profile.member_id) {
      const memberResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/members?id=eq.${profile.member_id}&select=name,email`,
        { headers }
      );
      const members = (await readJson(memberResponse)) as
        | Array<{ name?: string; email?: string }>
        | { message?: string };
      if (Array.isArray(members) && members[0]) {
        memberName = members[0].name ?? "";
        memberEmail = members[0].email ?? "";
      }
    }

    json(res, 200, {
      role: profile.role,
      memberId: profile.member_id ?? null,
      name: memberName || userData.user_metadata?.name || userData.email || "Admin",
      email: userData.email || memberEmail || "",
    });
  } catch (error) {
    console.error("Profile API failed:", error);
    json(res, 500, {
      error: error instanceof Error ? error.message : "Could not load profile",
    });
  }
}
