import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { doe, rpc } from "./data";
import { D, fmtDag, fmtDagKort, fmtMoment, fmtRange, isoD, meervoud, nextDate, tijdLabel, vandaag } from "./util";
import { Bevestig, Icon, Knop, Label, Leeg, Melding, Stepper, Venster } from "./ui";

const STATUS = { concept: "Concept", open: "Open", gesloten: "Gesloten" };
const POSTEN = ["Bar", "Keuken", "BBQ", "Wedstrijdtafel"];

const Opm = ({ tekst }) => (tekst
  ? <span className="opm"><Icon n="notitie" /><span><span className="sr">Opmerking: </span>{tekst}</span></span> : null);

function useBreed() {
  const mq = "(min-width: 1100px)";
  const [breed, setBreed] = useState(() => window.matchMedia(mq).matches);
  useEffect(() => {
    const m = window.matchMedia(mq);
    const op = () => setBreed(m.matches);
    m.addEventListener("change", op);
    return () => m.removeEventListener("change", op);
  }, []);
  return breed;
}

export function Beheer(ctx) {
  const { r, route, ga } = ctx;
  const sub = ["indelen", "opzet", "mensen", "logboek"].includes(route[1]) ? route[1] : "indelen";
  const [curId, setCurId] = useState(null);

  const standaard = useMemo(() => {
    const nu = vandaag();
    const metToekomst = (e) => r.days.some((d) => d.edition_id === e.id && d.datum >= nu);
    return r.editions.find((e) => e.status === "open" && metToekomst(e))
      || r.editions.find((e) => e.status === "concept")
      || r.editions[r.editions.length - 1] || null;
  }, [r.editions, r.days]);
  const cur = r.editions.find((e) => e.id === curId) || standaard;

  const tabs = [["indelen", "Indelen"], ["opzet", "Rooster opzetten"], ["mensen", "Mensen"], ["logboek", "Logboek"]];
  const editieKeuze = r.editions.length > 0 && (
    <label className="editie-keuze">
      <span>Editie</span>
      <select className="veld" value={cur?.id || ""} onChange={(e) => setCurId(e.target.value)}>
        {r.editions.map((e) => <option key={e.id} value={e.id}>{e.naam} · {STATUS[e.status]}</option>)}
      </select>
    </label>
  );

  return (
    <div className="beheer">
      <div className="subnav" role="tablist" aria-label="Beheer">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={sub === k} onClick={() => ga(`beheer/${k}`)}>{label}</button>
        ))}
      </div>
      {sub === "indelen" && <Indelen ctx={ctx} cur={cur} editieKeuze={editieKeuze} />}
      {sub === "opzet" && <Opzet ctx={ctx} cur={cur} setCurId={setCurId} editieKeuze={editieKeuze} />}
      {sub === "mensen" && <Mensen ctx={ctx} />}
      {sub === "logboek" && <Logboek />}
    </div>
  );
}

/* =====================================================================
   Indelen
   ===================================================================== */

