import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./constants";

/** Supabase client for auth + user_settings sync (same calls as v5). */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
