import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const LIVE_APP_URL = "https://task-management-system-4xj4.vercel.app/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json(500, { error: "Supabase environment is missing" });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Sign in to continue" });

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json(401, { error: "Invalid session" });

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (profileError || profile?.role !== "admin") {
      return json(403, { error: "Administrator access is required" });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const role = typeof body.role === "string" ? body.role.trim() : "";
      const email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!name || !role || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json(400, { error: "Name, role, and valid email are required" });
      }

      const id = Date.now();
      const colors = [
        "bg-indigo-500",
        "bg-emerald-500",
        "bg-sky-500",
        "bg-amber-500",
        "bg-rose-500",
        "bg-violet-500",
      ];
      const { error: insertError } = await admin.from("members").insert({
        id,
        name,
        role,
        email,
        color: colors[id % colors.length],
      });
      if (insertError) {
        return json(insertError.code === "23505" ? 409 : 500, {
          error:
            insertError.code === "23505"
              ? "A member with this email already exists"
              : insertError.message || "Could not create member",
        });
      }

      const { data: inviteData, error: inviteError } =
        await admin.auth.admin.inviteUserByEmail(email, {
          data: { name, role },
          redirectTo: LIVE_APP_URL,
        });
      if (inviteError || !inviteData.user) {
        await admin.from("members").delete().eq("id", id);
        return json(502, {
          error: inviteError?.message ?? "Could not send invitation email",
        });
      }

      const { error: memberUpdateError } = await admin
        .from("members")
        .update({ auth_user_id: inviteData.user.id })
        .eq("id", id);

      const { error: profileUpsertError } = await admin.from("profiles").upsert({
        user_id: inviteData.user.id,
        role: "member",
        member_id: id,
      });

      if (memberUpdateError || profileUpsertError) {
        await admin.auth.admin.deleteUser(inviteData.user.id);
        await admin.from("members").delete().eq("id", id);
        return json(500, {
          error:
            memberUpdateError?.message ||
            profileUpsertError?.message ||
            "Invitation was created but could not be linked",
        });
      }

      return json(200, { invited: true });
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url);
      const id = Number(url.searchParams.get("id"));
      if (!Number.isSafeInteger(id) || id <= 0) {
        return json(400, { error: "A valid member id is required" });
      }

      const { data: member, error: memberError } = await admin
        .from("members")
        .select("auth_user_id")
        .eq("id", id)
        .maybeSingle();
      if (memberError) {
        return json(500, { error: memberError.message || "Could not load member" });
      }
      if (!member) return json(404, { error: "Member not found" });

      if (member.auth_user_id) {
        const { error } = await admin.auth.admin.deleteUser(member.auth_user_id);
        if (error) {
          return json(500, {
            error: error.message || "Could not remove member account",
          });
        }
      }

      const { error } = await admin.from("members").delete().eq("id", id);
      if (error) return json(500, { error: error.message || "Could not remove member" });
      return json(200, { removed: true });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : "Could not invite member",
    });
  }
});
