/* Nep-Supabase voor de demovideo's: alles in het geheugen, geen netwerk. */
export const configOk = true;

const mode = new URLSearchParams(window.location.search).get("demo") || "vrijwilliger";
let teller = 0;
let klok = Date.now() - 6 * 3600e3;
const id = (p) => `${p}-${++teller}`;
const nu = () => new Date((klok += 60e3)).toISOString();
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

const db = {
  editions: [], days: [], shifts: [], profiles: [], aanmeldingen: [], toewijzingen: [],
  vervang_aanbod: [], meldingen: [], indeling_concept: [], logboek: [], opmerkingen: [],
};
const emails = {};
let sessie = null;
const authCbs = new Set();
const kanaalCbs = new Set();

const persoon = (naam, extra = {}) => {
  const p = { id: id("p"), naam, is_admin: false, actief: true, handmatig: false, meld_aanmeldingen: false, created_at: nu(), ...extra };
  db.profiles.push(p);
  emails[p.id] = `${naam.toLowerCase().replace(/\s+/g, ".")}@voorbeeld.nl`;
  return p;
};
const editie = (naam, status, start, opzet) => {
  const e = { id: id("e"), naam, status, created_at: nu() };
  db.editions.push(e);
  opzet.forEach((diensten, i) => {
    const dt = new Date(start + "T12:00:00"); dt.setDate(dt.getDate() + i);
    const d = { id: id("d"), edition_id: e.id, datum: iso(dt), created_at: nu() };
    db.days.push(d);
    for (const [post, start_tijd, eind_tijd, plekken] of diensten) db.shifts.push({
      id: id("s"), day_id: d.id, post, start_tijd, eind_tijd, plekken, gepromoot_at: null, promo_tekst: null, created_at: nu() });
  });
  return e;
};
const OPZET = [
  [["Bar", "18.00", "sluit", 2]],
  [["Bar", "10.00", "14.00", 2], ["Bar", "14.00", "18.00", 2], ["Bar", "18.00", "sluit", 2]],
  [["Bar", "10.00", "14.00", 2], ["Bar", "14.00", "sluit", 2]],
];
const volgendeVrijdag = () => {
  const d = new Date(); d.setDate(d.getDate() + 4);
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  return iso(d);
};

const karin = persoon("Karin de Boer", { is_admin: true });
["Pieter Bakker", "Lotte Visser", "Tom Smits", "Eva Mulder", "Daan Meijer", "Femke Bos", "Joost Vos"].forEach((n) => persoon(n));
if (mode === "admin") {
  persoon("Sanne Jansen");
  editie("Veere Open zomer 2026", "gesloten", "2026-06-12", OPZET);
  sessie = { user: { id: karin.id, email: emails[karin.id] } };
} else {
  editie("Veere Open winter 2026", "open", volgendeVrijdag(),
    [OPZET[0], OPZET[1], [...OPZET[2], ["BBQ", "16.00", "19.00", 1]]]);
}

/* --- hulpjes die ook de opnamescripts gebruiken --- */
const uid = () => sessie?.user?.id || null;
const ik = () => db.profiles.find((p) => p.id === uid());
const pNaam = (n) => db.profiles.find((p) => p.naam === n);
const label = (sid) => {
  const s = db.shifts.find((x) => x.id === sid), d = db.days.find((x) => x.id === s.day_id);
  const dt = new Date(d.datum + "T12:00:00");
  return `${["zo", "ma", "di", "wo", "do", "vr", "za"][dt.getDay()]} ${dt.getDate()} `
    + `${["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"][dt.getMonth()]}`
    + ` · ${s.start_tijd}–${s.eind_tijd}${s.post !== "Bar" ? ` · ${s.post}` : ""}`;
};
const meld = (profile_id, soort, titel, tekst, url) =>
  db.meldingen.push({ id: id("m"), profile_id, soort, titel, tekst, url, gelezen_at: null, created_at: nu() });
const noteer = (tekst, wie) => db.logboek.push({ id: id("l"), wie: wie || ik()?.naam || "Iemand", tekst, created_at: nu() });
const meldAdmins = (soort, titel, tekst, url, behalve) => db.profiles
  .filter((p) => p.is_admin && p.actief && p.id !== behalve).forEach((p) => meld(p.id, soort, titel, tekst, url));
