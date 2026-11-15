import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { foutTekst, startMinuten, vandaag } from "./util";

const LEEG = {
  editions: [], days: [], shifts: [], profiles: [], aanmeldingen: [],
  toewijzingen: [], aanbod: [], meldingen: [], concept: [], opmerkingen: [],
};

const groepeer = (rijen, sleutel) => {
  const m = new Map();
  for (const r of rijen) {
    const k = r[sleutel];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};

/* Alle gegevens van het rooster, live bijgewerkt. */
export function useRooster(profiel) {
  const [db, setDb] = useState(LEEG);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState(null);
  const isAdmin = !!profiel?.is_admin;
  const timer = useRef(null);

  const laad = useCallback(async () => {
    if (!profiel) return;
    const q = (t, kol = "created_at") => supabase.from(t).select("*").order(kol);
    const res = await Promise.all([
      q("editions"), q("days", "datum"), q("shifts"), q("profiles", "naam"),
      q("aanmeldingen"), q("toewijzingen"), q("vervang_aanbod"),
      supabase.from("meldingen").select("*").order("created_at", { ascending: false }).limit(40),
      isAdmin ? q("indeling_concept") : Promise.resolve({ data: [] }),
      q("opmerkingen"),
    ]);
    const err = res.find((r) => r.error);
    if (err) { setFout(foutTekst(err.error)); setLaden(false); return; }
    const [editions, days, shifts, profiles, aanmeldingen, toewijzingen, aanbod, meldingen, concept, opmerkingen] =
      res.map((r) => r.data || []);
    setFout(null);
    setDb({ editions, days, shifts, profiles, aanmeldingen, toewijzingen, aanbod, meldingen, concept, opmerkingen });
    setLaden(false);
  }, [profiel, isAdmin]);

  useEffect(() => {
    if (!profiel) return undefined;
    laad();
    const straks = () => { clearTimeout(timer.current); timer.current = setTimeout(laad, 250); };
    const ch = supabase.channel("rooster")
      .on("postgres_changes", { event: "*", schema: "public" }, straks)
      .subscribe();
    const zichtbaar = () => { if (document.visibilityState === "visible") laad(); };
    document.addEventListener("visibilitychange", zichtbaar);
    window.addEventListener("online", laad);
    return () => {
      clearTimeout(timer.current);
      supabase.removeChannel(ch);
      document.removeEventListener("visibilitychange", zichtbaar);
      window.removeEventListener("online", laad);
    };
  }, [profiel, laad]);

  const afgeleid = useMemo(() => {
    const dagVan = new Map(db.days.map((d) => [d.id, d]));
    const editieVan = new Map(db.editions.map((e) => [e.id, e]));
    const persoon = new Map(db.profiles.map((p) => [p.id, p]));
    const shiftVan = new Map(db.shifts.map((s) => [s.id, s]));
    const shiftsPerDag = groepeer(
      [...db.shifts].sort((a, b) => startMinuten(a) - startMinuten(b)), "day_id");
    const opm = new Map(db.opmerkingen.map((o) => [`${o.edition_id}:${o.profile_id}`, o.tekst]));
    return {
      dagVan, editieVan, persoon, shiftVan, shiftsPerDag,
      aanmPerShift: groepeer(db.aanmeldingen, "shift_id"),
      toewPerShift: groepeer(db.toewijzingen, "shift_id"),
      conceptPerShift: groepeer(db.concept, "shift_id"),
      aanbodPerToew: groepeer(db.aanbod, "toewijzing_id"),
      opmerking: (editieId, profielId) => opm.get(`${editieId}:${profielId}`) || "",
      naam: (id) => persoon.get(id)?.naam || "Onbekend",
      datumVan: (s) => dagVan.get(s.day_id)?.datum || "",
      editieVanShift: (s) => editieVan.get(dagVan.get(s.day_id)?.edition_id) || null,
      komend: (s) => (dagVan.get(s.day_id)?.datum || "") >= vandaag(),
    };
  }, [db]);

  return { ...db, ...afgeleid, laden, fout, laad };
}

/* Voert een schrijfactie uit en geeft een nette foutmelding terug (of null). */
export async function doe(belofte) {
  try {
    const { error } = await belofte;
    return error ? foutTekst(error) : null;
  } catch (e) {
    return foutTekst(e);
  }
}

export const rpc = (naam, args) => doe(supabase.rpc(naam, args));
