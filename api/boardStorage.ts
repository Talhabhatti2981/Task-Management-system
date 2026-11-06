import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import type { IncomingMessage } from "node:http";

export type BoardSnapshot = {
  members: unknown[];
  tasks: unknown[];
  updatedAt: number;
};

type Profile = {
  user_id: string;
  role: "admin" | "member";
  member_id: number | null;
  last_seen_at: string | null;
};

export type AuthContext = {
  user: User;
  profile: Profile;
};

export class ApiError extends Error {
  public status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let client: SupabaseClient | null = null;

export const getSupabaseAdmin = () => {
  const url =
    process.env.SUPABASE_URL || "https://fnyshqcxndhevdkglvpo.supabase.co";
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new ApiError("Supabase server environment is not configured", 503);
  }

  client ??= createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
};

export const readJsonBody = async (request: IncomingMessage) => {
  const parsedBody = (request as IncomingMessage & { body?: unknown }).body;
  if (typeof parsedBody === "string") {
    return JSON.parse(parsedBody || "{}") as Record<string, unknown>;
  }
  if (parsedBody && typeof parsedBody === "object") {
    return parsedBody as Record<string, unknown>;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw || "{}") as Record<string, unknown>;
};

export const requireAuth = async (
  request: IncomingMessage
): Promise<AuthContext> => {
  const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new ApiError("Sign in to continue", 401);

  const supabase = getSupabaseAdmin();
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) throw new ApiError("Invalid session", 401);

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("user_id, role, member_id, last_seen_at")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (error) throw new ApiError("Could not load user profile", 500);
  if (!profile) throw new ApiError("User profile is not set up", 403);
  if (profile.role !== "admin" && profile.role !== "member") {
    throw new ApiError("User role is not valid", 403);
  }

  return { user: authData.user, profile: profile as Profile };
};

export const requireAdmin = async (request: IncomingMessage) => {
  const context = await requireAuth(request);
  if (context.profile.role !== "admin") {
    throw new ApiError("Administrator access is required", 403);
  }
  return context;
};

const timestamp = (value: string | null | undefined) => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const readBoard = async (_context: AuthContext): Promise<BoardSnapshot> => {
  const supabase = getSupabaseAdmin();
  let membersQuery = supabase
    .from("members")
    .select("id, name, role, email, color, auth_user_id, created_at")
    .order("created_at");
  let tasksQuery = supabase
    .from("tasks")
    .select(
      "id, title, due_date, description, completed, member_id, priority, updated_at"
    )
    .order("due_date");

  const [memberResult, taskResult] = await Promise.all([
    membersQuery,
    tasksQuery,
  ]);
  if (memberResult.error || taskResult.error) {
    throw new ApiError("Could not load the workspace data", 500);
  }

  const memberRows = memberResult.data ?? [];
  const taskRows = taskResult.data ?? [];
  const memberIds = memberRows.map((member) => member.id);
  const profileResult =
    memberIds.length > 0
      ? await supabase
          .from("profiles")
          .select("member_id, last_seen_at")
          .in("member_id", memberIds)
      : { data: [], error: null };
  if (profileResult.error) {
    throw new ApiError("Could not load employee status", 500);
  }

  const profiles = profileResult.data ?? [];
  const lastSeenByMember = new Map(
    profiles.map((profile) => [profile.member_id, profile.last_seen_at])
  );
  const members = memberRows.map((member) => {
    const lastSeen = lastSeenByMember.get(member.id) ?? null;
    const lastSeenAt = timestamp(lastSeen);
    const status = !member.auth_user_id || !lastSeen
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
  const tasks = taskRows.map((task) => ({
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

export const writeBoard = async (
  context: AuthContext,
  input: Record<string, unknown>
) => {
  if (!Array.isArray(input.tasks)) {
    throw new ApiError("Tasks must be an array", 400);
  }

  const supabase = getSupabaseAdmin();
  const { data: allTaskRows, error: allTasksError } = await supabase
    .from("tasks")
    .select("id, member_id");
  if (allTasksError) throw new ApiError("Could not verify task access", 500);

  const memberId = context.profile.member_id;
  if (context.profile.role === "member" && memberId === null) {
    throw new ApiError("This account is not linked to an employee", 403);
  }

  const existingRows = (allTaskRows ?? []).filter(
    (task) => context.profile.role === "admin" || task.member_id === memberId
  );
  const existingIds = new Set(existingRows.map((task) => Number(task.id)));
  const allRowsById = new Map(
    (allTaskRows ?? []).map((task) => [Number(task.id), task])
  );
  const incoming = input.tasks.map((value) => {
    if (!value || typeof value !== "object") {
      throw new ApiError("Invalid task data", 400);
    }
    const task = value as Record<string, unknown>;
    const id = Number(task.id);
    const title = typeof task.title === "string" ? task.title.trim() : "";
    const description =
      typeof task.description === "string" ? task.description.trim() : "";
    const date = typeof task.date === "string" ? task.date : "";
    const priority = task.priority;
    if (
      !Number.isSafeInteger(id) ||
      !title ||
      !description ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !["low", "medium", "high"].includes(String(priority)) ||
      typeof task.completed !== "boolean"
    ) {
      throw new ApiError("Invalid task data", 400);
    }

    const existing = allRowsById.get(id);
    if (
      context.profile.role === "member" &&
      existing &&
      existing.member_id !== memberId
    ) {
      throw new ApiError("You can only change your own tasks", 403);
    }

    const assignedMemberId =
      context.profile.role === "member"
        ? memberId
        : task.memberId === null
          ? null
          : Number(task.memberId);
    if (
      context.profile.role === "admin" &&
      assignedMemberId !== null &&
      !Number.isSafeInteger(assignedMemberId)
    ) {
      throw new ApiError("Invalid employee assignment", 400);
    }

    return {
      id,
      title,
      description,
      due_date: date,
      completed: task.completed,
      member_id: assignedMemberId,
      priority,
      created_by: context.user.id,
      updated_at: new Date().toISOString(),
    };
  });

  const incomingIds = new Set(incoming.map((task) => task.id));
  const deletedIds = [...existingIds].filter((id) => !incomingIds.has(id));

  if (incoming.length > 0) {
    const { error } = await supabase
      .from("tasks")
      .upsert(incoming, { onConflict: "id" });
    if (error) throw new ApiError("Could not save tasks", 500);
  }
  if (deletedIds.length > 0) {
    const { error } = await supabase.from("tasks").delete().in("id", deletedIds);
    if (error) throw new ApiError("Could not delete tasks", 500);
  }

  return readBoard(context);
};