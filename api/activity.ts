import type { IncomingMessage, ServerResponse } from "node:http";
import { ApiError, getSupabaseAdmin, requireAuth } from "./boardStorage";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed"}));
    return;
  }

  try {
    const { user } = await requireAuth(req);
    const { error } = await getSupabaseAdmin()
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("user_id", user.id);
    if (error) throw new ApiError("Could not update activity", 500);
    res.statusCode = 204;
    res.end();
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    if (status >= 500) console.error("Activity API failed:", error);
    res.statusCode = status;
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }));
  }
}