function Indelen({ ctx, cur, editieKeuze }) {
  const { r, actie, ga } = ctx;
  const breed = useBreed();
  const [sel, setSel] = useState(null);
  const [publiceren, setPubliceren] = useState(false);
  const [overzicht, setOverzicht] = useState(false);

  const dagen = useMemo(() => !cur ? [] : r.days.filter((d) => d.edition_id === cur.id)
    .sort((a, b) => a.datum.localeCompare(b.datum))
    .map((dag) => ({ dag, shifts: r.shiftsPerDag.get(dag.id) || [] })), [cur, r.days, r.shiftsPerDag]);
  const shifts = useMemo(() => dagen.flatMap((d) => d.shifts), [dagen]);

  const info = useMemo(() => {
    const nieuw = [], weg = [], perPersoon = new Map();
    let plekken = 0, gevuld = 0, tekort = 0;
    const tel = (pid, veld) => {
      if (!perPersoon.has(pid)) perPersoon.set(pid, { aangemeld: 0, ingedeeld: 0 });
      perPersoon.get(pid)[veld]++;
    };
    for (const s of shifts) {
      const c = r.conceptPerShift.get(s.id) || [], t = r.toewPerShift.get(s.id) || [];
      plekken += s.plekken; gevuld += Math.min(c.length, s.plekken);
      if (c.length < s.plekken) tekort++;
      for (const x of c) { tel(x.profile_id, "ingedeeld"); if (!t.some((y) => y.profile_id === x.profile_id)) nieuw.push({ s, pid: x.profile_id }); }
      for (const y of t) if (!c.some((x) => x.profile_id === y.profile_id)) weg.push({ s, pid: y.profile_id });
      for (const a of r.aanmPerShift.get(s.id) || []) tel(a.profile_id, "aangemeld");
    }
    return { nieuw, weg, perPersoon, plekken, gevuld, tekort };
  }, [shifts, r.conceptPerShift, r.toewPerShift, r.aanmPerShift]);

  const selShift = shifts.find((s) => s.id === sel) || null;
  const wijzigingen = info.nieuw.length + info.weg.length;

  if (!cur) return (
    <Leeg titel="Nog geen editie">
      Maak eerst een editie met dagen en diensten aan bij “Rooster opzetten”.
    </Leeg>
  );

  const detail = selShift && (
    <ShiftDetail key={selShift.id} s={selShift} ctx={ctx} cur={cur} tellingen={info.perPersoon} />
  );
  const personen = <PersonenOverzicht r={r} cur={cur} perPersoon={info.perPersoon} />;

  return (
    <div className="indelen">
      <div className="indelen-hoofd">
        <div className="werkbalk">
          {editieKeuze}
          <div className="cijfers">
            <div><b>{info.gevuld}<small>/{info.plekken}</small></b><span>plekken gevuld</span></div>
            <div><b className={info.tekort ? "oranje" : ""}>{info.tekort}</b><span>{info.tekort === 1 ? "dienst" : "diensten"} niet vol</span></div>
          </div>
        </div>

        {cur.status !== "open" && (
          <Melding soort="waarschuwing">
            Deze editie staat op <b>{STATUS[cur.status]}</b>. Vrijwilligers zien hem pas, en kunnen zich pas aanmelden, als hij op Open staat.{" "}
            <button type="button" className="tekstknop" onClick={() => ga("beheer/opzet")}>Naar Rooster opzetten</button>
          </Melding>
        )}

        {wijzigingen > 0 && (
          <div className="publiceer-balk">
            <span><b>{meervoud(wijzigingen, "wijziging", "wijzigingen")}</b> nog niet gepubliceerd. Vrijwilligers zien dit nog niet.</span>
            <Knop soort="accent" icon="megafoon" onClick={() => setPubliceren(true)}>Bekijk en publiceer</Knop>
          </div>
        )}

        {!breed && <Knop soort="tweede" breed icon="mensen" onClick={() => setOverzicht(true)}>Overzicht per persoon</Knop>}

        {dagen.length === 0 && <Leeg titel="Nog geen dagen">Voeg dagen en diensten toe bij “Rooster opzetten”.</Leeg>}

        {dagen.map(({ dag, shifts: ss }) => (
          <section key={dag.id}>
            <h2 className="dagkop">{fmtDag(dag.datum)}{dag.datum < vandaag() && <small> · geweest</small>}</h2>
            <div className="raster">
              {ss.map((s) => <IndeelKaart key={s.id} s={s} r={r} gekozen={sel === s.id} onKies={() => setSel(s.id)} />)}
              {ss.length === 0 && <p className="klein-tekst">Geen diensten op deze dag.</p>}
            </div>
          </section>
        ))}
      </div>

      {breed && (
        <aside className="zij">
          {selShift ? (
            <>
              <div className="zij-kop">
                <div><div className="dienst-dag">{fmtDag(r.datumVan(selShift))}</div><div className="dienst-tijd">{tijdLabel(selShift)}</div></div>
                <button type="button" className="rond" onClick={() => setSel(null)} aria-label="Sluiten"><Icon n="kruis" /></button>
              </div>
              {detail}
            </>
          ) : (
            <>
              <h2 className="kaart-titel">Overzicht per persoon</h2>
              <p className="klein-tekst">Kies links een dienst om mensen in te delen.</p>
              {personen}
            </>
          )}
        </aside>
      )}

      {!breed && selShift && (
        <Venster titel={`${fmtDagKort(r.datumVan(selShift))} · ${tijdLabel(selShift)}`} onSluit={() => setSel(null)}>{detail}</Venster>
      )}
      {!breed && overzicht && <Venster titel="Overzicht per persoon" onSluit={() => setOverzicht(false)}>{personen}</Venster>}

      {publiceren && (
        <Venster titel="Rooster publiceren" onSluit={() => setPubliceren(false)}>
          {cur.status !== "open" && <Melding soort="waarschuwing">Deze editie staat niet op Open. Zet hem eerst op Open, anders zien vrijwilligers hun diensten niet.</Melding>}
          {info.nieuw.length > 0 && (
            <>
              <h3 className="tussenkop">Nieuw ingedeeld ({info.nieuw.length})</h3>
              <ul className="wijziglijst">{info.nieuw.map(({ s, pid }) => (
                <li key={s.id + pid}><Icon n="plus" /><span><b>{r.naam(pid)}</b> · {fmtDagKort(r.datumVan(s))} {tijdLabel(s)}</span></li>))}</ul>
            </>
          )}
          {info.weg.length > 0 && (
            <>
              <h3 className="tussenkop">Vervalt ({info.weg.length})</h3>
              <ul className="wijziglijst weg">{info.weg.map(({ s, pid }) => (
                <li key={s.id + pid}><Icon n="kruis" /><span><b>{r.naam(pid)}</b> · {fmtDagKort(r.datumVan(s))} {tijdLabel(s)}</span></li>))}</ul>
            </>
          )}
          <p className="uitleg">Iedereen in deze lijst krijgt een melding. Daarna is het rooster voor alle vrijwilligers zichtbaar.</p>
          <div className="knoppen stapel">
            <Knop soort="accent" breed icon="megafoon" disabled={cur.status !== "open"}
              onClick={async () => { if (await actie(rpc("publiceer", { p_edition: cur.id }), "Rooster gepubliceerd, meldingen verstuurd")) setPubliceren(false); }}>
              Publiceer en stuur meldingen
            </Knop>
            <Knop soort="rustig" breed onClick={() => setPubliceren(false)}>Nog niet</Knop>
          </div>
        </Venster>
      )}
    </div>
  );
}