/* dienst van de laatste editie: dag-index, starttijd, post */
const dienst = (dagIdx, start, post = "Bar") => {
  const e = db.editions[db.editions.length - 1];
  const dagen = db.days.filter((d) => d.edition_id === e.id).sort((a, b) => a.datum.localeCompare(b.datum));
  return db.shifts.find((s) => s.day_id === dagen[dagIdx].id && s.start_tijd === start && s.post === post);
};
const ververs = () => kanaalCbs.forEach((cb) => cb());
const rij = (tabel, r) => { const x = { id: id(tabel[0]), created_at: nu(), ...r }; db[tabel].push(x); return x; };

const fout = (m) => ({ data: null, error: { message: m } });
const ok = (data = null) => ({ data, error: null });

const RPC = {
  start_profiel() {
    let p = ik();
    if (!p) {
      p = { id: uid(), naam: "", is_admin: !db.profiles.some((x) => x.is_admin), actief: true, handmatig: false, meld_aanmeldingen: false, created_at: nu() };
      db.profiles.push(p); emails[p.id] = sessie.user.email;
    }
    return ok({ ...p });
  },
  zet_naam({ p_naam }) { ik().naam = p_naam.trim(); return ok(); },
  zet_meld_aanmeldingen({ p_aan }) { ik().meld_aanmeldingen = p_aan; return ok(); },
  admin_leden() { return ok(db.profiles.map((p) => ({ ...p, email: emails[p.id] || null })).sort((a, b) => a.naam.localeCompare(b.naam))); },
  admin_voeg_persoon({ p_naam }) {
    const naam = p_naam.trim().replace(/\s+/g, " ");
    const p = { id: id("p"), naam, is_admin: false, actief: true, handmatig: true, meld_aanmeldingen: false, created_at: nu() };
    db.profiles.push(p); noteer(`voegde ${naam} toe (zonder account)`); return ok(p.id);
  },
  admin_zet_email({ p_profile, p_email }) {
    const p = db.profiles.find((x) => x.id === p_profile), adres = (p_email || "").trim().toLowerCase();
    if (!adres) { delete emails[p.id]; return ok("ontkoppeld"); }
    emails[p.id] = adres; noteer(`koppelde een e-mailadres aan ${p.naam}`); return ok("gekoppeld");
  },
  admin_hernoem({ p_profile, p_naam }) { db.profiles.find((x) => x.id === p_profile).naam = p_naam.trim(); return ok(); },
  admin_verwijder({ p_profile }) {
    const p = db.profiles.find((x) => x.id === p_profile);
    for (const t of ["aanmeldingen", "toewijzingen", "vervang_aanbod", "indeling_concept", "opmerkingen", "meldingen"])
      db[t] = db[t].filter((x) => x.profile_id !== p_profile);
    db.profiles = db.profiles.filter((x) => x.id !== p_profile); delete emails[p_profile];
    noteer(`verwijderde ${p.naam}`); return ok();
  },
  zet_opmerking({ p_edition, p_tekst }) {
    const tekst = (p_tekst || "").trim().slice(0, 500);
    db.opmerkingen = db.opmerkingen.filter((o) => !(o.edition_id === p_edition && o.profile_id === uid()));
    if (!tekst) return ok();
    rij("opmerkingen", { edition_id: p_edition, profile_id: uid(), tekst });
    meldAdmins("opmerking", `Opmerking van ${ik().naam}`, tekst.length > 140 ? `${tekst.slice(0, 139)}…` : tekst, "/#/beheer", uid());
    return ok();
  },
  admin_zet_rol({ p_profile, p_admin }) {
    const p = db.profiles.find((x) => x.id === p_profile); p.is_admin = p_admin;
    noteer(`${p_admin ? "maakte" : "haalde de beheerrol weg bij"} ${p.naam}${p_admin ? " beheerder" : ""}`); return ok();
  },
  admin_zet_actief({ p_profile, p_actief }) { db.profiles.find((x) => x.id === p_profile).actief = p_actief; return ok(); },
  markeer_gelezen() { db.meldingen.forEach((m) => { if (m.profile_id === uid() && !m.gelezen_at) m.gelezen_at = nu(); }); return ok(); },
  vapid_public_key() { return ok("BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U"); },
  bewaar_push() { return ok(); },
  verwijder_push() { return ok(); },
  publiceer({ p_edition }) {
    const e = db.editions.find((x) => x.id === p_edition);
    const dagen = new Set(db.days.filter((d) => d.edition_id === p_edition).map((d) => d.id));
    const sh = new Set(db.shifts.filter((s) => dagen.has(s.day_id)).map((s) => s.id));
    const inC = (s, p) => db.indeling_concept.some((c) => c.shift_id === s && c.profile_id === p);
    const inT = (s, p) => db.toewijzingen.some((t) => t.shift_id === s && t.profile_id === p);
    const weg = db.toewijzingen.filter((t) => sh.has(t.shift_id) && !inC(t.shift_id, t.profile_id));
    const nieuw = db.indeling_concept.filter((c) => sh.has(c.shift_id) && !inT(c.shift_id, c.profile_id));
    db.toewijzingen = db.toewijzingen.filter((t) => !weg.includes(t));
    const per = new Map();
    for (const c of nieuw) {
      rij("toewijzingen", { shift_id: c.shift_id, profile_id: c.profile_id, status: "ingedeeld" });
      per.set(c.profile_id, [...(per.get(c.profile_id) || []), c.shift_id]);
    }
    for (const [pid, ss] of per) meld(pid, "rooster", "Je bent ingedeeld",
      ss.length === 1 ? label(ss[0]) : `${ss.length} diensten bij ${e.naam}. Bekijk ze in de app.`, "/#/mijn");
    if (nieuw.length + weg.length) noteer(`publiceerde het rooster van ${e.naam} (${nieuw.length} nieuw, ${weg.length} vervallen)`);
    return ok({ nieuw: nieuw.length, vervallen: weg.length });
  },
  promoot({ p_shift, p_tekst }) {
    const s = db.shifts.find((x) => x.id === p_shift), t = (p_tekst || "").trim() || null;
    s.gepromoot_at = nu(); s.promo_tekst = t;
    const naar = db.profiles.filter((p) => p.actief && !p.handmatig && p.id !== uid()
      && ![...db.toewijzingen, ...db.indeling_concept, ...db.aanmeldingen].some((x) => x.shift_id === p_shift && x.profile_id === p.id));
    naar.forEach((p) => meld(p.id, "promotie", "Hulp gezocht bij de bar", label(p_shift) + (t ? ` — ${t}` : ". Kun jij helpen?"), "/#/diensten"));
    noteer(`stuurde een oproep voor ${label(p_shift)} naar ${naar.length} mensen`);
    return ok(naar.length);
  },
  stop_promotie({ p_shift }) { const s = db.shifts.find((x) => x.id === p_shift); s.gepromoot_at = null; s.promo_tekst = null; return ok(); },
  zoek_vervanger({ p_toewijzing }) { zoekVervanger(p_toewijzing); return ok(); },
  houd_dienst({ p_toewijzing }) {
    const t = db.toewijzingen.find((x) => x.id === p_toewijzing); t.status = "ingedeeld";
    db.vervang_aanbod = db.vervang_aanbod.filter((a) => a.toewijzing_id !== p_toewijzing);
    noteer(`draait ${label(t.shift_id)} toch zelf`); return ok();
  },
  bied_aan({ p_toewijzing }) { biedAan(p_toewijzing, uid()); return ok(); },
  trek_aanbod_in({ p_toewijzing }) {
    db.vervang_aanbod = db.vervang_aanbod.filter((a) => !(a.toewijzing_id === p_toewijzing && a.profile_id === uid())); return ok();
  },
  keur_vervanging({ p_toewijzing, p_profile }) {
    const t = db.toewijzingen.find((x) => x.id === p_toewijzing);
    const oud = db.profiles.find((p) => p.id === t.profile_id), nieuw = db.profiles.find((p) => p.id === p_profile);
    db.vervang_aanbod = db.vervang_aanbod.filter((a) => a.toewijzing_id !== p_toewijzing);
    db.indeling_concept = db.indeling_concept.filter((c) => !(c.shift_id === t.shift_id && [oud.id, nieuw.id].includes(c.profile_id)));
    t.profile_id = nieuw.id; t.status = "ingedeeld";
    rij("indeling_concept", { shift_id: t.shift_id, profile_id: nieuw.id });
    meld(nieuw.id, "rooster", "Je neemt een dienst over", `${label(t.shift_id)} — overgenomen van ${oud.naam}`, "/#/mijn");
    meld(oud.id, "rooster", "Je dienst is overgenomen", `${nieuw.naam} draait ${label(t.shift_id)} voor je`, "/#/mijn");
    noteer(`keurde goed: ${nieuw.naam} neemt ${label(t.shift_id)} over van ${oud.naam}`);
    return ok();
  },
};

