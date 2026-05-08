import { createClient } from "./supabase/client";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

export async function backendFetch(path: string, init: RequestInit = {}) {
  if (!BACKEND_URL) throw new Error("NEXT_PUBLIC_BACKEND_URL not set");

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  return fetch(`${BACKEND_URL}${path}`, { ...init, headers });
}