function IndeelKaart({ s, r, gekozen, onKies }) {
  const c = r.conceptPerShift.get(s.id) || [], t = r.toewPerShift.get(s.id) || [];
  const aanm = (r.aanmPerShift.get(s.id) || []).filter((a) => !c.some((x) => x.profile_id === a.profile_id)).length;
  const zoekt = t.filter((x) => x.status === "zoekt_vervanger");
  const aanbod = zoekt.reduce((n, x) => n + (r.aanbodPerToew.get(x.id) || []).length, 0);
  const vervalt = t.filter((y) => !c.some((x) => x.profile_id === y.profile_id));
  const vol = c.length >= s.plekken;
  return (
    <button type="button" className={`kaart indeel${gekozen ? " gekozen" : ""}${vol ? " vol" : ""}`} onClick={onKies}
      aria-pressed={gekozen}>
      <span className="indeel-kop">
        <span className="dienst-tijd">{tijdLabel(s)}</span>
        <span className={`teller${vol ? " vol" : ""}`}>{c.length}/{s.plekken}</span>
      </span>
      <span className="labels">
        {s.post !== "Bar" && <Label kleur="blauw">{s.post}</Label>}
        {s.gepromoot_at && !vol && <Label kleur="oranje">Oproep loopt</Label>}
        {zoekt.length > 0 && <Label kleur="oranje">Vervanger gezocht{aanbod > 0 && ` · ${aanbod} aanbod`}</Label>}
      </span>
      <span className="chips">
        {c.map((x) => {
          const nieuw = !t.some((y) => y.profile_id === x.profile_id);
          return <span key={x.id} className={`chip${nieuw ? " nieuw" : ""}`}>{r.naam(x.profile_id)}{nieuw && <i> · concept</i>}</span>;
        })}
        {vervalt.map((y) => <span key={y.id} className="chip vervalt">{r.naam(y.profile_id)}</span>)}
        {Array.from({ length: Math.max(0, s.plekken - c.length) }).map((_, i) => <span key={i} className="chip open">open</span>)}
      </span>
      <span className="indeel-voet">{aanm > 0 ? <b>{meervoud(aanm, "aanmelding", "aanmeldingen")} om uit te kiezen</b> : "Geen (andere) aanmeldingen"}<Icon n="pijl" /></span>
    </button>
  );
}

