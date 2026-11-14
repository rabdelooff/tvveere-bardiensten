// Verstuurt wachtende meldingen als pushbericht.
// Wordt aangeroepen door de database (trigger op "meldingen", via pg_net) met
// het gedeelde geheim uit push_config. De VAPID-sleutels worden bij de eerste
// aanroep aangemaakt en in push_config bewaard; ze staan dus nergens in de code.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import webpush from "npm:web-push@3.6.7";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function config(): Promise<Record<string, string>> {
  const lees = async () => {
    const { data, error } = await db.from("push_config").select("key,value");
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  };
  let cfg = await lees();
  if (!cfg.vapid_public || !cfg.vapid_private) {
    const k = webpush.generateVAPIDKeys();
    // tegelijk invoegen: een tweede gelijktijdige aanroep botst en leest daarna de eerste
    await db.from("push_config").insert([
      { key: "vapid_public", value: k.publicKey },
      { key: "vapid_private", value: k.privateKey },
    ]);
    cfg = await lees();
  }
  return cfg;
}

Deno.serve(async (req) => {
  try {
    const cfg = await config();
    if (!cfg.secret || req.headers.get("x-push-secret") !== cfg.secret) {
      return json({ error: "geen toegang" }, 401);
    }
    webpush.setVapidDetails(cfg.subject || "https://www.tvveere.nl", cfg.vapid_public, cfg.vapid_private);

    const { data: meldingen, error } = await db.rpc("claim_push", { p_max: 200 });
    if (error) throw error;
    if (!meldingen?.length) return json({ meldingen: 0, verstuurd: 0 });

    const ids = [...new Set(meldingen.map((m: { profile_id: string }) => m.profile_id))];
    const { data: subs, error: e2 } = await db.from("push_subscriptions")
      .select("id,profile_id,endpoint,p256dh,auth").in("profile_id", ids);
    if (e2) throw e2;

    let verstuurd = 0, mislukt = 0;
    const verlopen: string[] = [];
    await Promise.all(meldingen.flatMap((m: Record<string, string>) =>
      (subs ?? []).filter((s) => s.profile_id === m.profile_id).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ titel: m.titel, tekst: m.tekst, url: m.url, soort: m.soort }),
            { TTL: 60 * 60 * 24, urgency: "high" },
          );
          verstuurd++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) verlopen.push(s.id);
          else { mislukt++; console.error("push mislukt", code, (err as Error).message); }
        }
      })
    ));

    if (verlopen.length) await db.from("push_subscriptions").delete().in("id", verlopen);
    await db.from("meldingen").update({ push_status: "klaar" })
      .in("id", meldingen.map((m: { id: number }) => m.id));

    return json({ meldingen: meldingen.length, verstuurd, mislukt, verlopen: verlopen.length });
  } catch (err) {
    console.error(err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});
