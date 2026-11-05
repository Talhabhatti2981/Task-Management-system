import type { IncomingMessage, ServerResponse } from "node:http";
import { ApiError, getSupabaseAdmin, requireAuth } from "./boardStorage";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const context = await requireAuth(req);
    const memberResult = context.profile.member_id
      ? await getSupabaseAdmin()
          .from("members")
          .select("name, email")
          .eq("id", context.profile.member_id)
          .maybeSingle()
      : { data: null };
    res.statusCode = 200;
    res.end(JSON.stringify({
      role: context.profile.role,
      memberId: context.profile.member_id,
      name: memberResult.data?.name ?? context.user.user_metadata.name ?? context.user.email ?? "Admin",
      email: context.user.email ?? memberResult.data?.email ?? "",
    }));
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    if (status >= 500) console.error("Profile API failed:", error);
    res.statusCode = status;
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }));
  }
}