function ShiftDetail({ s, ctx, cur, tellingen }) {
  const { r, actie } = ctx;
  const [zoek, setZoek] = useState(null);       // null = dicht, anders zoektekst
  const [oproep, setOproep] = useState(null);   // null = dicht, anders berichttekst
  const c = r.conceptPerShift.get(s.id) || [], t = r.toewPerShift.get(s.id) || [];
  const inConcept = (pid) => c.some((x) => x.profile_id === pid);
  const vol = c.length >= s.plekken;
  const vervalt = t.filter((y) => !inConcept(y.profile_id));
  const kandidaten = (r.aanmPerShift.get(s.id) || []).filter((a) => !inConcept(a.profile_id));
  const zoekers = t.filter((x) => x.status === "zoekt_vervanger");
  const n = (pid) => tellingen.get(pid)?.ingedeeld || 0;
  const opm = (pid) => <Opm tekst={r.opmerking(cur.id, pid)} />;

  const deelIn = (pid) => actie(doe(supabase.from("indeling_concept").insert({ shift_id: s.id, profile_id: pid })));
  const haalWeg = (rij) => actie(doe(supabase.from("indeling_concept").delete().eq("id", rij.id)));

  const anderen = zoek === null ? [] : r.profiles
    .filter((p) => p.actief && !inConcept(p.id) && !kandidaten.some((a) => a.profile_id === p.id))
    .filter((p) => p.naam.toLowerCase().includes(zoek.trim().toLowerCase()));

  return (
    <div className="detail">
      <h3 className="tussenkop">Ingedeeld <span className={`teller${vol ? " vol" : ""}`}>{c.length}/{s.plekken}</span></h3>
      {c.length === 0 && vervalt.length === 0 && <p className="klein-tekst">Nog niemand ingedeeld.</p>}
      <ul className="rijen">
        {c.map((x) => {
          const nieuw = !t.some((y) => y.profile_id === x.profile_id);
          return (
            <li key={x.id}>
              <span className="rij-naam"><b>{r.naam(x.profile_id)}</b>
                <small>{nieuw ? "Concept: nog niet gepubliceerd" : "Gepubliceerd"} · nu {meervoud(n(x.profile_id), "dienst", "diensten")}</small>
                {opm(x.profile_id)}</span>
              <Knop soort="rustig" klein icon="kruis" onClick={() => haalWeg(x)}>Weghalen</Knop>
            </li>
          );
        })}
        {vervalt.map((y) => (
          <li key={y.id} className="vervalt">
            <span className="rij-naam"><b>{r.naam(y.profile_id)}</b><small>Vervalt bij publiceren</small></span>
            <Knop soort="rustig" klein disabled={vol} onClick={() => deelIn(y.profile_id)}>Terugzetten</Knop>
          </li>
        ))}
      </ul>

      {zoekers.map((x) => {
        const aanbod = r.aanbodPerToew.get(x.id) || [];
        return (
          <div className="blok oranje" key={x.id}>
            <p><Icon n="ruil" /> <span><b>{r.naam(x.profile_id)}</b> zoekt een vervanger.</span></p>
            {aanbod.length === 0 ? <p className="klein-tekst">Nog niemand heeft zich gemeld.</p> : (
              <ul className="rijen">
                {aanbod.map((a) => (
                  <li key={a.id}>
                    <span className="rij-naam"><b>{r.naam(a.profile_id)}</b><small>wil overnemen · nu {meervoud(n(a.profile_id), "dienst", "diensten")}</small>
                      {opm(a.profile_id)}</span>
                    <Knop soort="accent" klein icon="vink"
                      onClick={() => actie(rpc("keur_vervanging", { p_toewijzing: x.id, p_profile: a.profile_id }), "Goedgekeurd. Beiden hebben bericht gekregen.")}>
                      Goedkeuren
                    </Knop>
                  </li>
                ))}
              </ul>
            )}
            <Knop soort="rustig" klein onClick={() => actie(rpc("houd_dienst", { p_toewijzing: x.id }), "Verzoek ingetrokken")}>
              Verzoek intrekken: {r.naam(x.profile_id).split(" ")[0]} draait zelf
            </Knop>
          </div>
        );
      })}

      <h3 className="tussenkop">Aangemeld ({kandidaten.length})</h3>
      {kandidaten.length === 0 ? <p className="klein-tekst">Geen aanmeldingen meer om uit te kiezen.</p> : (
        <ul className="rijen">
          {kandidaten.map((a) => (
            <li key={a.id}>
              <span className="rij-naam"><b>{r.naam(a.profile_id)}</b>
                <small>nu {meervoud(n(a.profile_id), "dienst", "diensten")} · {meervoud(tellingen.get(a.profile_id)?.aangemeld || 0, "aanmelding", "aanmeldingen")}</small>
                {opm(a.profile_id)}</span>
              <Knop soort="primair" klein icon="plus" disabled={vol} onClick={() => deelIn(a.profile_id)}>Indelen</Knop>
            </li>
          ))}
        </ul>
      )}
      {vol && kandidaten.length > 0 && <p className="klein-tekst">De dienst is vol. Haal eerst iemand weg om te wisselen.</p>}

      {zoek === null ? (
        <Knop soort="tweede" breed icon="zoek" onClick={() => setZoek("")}>Iemand anders indelen</Knop>
      ) : (
        <div className="blok">
          <label className="veld-groep"><span>Zoek op naam (ook wie zich niet heeft aangemeld)</span>
            <input className="veld" autoFocus value={zoek} placeholder="Naam" onChange={(e) => setZoek(e.target.value)} /></label>
          <ul className="rijen scroll">
            {anderen.map((p) => (
              <li key={p.id}>
                <span className="rij-naam"><b>{p.naam}</b><small>nu {meervoud(n(p.id), "dienst", "diensten")} · niet aangemeld</small>{opm(p.id)}</span>
                <Knop soort="tweede" klein icon="plus" disabled={vol} onClick={() => deelIn(p.id)}>Indelen</Knop>
              </li>
            ))}
            {anderen.length === 0 && <li><span className="klein-tekst">Niemand gevonden.</span></li>}
          </ul>
          <Knop soort="rustig" klein onClick={() => setZoek(null)}>Sluiten</Knop>
        </div>
      )}

      <h3 className="tussenkop">Oproep</h3>
      {s.gepromoot_at && <p className="klein-tekst">Laatste oproep verstuurd op {fmtMoment(s.gepromoot_at)}. De dienst staat bij iedereen bovenaan onder “Hulp gezocht”.</p>}
      {oproep === null ? (
        <div className="knoppen">
          <Knop soort="tweede" icon="megafoon" onClick={() => setOproep("")} disabled={cur.status !== "open"}>
            {s.gepromoot_at ? "Stuur opnieuw een oproep" : "Stuur een oproep"}
          </Knop>
          {s.gepromoot_at && <Knop soort="rustig" onClick={() => actie(rpc("stop_promotie", { p_shift: s.id }), "Oproep gestopt")}>Stop oproep</Knop>}
        </div>
      ) : (
        <div className="blok">
          <label className="veld-groep"><span>Bericht erbij (mag leeg blijven)</span>
            <textarea className="veld" rows={3} maxLength={140} value={oproep} placeholder="Bijvoorbeeld: finaledag, het wordt gezellig druk!"
              onChange={(e) => setOproep(e.target.value)} /></label>
          <p className="klein-tekst">Iedereen die nog niet op deze dienst staat of zich ervoor heeft aangemeld, krijgt een pushmelding.</p>
          <div className="knoppen">
            <Knop soort="accent" icon="megafoon"
              onClick={async () => { if (await actie(rpc("promoot", { p_shift: s.id, p_tekst: oproep }), "Oproep verstuurd")) setOproep(null); }}>
              Verstuur oproep
            </Knop>
            <Knop soort="rustig" onClick={() => setOproep(null)}>Annuleren</Knop>
          </div>
        </div>
      )}
      {cur.status !== "open" && <p className="klein-tekst">Een oproep kan pas als de editie op Open staat.</p>}
    </div>
  );
}

