import { supabase } from "./supabaseClient";

export async function getMyOrgId(): Promise<string | null> {
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess?.session?.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("getMyOrgId error:", error.message);
    return null;
  }

  return data?.org_id || null;
}
