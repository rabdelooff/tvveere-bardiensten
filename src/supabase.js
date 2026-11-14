import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configOk = !!(url && key);
if (!configOk) console.error("VITE_SUPABASE_URL of VITE_SUPABASE_ANON_KEY ontbreekt");

export const supabase = createClient(url || "http://localhost", key || "x", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