function PersonenOverzicht({ r, cur, perPersoon }) {
  const rijen = r.profiles.filter((p) => p.actief || perPersoon.has(p.id))
    .map((p) => ({ p, ...(perPersoon.get(p.id) || { aangemeld: 0, ingedeeld: 0 }) }))
    .sort((a, b) => b.aangemeld - a.aangemeld || a.p.naam.localeCompare(b.p.naam));
  if (!rijen.length) return <p className="klein-tekst">Er heeft zich nog niemand geregistreerd.</p>;
  return (
    <table className="tabel">
      <thead><tr><th>Naam</th><th>Aangemeld</th><th>Ingedeeld</th></tr></thead>
      <tbody>
        {rijen.map(({ p, aangemeld, ingedeeld }) => (
          <tr key={p.id}><td>{p.naam}<Opm tekst={r.opmerking(cur.id, p.id)} /></td><td>{aangemeld}</td><td><b>{ingedeeld}</b></td></tr>
        ))}
      </tbody>
    </table>
  );
}

/* =====================================================================
   Rooster opzetten: edities, dagen, diensten
   ===================================================================== */

function Opzet({ ctx, cur, setCurId, editieKeuze }) {
  const { r, actie, zeg } = ctx;
  const [nieuwe, setNieuwe] = useState(null);
  const [dagDraft, setDagDraft] = useState("");
  const [nieuwVoor, setNieuwVoor] = useState(null);
  const [draft, setDraft] = useState({ post: "Bar", start: "19.00", end: "sluit", cap: 2 });
  const [vraag, setVraag] = useState(null);

  const dagen = !cur ? [] : r.days.filter((d) => d.edition_id === cur.id).sort((a, b) => a.datum.localeCompare(b.datum));
  const datums = dagen.map((d) => d.datum);
  const bezet = (s) => (r.conceptPerShift.get(s.id) || []).length + (r.toewPerShift.get(s.id) || []).length;

  const updEditie = (e, patch, ok) => actie(doe(supabase.from("editions").update(patch).eq("id", e.id)), ok);
  const updShift = (s, patch) => actie(doe(supabase.from("shifts").update(patch).eq("id", s.id)));

  const maakEditie = async () => {
    const naam = (nieuwe.naam || "").trim();
    if (!naam) return zeg("Geef de editie een naam", "fout");
    const { data: ed, error } = await supabase.from("editions").insert({ naam, status: "concept" }).select().single();
    if (error) return zeg("Aanmaken mislukt", "fout");
    if (nieuwe.kopieVan) {
      const bron = r.days.filter((d) => d.edition_id === nieuwe.kopieVan).sort((a, b) => a.datum.localeCompare(b.datum));
      if (bron.length) {
        const basis = D(bron[0].datum), st = D(nieuwe.start);
        for (const b of bron) {
          const dt = new Date(st); dt.setDate(dt.getDate() + Math.round((D(b.datum) - basis) / 864e5));
          const { data: nd } = await supabase.from("days").insert({ edition_id: ed.id, datum: isoD(dt) }).select().single();
          const bs = r.shifts.filter((s) => s.day_id === b.id);
          if (nd && bs.length) await supabase.from("shifts").insert(bs.map((s) => ({
            day_id: nd.id, post: s.post, start_tijd: s.start_tijd, eind_tijd: s.eind_tijd, plekken: s.plekken })));
        }
      }
    }
    setNieuwe(null); setCurId(ed.id);
    await r.laad(); zeg(`${naam} aangemaakt als concept`);
  };

  const voegDagToe = () => {
    const d = dagDraft || nextDate(datums);
    if (datums.includes(d)) return zeg("Die dag staat er al in", "fout");
    setDagDraft("");
    return actie(doe(supabase.from("days").insert({ edition_id: cur.id, datum: d })), `${fmtDag(d)} toegevoegd`);
  };

  const voegDienstToe = async (dag) => {
    if (await actie(doe(supabase.from("shifts").insert({
      day_id: dag.id, post: draft.post, start_tijd: draft.start.trim(), eind_tijd: draft.end.trim(), plekken: draft.cap })), "Dienst toegevoegd")) setNieuwVoor(null);
  };

  return (
    <div className="kolom breed">
      <section className="kaart">
        <h2 className="kaart-titel">Edities</h2>
        <p className="klein-tekst">Vrijwilligers zien alleen edities die op <b>Open</b> staan. Concept is je werkversie, Gesloten is archief.</p>
        <ul className="rijen">
          {r.editions.map((e) => (
            <li key={e.id} className={`editie-rij${cur?.id === e.id ? " gekozen" : ""}`}>
              <input className="veld" defaultValue={e.naam} aria-label="Naam van de editie"
                onBlur={(ev) => ev.target.value.trim() && ev.target.value !== e.naam && updEditie(e, { naam: ev.target.value.trim() }, "Naam aangepast")} />
              <select className="veld smal" value={e.status} aria-label="Status"
                onChange={(ev) => updEditie(e, { status: ev.target.value }, `${e.naam} staat nu op ${STATUS[ev.target.value]}`)}>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <Knop soort="rustig" klein onClick={() => setCurId(e.id)} disabled={cur?.id === e.id}>{cur?.id === e.id ? "Gekozen" : "Bewerk"}</Knop>
              <Knop soort="rustig" klein icon="prullenbak" aria-label={`Verwijder ${e.naam}`}
                onClick={() => setVraag({ titel: `Editie "${e.naam}" verwijderen?`, tekst: "Alle dagen, diensten, aanmeldingen en indelingen van deze editie verdwijnen. Dit kan niet ongedaan worden gemaakt.",
                  ja: "Ja, verwijder de editie", doe: () => actie(doe(supabase.from("editions").delete().eq("id", e.id)), "Editie verwijderd") })}>Verwijder</Knop>
            </li>
          ))}
        </ul>
        {nieuwe ? (
          <div className="blok">
            <label className="veld-groep"><span>Naam</span>
              <input className="veld" autoFocus placeholder="Bijvoorbeeld Veere Open zomer 2027" value={nieuwe.naam}
                onChange={(e) => setNieuwe({ ...nieuwe, naam: e.target.value })} /></label>
            <label className="veld-groep"><span>Dagen en diensten overnemen van</span>
              <select className="veld" value={nieuwe.kopieVan} onChange={(e) => setNieuwe({ ...nieuwe, kopieVan: e.target.value })}>
                <option value="">Niets, leeg beginnen</option>
                {r.editions.map((e) => <option key={e.id} value={e.id}>{e.naam}</option>)}
              </select></label>
            {nieuwe.kopieVan && (
              <label className="veld-groep"><span>Eerste dag van de nieuwe editie</span>
                <input className="veld" type="date" value={nieuwe.start} onChange={(e) => setNieuwe({ ...nieuwe, start: e.target.value })} /></label>
            )}
            <div className="knoppen">
              <Knop onClick={maakEditie}>Editie aanmaken</Knop>
              <Knop soort="rustig" onClick={() => setNieuwe(null)}>Annuleren</Knop>
            </div>
          </div>
        ) : (
          <Knop soort="tweede" icon="plus" onClick={() => setNieuwe({ naam: "", start: vandaag(), kopieVan: cur?.id || "" })}>Nieuwe editie</Knop>
        )}
      </section>

      {cur && (
        <section>
          <div className="werkbalk">{editieKeuze}<p className="klein-tekst">{fmtRange(datums)}</p></div>
          {dagen.map((dag) => {
            const ss = r.shiftsPerDag.get(dag.id) || [];
            return (
              <div className="kaart" key={dag.id}>
                <div className="dag-rij">
                  <h3 className="dagkop los">{fmtDag(dag.datum)}</h3>
                  <Knop soort="rustig" klein icon="prullenbak"
                    onClick={() => setVraag({ titel: `${fmtDag(dag.datum)} verwijderen?`, tekst: "Alle diensten, aanmeldingen en indelingen van deze dag verdwijnen.",
                      ja: "Ja, verwijder de dag", doe: () => actie(doe(supabase.from("days").delete().eq("id", dag.id)), "Dag verwijderd") })}>Dag verwijderen</Knop>
                </div>
                {ss.map((s) => (
                  <div className="dienst-bewerk" key={s.id}>
                    <label><span>Post</span>
                      <select className="veld" value={s.post} onChange={(e) => updShift(s, { post: e.target.value })}>
                        {[...new Set([...POSTEN, s.post])].map((p) => <option key={p}>{p}</option>)}
                      </select></label>
                    <label><span>Van</span>
                      <input className="veld tijd" defaultValue={s.start_tijd} inputMode="decimal"
                        onBlur={(e) => e.target.value.trim() && e.target.value !== s.start_tijd && updShift(s, { start_tijd: e.target.value.trim() })} /></label>
                    <label><span>Tot</span>
                      <input className="veld tijd" defaultValue={s.eind_tijd}
                        onBlur={(e) => e.target.value.trim() && e.target.value !== s.eind_tijd && updShift(s, { eind_tijd: e.target.value.trim() })} /></label>
                    <label><span>Plekken</span>
                      <Stepper waarde={s.plekken} label="Aantal plekken" onChange={(v) => updShift(s, { plekken: v })} /></label>
                    <Knop soort="rustig" klein icon="prullenbak"
                      onClick={() => (bezet(s) ? setVraag({ titel: "Dienst verwijderen?", tekst: "Er staan al mensen op deze dienst. Zij krijgen geen automatisch bericht.",
                        ja: "Ja, verwijder de dienst", doe: () => actie(doe(supabase.from("shifts").delete().eq("id", s.id)), "Dienst verwijderd") })
                        : actie(doe(supabase.from("shifts").delete().eq("id", s.id)), "Dienst verwijderd"))}>Verwijder</Knop>
                  </div>
                ))}
                {nieuwVoor === dag.id ? (
                  <div className="dienst-bewerk nieuw">
                    <label><span>Post</span>
                      <select className="veld" value={draft.post} onChange={(e) => setDraft({ ...draft, post: e.target.value })}>
                        {POSTEN.map((p) => <option key={p}>{p}</option>)}</select></label>
                    <label><span>Van</span><input className="veld tijd" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></label>
                    <label><span>Tot</span><input className="veld tijd" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></label>
                    <label><span>Plekken</span><Stepper waarde={draft.cap} label="Aantal plekken" onChange={(v) => setDraft({ ...draft, cap: v })} /></label>
                    <div className="knoppen">
                      <Knop klein onClick={() => voegDienstToe(dag)}>Toevoegen</Knop>
                      <Knop soort="rustig" klein onClick={() => setNieuwVoor(null)}>Annuleren</Knop>
                    </div>
                  </div>
                ) : (
                  <Knop soort="tweede" klein icon="plus" onClick={() => setNieuwVoor(dag.id)}>Dienst toevoegen</Knop>
                )}
              </div>
            );
          })}
          <div className="kaart dag-nieuw">
            <label className="veld-groep"><span>Nieuwe dag</span>
              <input className="veld" type="date" value={dagDraft || nextDate(datums)} onChange={(e) => setDagDraft(e.target.value)} /></label>
            <Knop soort="tweede" icon="plus" onClick={voegDagToe}>Dag toevoegen</Knop>
          </div>
        </section>
      )}

      {vraag && <Bevestig titel={vraag.titel} tekst={vraag.tekst} ja={vraag.ja} gevaar onJa={vraag.doe} onSluit={() => setVraag(null)} />}
    </div>
  );
}

