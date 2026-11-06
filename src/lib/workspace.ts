import { supabase } from "./supabase";
import type { BoardSnapshot, Member, Task, UserProfile } from "../types";

const emptyBoard = (): BoardSnapshot => ({
  members: [],
  tasks: [],
  updatedAt: 0,
});

const timestamp = (value: string | null | undefined) => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const requireClient = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

export const loadProfile = async (): Promise<UserProfile> => {
  const client = requireClient();
  const { data: sessionData } = await client.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new Error("Sign in to continue");

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role, member_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) throw new Error("Could not load user profile");
  if (!profile || (profile.role !== "admin" && profile.role !== "member")) {
    throw new Error("User profile is not set up");
  }

  const memberResult = profile.member_id
    ? await client
        .from("members")
        .select("name, email")
        .eq("id", profile.member_id)
        .maybeSingle()
    : { data: null };

  return {
    role: profile.role,
    memberId: profile.member_id,
    name:
      memberResult.data?.name ??
      (typeof user.user_metadata.name === "string"
        ? user.user_metadata.name
        : user.email) ??
      "Admin",
    email: user.email ?? memberResult.data?.email ?? "",
  };
};

export const touchActivity = async () => {
  const client = requireClient();
  const { data: sessionData } = await client.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return;
  await client
    .from("profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("user_id", userId);
};

const mapBoard = (
  memberRows: Array<{
    id: number;
    name: string;
    role: string;
    email: string;
    color: string;
    auth_user_id: string | null;
    created_at: string;
  }>,
  taskRows: Array<{
    id: number;
    title: string;
    due_date: string;
    description: string;
    completed: boolean;
    member_id: number | null;
    priority: Task["priority"];
    updated_at: string;
  }>,
  profiles: Array<{ member_id: number | null; last_seen_at: string | null }>
): BoardSnapshot => {
  const lastSeenByMember = new Map(
    profiles.map((profile) => [profile.member_id, profile.last_seen_at])
  );
  const members: Member[] = memberRows.map((member) => {
    const lastSeen = lastSeenByMember.get(member.id) ?? null;
    const lastSeenAt = timestamp(lastSeen);
    const status =
      !member.auth_user_id || !lastSeen
        ? "invited"
        : Date.now() - lastSeenAt < 5 * 60 * 1000
          ? "active"
          : "offline";
    return {
      id: member.id,
      name: member.name,
      role: member.role,
      email: member.email,
      color: member.color,
      status,
    };
  });
  const tasks: Task[] = taskRows.map((task) => ({
    id: Number(task.id),
    title: task.title,
    date: task.due_date,
    description: task.description,
    completed: task.completed,
    memberId: task.member_id,
    priority: task.priority,
  }));
  const updatedAt = Math.max(
    ...memberRows.map((member) => timestamp(member.created_at)),
    ...profiles.map((profile) => timestamp(profile.last_seen_at)),
    ...taskRows.map((task) => timestamp(task.updated_at)),
    0
  );
  return { members, tasks, updatedAt };
};

export const loadWorkspaceBoard = async (): Promise<BoardSnapshot> => {
  const client = requireClient();
  const [memberResult, taskResult, profileResult] = await Promise.all([
    client
      .from("members")
      .select("id, name, role, email, color, auth_user_id, created_at")
      .order("created_at"),
    client
      .from("tasks")
      .select(
        "id, title, due_date, description, completed, member_id, priority, updated_at"
      )
      .order("due_date"),
    client.from("profiles").select("member_id, last_seen_at"),
  ]);
  if (memberResult.error || taskResult.error || profileResult.error) {
    throw new Error("Could not load the workspace data");
  }
  return mapBoard(
    memberResult.data ?? [],
    taskResult.data ?? [],
    profileResult.data ?? []
  );
};

export const saveWorkspaceBoard = async (board: BoardSnapshot) => {
  const client = requireClient();
  const { data: existing, error: existingError } = await client
    .from("tasks")
    .select("id");
  if (existingError) throw new Error("Could not save tasks");

  const incomingIds = new Set(board.tasks.map((task) => task.id));
  const deletedIds = (existing ?? [])
    .map((row) => Number(row.id))
    .filter((id) => !incomingIds.has(id));

  if (board.tasks.length > 0) {
    const { error } = await client.from("tasks").upsert(
      board.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        due_date: task.date,
        completed: task.completed,
        member_id: task.memberId,
        priority: task.priority,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "id" }
    );
    if (error) throw new Error("Could not save tasks");
  }
  if (deletedIds.length > 0) {
    const { error } = await client.from("tasks").delete().in("id", deletedIds);
    if (error) throw new Error("Could not delete tasks");
  }
};

const readFunctionError = async (error: unknown, data: unknown) => {
  if (typeof data === "object" && data && "error" in data) {
    return String((data as { error?: string }).error || "Could not invite member");
  }
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.json === "function") {
    try {
      const body = (await context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // ignore parse failures
    }
  }
  return error instanceof Error ? error.message : "Could not invite member";
};

export const inviteMember = async (input: {
  name: string;
  role: string;
  email: string;
}) => {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("invite-member", {
    body: input,
  });
  if (error) throw new Error(await readFunctionError(error, data));
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(
      String((data as { error?: string }).error || "Could not invite member")
    );
  }
};

export const removeMember = async (id: number) => {
  const client = requireClient();
  const { data: sessionData } = await client.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Your session has expired. Sign in again.");

  const supabaseUrl =
    import.meta.env.VITE_SUPABASE_URL ||
    "https://fnyshqcxndhevdkglvpo.supabase.co";
  const publishableKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZueXNocWN4bmRoZXZka2dsdnBvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5ODE2ODksImV4cCI6MjEwOTU1NzY4OX0.NZj9BmWV1LIlO4k2hGQg15a0_6HwnAijHBvpj2B2LTU";

  const response = await fetch(
    `${supabaseUrl}/functions/v1/invite-member?id=${id}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: publishableKey,
      },
    }
  );
  const raw = await response.text();
  let result: { error?: string } = {};
  try {
    result = raw ? (JSON.parse(raw) as { error?: string }) : {};
  } catch {
    throw new Error("Could not remove member");
  }
  if (!response.ok) throw new Error(result.error ?? "Could not remove member");
};

export { emptyBoard };
