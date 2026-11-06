import type { IncomingMessage, ServerResponse } from "node:http";
import { getInviteRedirectUrl } from "./appUrl";
import { ApiError, getSupabaseAdmin, readJsonBody, requireAdmin } from "./boardStorage";

const sendError = (res: ServerResponse, error: unknown) => {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (status >= 500) console.error("Members API failed:", error);
  res.statusCode = status;
  res.end(JSON.stringify({ error: message }));
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
    await requireAdmin(req);
    const supabase = getSupabaseAdmin();

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const role = typeof body.role === "string" ? body.role.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim() : "";
      if (!name || !role || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ApiError("Name, role, and valid email are required", 400);
      }

      const id = Date.now();
      const colors = ["bg-indigo-500", "bg-emerald-500", "bg-sky-500", "bg-amber-500", "bg-rose-500", "bg-violet-500"];
      const { error: insertError } = await supabase.from("members").insert({
        id,
        name,
        role,
        email: email.toLowerCase(),
        color: colors[id % colors.length],
      });
      if (insertError) {
        throw new ApiError(
          insertError.code === "23505" ? "A member with this email already exists" : "Could not create member",
          insertError.code === "23505" ? 409 : 500
        );
      }

      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
        email.toLowerCase(),
        {
          data: { name, role },
          redirectTo: getInviteRedirectUrl(),
        }
      );
      if (inviteError || !inviteData.user) {
        await supabase.from("members").delete().eq("id", id);
        throw new ApiError(inviteError?.message ?? "Could not send invitation email", 502);
      }

      const { error: memberUpdateError } = await supabase
        .from("members")
        .update({ auth_user_id: inviteData.user.id })
        .eq("id", id);
      const { error: profileUpdateError } = await supabase
        .from("profiles")
        .update({ member_id: id, role: "member" })
        .eq("user_id", inviteData.user.id);
      if (memberUpdateError || profileUpdateError) {
        await supabase.auth.admin.deleteUser(inviteData.user.id);
        await supabase.from("members").delete().eq("id", id);
        throw new ApiError("Invitation was created but could not be linked", 500);
      }

      res.statusCode = 201;
      res.end(JSON.stringify({ invited: true }));
      return;
    }

    if (req.method === "DELETE") {
      const id = Number(new URL(req.url ?? "/", "http://localhost").searchParams.get("id"));
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new ApiError("A valid member id is required", 400);
      }
      const { data: member, error: memberError } = await supabase
        .from("members")
        .select("auth_user_id")
        .eq("id", id)
        .maybeSingle();
      if (memberError) throw new ApiError("Could not load member", 500);
      if (!member) throw new ApiError("Member not found", 404);
      if (member.auth_user_id) {
        const { error } = await supabase.auth.admin.deleteUser(member.auth_user_id);
        if (error) throw new ApiError("Could not remove member account", 500);
      }
      const { error } = await supabase.from("members").delete().eq("id", id);
      if (error) throw new ApiError("Could not remove member", 500);
      res.statusCode = 200;
      res.end(JSON.stringify({ removed: true }));
      return;
    }

    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
  } catch (error) {
    sendError(res, error);
  }
}