/* =====================================================================
   Mensen
   ===================================================================== */

function Mensen({ ctx }) {
  const { r, profiel, actie } = ctx;
  const [leden, setLeden] = useState(null);
  const [zoek, setZoek] = useState("");
  const [kies, setKies] = useState(null);

  useEffect(() => {
    let leeft = true;
    supabase.rpc("admin_leden").then(({ data }) => { if (leeft) setLeden(data || []); });
    return () => { leeft = false; };
  }, [r.profiles]);

  const diensten = useMemo(() => {
    const m = new Map();
    for (const t of r.toewijzingen) m.set(t.profile_id, (m.get(t.profile_id) || 0) + 1);
    return m;
  }, [r.toewijzingen]);

  if (!leden) return <div className="laden klein"><p>Laden…</p></div>;
  const lijst = leden.filter((p) => `${p.naam} ${p.email}`.toLowerCase().includes(zoek.trim().toLowerCase()));
  const gekozen = kies && leden.find((p) => p.id === kies);

  return (
    <div className="kolom breed">
      <p className="uitleg">Iedereen die inlogt, komt in deze lijst. Je kunt iemand beheerder maken of de toegang blokkeren.</p>
      <label className="veld-groep"><span>Zoek op naam of e-mailadres</span>
        <input className="veld" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={`${leden.length} mensen`} /></label>
      <ul className="kaart rijen mensen">
        {lijst.map((p) => (
          <li key={p.id}>
            <button type="button" className="mens" onClick={() => setKies(p.id)}>
              <span className="rij-naam"><b>{p.naam || "(nog geen naam)"}{p.id === profiel.id && " (jij)"}</b><small>{p.email}</small></span>
              <span className="labels">
                {p.is_admin && <Label kleur="blauw">Beheerder</Label>}
                {!p.actief && <Label kleur="oranje">Geblokkeerd</Label>}
                <Label>{meervoud(diensten.get(p.id) || 0, "dienst", "diensten")}</Label>
              </span>
              <Icon n="pijl" />
            </button>
          </li>
        ))}
        {lijst.length === 0 && <li><span className="klein-tekst">Niemand gevonden.</span></li>}
      </ul>

      {gekozen && (
        <Venster titel={gekozen.naam || gekozen.email} onSluit={() => setKies(null)}>
          <dl className="gegevens">
            <div><dt>E-mailadres</dt><dd>{gekozen.email}</dd></div>
            <div><dt>Lid sinds</dt><dd>{fmtMoment(gekozen.created_at)}</dd></div>
            <div><dt>Gepubliceerde diensten</dt><dd>{diensten.get(gekozen.id) || 0}</dd></div>
          </dl>
          <div className="knoppen stapel">
            <Knop soort="tweede" breed icon="sleutel"
              onClick={async () => { await actie(rpc("admin_zet_rol", { p_profile: gekozen.id, p_admin: !gekozen.is_admin }),
                gekozen.is_admin ? "Beheerrol ingetrokken" : `${gekozen.naam} is nu beheerder`); setKies(null); }}>
              {gekozen.is_admin ? "Beheerrol intrekken" : "Maak beheerder"}
            </Knop>
            <Knop soort={gekozen.actief ? "gevaar" : "tweede"} breed
              onClick={async () => { await actie(rpc("admin_zet_actief", { p_profile: gekozen.id, p_actief: !gekozen.actief }),
                gekozen.actief ? "Toegang geblokkeerd" : "Toegang hersteld"); setKies(null); }}>
              {gekozen.actief ? "Toegang blokkeren" : "Toegang teruggeven"}
            </Knop>
          </div>
          <p className="klein-tekst">Een geblokkeerd account kan niets meer zien of doen. Bestaande indelingen blijven staan tot je ze weghaalt.</p>
        </Venster>
      )}
    </div>
  );
}

/* =====================================================================
   Logboek
   ===================================================================== */

function Logboek() {
  const [log, setLog] = useState(null);
  useEffect(() => {
    supabase.from("logboek").select("*").order("created_at", { ascending: false }).limit(150)
      .then(({ data }) => setLog(data || []));
  }, []);
  if (!log) return <div className="laden klein"><p>Laden…</p></div>;
  if (!log.length) return <Leeg titel="Nog niets gebeurd">Publicaties, oproepen en vervangingen komen hier te staan.</Leeg>;
  return (
    <ul className="kaart rijen log kolom breed">
      {log.map((e) => (
        <li key={e.id}><time>{fmtMoment(e.created_at)}</time><span><b>{e.wie}</b> {e.tekst}</span></li>
      ))}
    </ul>
  );
}