function zoekVervanger(tid) {
  const t = db.toewijzingen.find((x) => x.id === tid);
  const wie = db.profiles.find((p) => p.id === t.profile_id);
  t.status = "zoekt_vervanger";
  db.profiles.filter((p) => p.actief && p.id !== wie.id && !db.toewijzingen.some((x) => x.shift_id === t.shift_id && x.profile_id === p.id))
    .forEach((p) => meld(p.id, "vervanger", "Vervanger gezocht", `${wie.naam} zoekt iemand voor ${label(t.shift_id)}`, p.is_admin ? "/#/beheer" : "/#/diensten"));
  noteer(`zoekt een vervanger voor ${label(t.shift_id)}`, wie.naam);
}
function biedAan(tid, pid) {
  const t = db.toewijzingen.find((x) => x.id === tid), wie = db.profiles.find((p) => p.id === pid);
  rij("vervang_aanbod", { toewijzing_id: tid, profile_id: pid });
  meldAdmins("aanbod", "Vervanger gevonden?", `${wie.naam} wil ${label(t.shift_id)} overnemen. Keur het goed in Beheer.`, "/#/beheer", pid);
}

/* --- query-bouwer --- */
const zichtbaar = (tabel) => {
  const rijen = db[tabel], admin = !!ik()?.is_admin;
  if (tabel === "meldingen") return rijen.filter((r) => r.profile_id === uid());
  if (tabel === "aanmeldingen" && !admin) return rijen.filter((r) => r.profile_id === uid());
  if (tabel === "vervang_aanbod" && !admin) return rijen.filter((r) => r.profile_id === uid());
  if (tabel === "opmerkingen" && !admin) return rijen.filter((r) => r.profile_id === uid());
  return rijen;
};
const STANDAARD = {
  toewijzingen: { status: "ingedeeld" }, shifts: { gepromoot_at: null, promo_tekst: null },
};
function vraag(tabel) {
  const q = { op: "select", filters: [], sorteer: null, max: null, enkel: false, rijen: null, patch: null };
  const voer = () => {
    const past = (r) => q.filters.every(([k, v]) => r[k] === v);
    if (q.op === "insert") {
      const nieuw = q.rijen.map((r) => rij(tabel, { ...(STANDAARD[tabel] || {}), ...r }));
      return ok(q.enkel ? nieuw[0] : nieuw);
    }
    if (q.op === "update") { db[tabel].filter(past).forEach((r) => Object.assign(r, q.patch)); return ok(); }
    if (q.op === "delete") { db[tabel] = db[tabel].filter((r) => !past(r)); return ok(); }
    let uit = zichtbaar(tabel).filter(past).map((r) => ({ ...r }));
    if (q.sorteer) {
      const [k, op] = q.sorteer;
      uit.sort((a, b) => String(a[k]).localeCompare(String(b[k])) * (op ? 1 : -1));
    }
    if (q.max) uit = uit.slice(0, q.max);
    return ok(uit);
  };
  const b = {
    select() { return b; },
    insert(r) { q.op = "insert"; q.rijen = Array.isArray(r) ? r : [r]; return b; },
    update(p) { q.op = "update"; q.patch = p; return b; },
    delete() { q.op = "delete"; return b; },
    eq(k, v) { q.filters.push([k, v]); return b; },
    order(k, o) { q.sorteer = [k, o?.ascending !== false]; return b; },
    limit(n) { q.max = n; return b; },
    single() { q.enkel = true; return b; },
    then(res, rej) { return new Promise((r) => setTimeout(() => r(voer()), 120)).then(res, rej); },
  };
  return b;
}

