import { supabase } from "./supabase";

export const authenticatedFetch = async (
  input: RequestInfo | URL,
  init: RequestInit = {}
) => {
  const sessionResult = await supabase?.auth.getSession();
  const session = sessionResult?.data.session;
  if (!session) throw new Error("Your session has expired. Sign in again.");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers });
};