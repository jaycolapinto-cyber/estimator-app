import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://tozsbxtxurssvznreikr.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_SKeU2x7nRn0xLWPTTf_ArQ_p6P7RU92";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
