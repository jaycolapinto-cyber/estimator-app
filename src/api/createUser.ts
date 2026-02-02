// src/api/createUser.ts
import { supabase } from "../supabaseClient";

type CreateUserArgs = {
  account_id: string;
  name: string;
  email: string;
  password: string;
  role: "admin" | "user";
};

type CreateUserResult = { ok: boolean; id?: string; error?: string };

export async function createUser(args: CreateUserArgs): Promise<CreateUserResult> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) return { ok: false, error: "Not logged in (missing access token)" };

  const { data, error } = await supabase.functions.invoke<CreateUserResult>("create-user", {
    headers: { Authorization: `Bearer ${token}` },
    body: args,
  });

  // Supabase invoke error (network, 401, etc)
  if (error) return { ok: false, error: error.message || "Create user failed" };

  // Our function may return { error: "..." }
  if ((data as any)?.error) return { ok: false, error: (data as any).error };

  return data ?? { ok: false, error: "No response from server" };
}