export const supabase = {
  auth: {
    async getSession() { return { data: { session: sessie } }; },
    onAuthStateChange(cb) { authCbs.add(cb); return { data: { subscription: { unsubscribe: () => authCbs.delete(cb) } } }; },
    async signInWithOtp() { await new Promise((r) => setTimeout(r, 500)); return { error: null }; },
    async verifyOtp({ email }) {
      await new Promise((r) => setTimeout(r, 500));
      sessie = { user: { id: id("p"), email } };
      authCbs.forEach((cb) => cb("SIGNED_IN", sessie));
      return { error: null };
    },
    async signOut() { sessie = null; authCbs.forEach((cb) => cb("SIGNED_OUT", null)); return { error: null }; },
  },
  from: vraag,
  rpc(naam, args) {
    return new Promise((r) => setTimeout(() => r(RPC[naam] ? RPC[naam](args || {}) : fout(`Onbekend: ${naam}`)), 150));
  },
  channel() {
    const k = { cb: null, on(_a, _b, cb) { k.cb = cb; kanaalCbs.add(cb); return k; }, subscribe() { return k; } };
    return k;
  },
  removeChannel(k) { kanaalCbs.delete(k.cb); },
};

window.__demo = { db, pNaam, dienst, label, meld, rij, ververs, uid, zoekVervanger, biedAan, noteer };
