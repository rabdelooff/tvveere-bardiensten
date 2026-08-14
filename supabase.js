import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("VITE_SUPABASE_URL of VITE_SUPABASE_ANON_KEY ontbreekt in .env");
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});
