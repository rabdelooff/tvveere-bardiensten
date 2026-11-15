import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { doe, rpc } from "./data";
import { D, dienstVoorstel, fmtDag, fmtDagKort, fmtMoment, fmtRange, foutTekst, isoD, meervoud, minuten, nextDate, tijdLabel, vandaag } from "./util";
import { Bevestig, Icon, Info, Knop, Label, Leeg, Melding, Stepper, TijdVeld, Venster } from "./ui";

const STATUS = { concept: "Concept", open: "Open", gesloten: "Gesloten" };
const POSTEN = ["Bar", "Keuken", "BBQ", "Wedstrijdtafel"];

const Opm = ({ tekst }) => (tekst
  ? <span className="opm"><Icon n="notitie" /><span><span className="sr">Opmerking: </span>{tekst}</span></span> : null);

/* Lang e-mailadres: breek bij voorkeur af vóór de @ in plaats van midden in een naam. */
const Mail = ({ adres }) => { const [naam, domein] = String(adres || "").split("@"); return domein ? <>{naam}<wbr />@{domein}</> : naam; };

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
      <span className="sr">Editie</span>
      <select className="veld" value={cur?.id || ""} onChange={(e) => setCurId(e.target.value)}>
        {r.editions.map((e) => <option key={e.id} value={e.id}>{e.naam}{e.status === "open" ? "" : ` (${STATUS[e.status].toLowerCase()})`}</option>)}
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
  const { r, actie, ga, zeg } = ctx;
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
    const zonderAccount = [...new Set([...nieuw, ...weg].map((x) => x.pid))].filter((pid) => r.persoon.get(pid)?.handmatig);
    return { nieuw, weg, perPersoon, plekken, gevuld, tekort, zonderAccount };
  }, [shifts, r.conceptPerShift, r.toewPerShift, r.aanmPerShift, r.persoon]);

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
            <div><b className={info.tekort ? "oranje" : ""}>{info.tekort}</b><span>niet vol</span></div>
          </div>
          {!breed && <Knop soort="tweede" klein alleenIcon icon="mensen" onClick={() => setOverzicht(true)}>Overzicht per persoon</Knop>}
        </div>

        {cur.status !== "open" && (
          <Melding soort="waarschuwing">
            Deze editie staat op <b>{STATUS[cur.status]}</b>. Vrijwilligers zien hem pas, en kunnen zich pas aanmelden, als hij op Open staat.{" "}
            <button type="button" className="tekstknop" onClick={() => ga("beheer/opzet")}>Naar Rooster opzetten</button>
          </Melding>
        )}

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

        {wijzigingen > 0 && (
          <div className="publiceer-balk">
            <span><b>{meervoud(wijzigingen, "wijziging", "wijzigingen")}</b> nog niet gepubliceerd</span>
            <Knop soort="accent" klein icon="megafoon" onClick={() => setPubliceren(true)}>Publiceer</Knop>
          </div>
        )}
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
          {info.zonderAccount.length > 0 && (
            <Melding soort="waarschuwing">
              <b>Zelf informeren:</b> {info.zonderAccount.map((pid) => r.naam(pid)).join(", ")}. {info.zonderAccount.length === 1 ? "Deze persoon heeft" : "Deze mensen hebben"} geen account en {info.zonderAccount.length === 1 ? "krijgt" : "krijgen"} geen melding.
            </Melding>
          )}
          <p className="klein-tekst">Iedereen met een account krijgt een melding. Daarna is het rooster voor alle vrijwilligers zichtbaar.</p>
          <div className="knoppen stapel">
            <Knop soort="accent" breed icon="megafoon" disabled={cur.status !== "open"}
              onClick={async () => {
                const zelf = info.zonderAccount.length;
                if (await actie(rpc("publiceer", { p_edition: cur.id }), zelf ? null : "Rooster gepubliceerd, meldingen verstuurd")) {
                  if (zelf) zeg(`Gepubliceerd. Informeer zelf nog ${meervoud(zelf, "persoon", "mensen")} zonder account.`);
                  setPubliceren(false);
                }
              }}>
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
          return <span key={x.id} className={`chip${nieuw ? " nieuw" : ""}`} title={`${r.naam(x.profile_id)}${nieuw ? " (concept, nog niet gepubliceerd)" : ""}`}>{r.naam(x.profile_id)}{nieuw && <span className="sr"> (concept)</span>}</span>;
        })}
        {vervalt.map((y) => <span key={y.id} className="chip vervalt" title={`${r.naam(y.profile_id)} (vervalt bij publiceren)`}>{r.naam(y.profile_id)}</span>)}
        {Array.from({ length: Math.max(0, s.plekken - c.length) }).map((_, i) => <span key={i} className="chip open">open</span>)}
      </span>
      <span className="indeel-voet">{aanm > 0 ? <b>{aanm} aangemeld</b> : "Geen aanmeldingen"}<Icon n="pijl" /></span>
    </button>
  );
}

function ShiftDetail({ s, ctx, cur, tellingen }) {
  const { r, actie, zeg } = ctx;
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
  const los = (pid) => (r.persoon.get(pid)?.handmatig ? " · geen account" : "");

  const deelIn = (pid) => actie(doe(supabase.from("indeling_concept").insert({ shift_id: s.id, profile_id: pid })));
  const haalWeg = (rij) => actie(doe(supabase.from("indeling_concept").delete().eq("id", rij.id)));

  const zoekSchoon = (zoek || "").trim().replace(/\s+/g, " ");
  const anderen = zoek === null ? [] : r.profiles
    .filter((p) => p.actief && !inConcept(p.id) && !kandidaten.some((a) => a.profile_id === p.id))
    .filter((p) => p.naam.toLowerCase().includes(zoekSchoon.toLowerCase()));
  const bestaatAl = r.profiles.some((p) => p.naam.toLowerCase() === zoekSchoon.toLowerCase());

  // nieuw persoon zonder account aanmaken en meteen indelen
  const voegToeEnDeelIn = async () => {
    const { data, error } = await supabase.rpc("admin_voeg_persoon", { p_naam: zoekSchoon });
    if (error) return zeg(foutTekst(error), "fout");
    if (await deelIn(data)) { zeg(`${zoekSchoon} toegevoegd en ingedeeld. Informeer deze persoon zelf.`); setZoek(""); }
  };

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
                <small>{nieuw ? "Concept" : "Gepubliceerd"} · nu {meervoud(n(x.profile_id), "dienst", "diensten")}{los(x.profile_id)}</small>
                {opm(x.profile_id)}</span>
              <Knop soort="rustig" klein alleenIcon icon="kruis" onClick={() => haalWeg(x)}>{`${r.naam(x.profile_id)} weghalen`}</Knop>
            </li>
          );
        })}
        {vervalt.map((y) => (
          <li key={y.id} className="vervalt">
            <span className="rij-naam"><b>{r.naam(y.profile_id)}</b><small>Vervalt bij publiceren</small></span>
            <Knop soort="rustig" klein alleenIcon icon="ongedaan" disabled={vol} onClick={() => deelIn(y.profile_id)}>{`${r.naam(y.profile_id)} terugzetten`}</Knop>
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
                      Akkoord
                    </Knop>
                  </li>
                ))}
              </ul>
            )}
            <Knop soort="rustig" klein onClick={() => actie(rpc("houd_dienst", { p_toewijzing: x.id }), "Verzoek ingetrokken")}>
              {r.naam(x.profile_id).split(" ")[0]} draait toch zelf
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
              <Knop soort="primair" klein alleenIcon icon="plus" disabled={vol} onClick={() => deelIn(a.profile_id)}>{`${r.naam(a.profile_id)} indelen`}</Knop>
            </li>
          ))}
        </ul>
      )}
      {vol && kandidaten.length > 0 && <p className="klein-tekst">De dienst is vol. Haal eerst iemand weg om te wisselen.</p>}

      {zoek === null ? (
        <Knop soort="tweede" klein icon="zoek" onClick={() => setZoek("")}>Iemand anders</Knop>
      ) : (
        <div className="blok">
          <div className="kopregel">
            <input className="veld" autoFocus value={zoek} placeholder="Zoek of typ een nieuwe naam" aria-label="Zoek op naam of typ een nieuwe naam"
              onChange={(e) => setZoek(e.target.value)} />
            <Info>Hier staat iedereen, ook wie zich niet voor deze dienst heeft aangemeld. Staat iemand er niet bij? Typ de naam en voeg die persoon toe zonder account. Zo iemand krijgt geen meldingen: informeer die persoon zelf.</Info>
            <Knop soort="rustig" klein alleenIcon icon="kruis" onClick={() => setZoek(null)}>Zoeken sluiten</Knop>
          </div>
          <ul className="rijen scroll">
            {anderen.map((p) => (
              <li key={p.id}>
                <span className="rij-naam"><b>{p.naam}</b><small>nu {meervoud(n(p.id), "dienst", "diensten")} · niet aangemeld{los(p.id)}</small>{opm(p.id)}</span>
                <Knop soort="tweede" klein alleenIcon icon="plus" disabled={vol} onClick={() => deelIn(p.id)}>{`${p.naam} indelen`}</Knop>
              </li>
            ))}
            {anderen.length === 0 && <li><span className="klein-tekst">Niemand gevonden.</span></li>}
          </ul>
          {zoekSchoon.length >= 2 && !bestaatAl && (
            <Knop soort="tweede" klein icon="plus" disabled={vol} onClick={voegToeEnDeelIn}>
              {`“${zoekSchoon}” toevoegen`}
            </Knop>
          )}
        </div>
      )}

      <h3 className="tussenkop">Oproep
        <Info>Een oproep stuurt een pushmelding naar iedereen met een account die nog niet op deze dienst staat of zich ervoor heeft aangemeld. De dienst staat daarna bij iedereen bovenaan onder “Hulp gezocht”. Dat kan alleen als de editie op Open staat.</Info></h3>
      {s.gepromoot_at && <p className="klein-tekst">Laatste oproep: {fmtMoment(s.gepromoot_at)}</p>}
      {oproep === null ? (
        <div className="knoppen">
          <Knop soort="tweede" klein icon="megafoon" onClick={() => setOproep("")} disabled={cur.status !== "open"}>
            {s.gepromoot_at ? "Opnieuw oproepen" : "Stuur oproep"}
          </Knop>
          {s.gepromoot_at && <Knop soort="rustig" klein onClick={() => actie(rpc("stop_promotie", { p_shift: s.id }), "Oproep gestopt")}>Stop oproep</Knop>}
        </div>
      ) : (
        <div className="blok">
          <textarea className="veld" rows={2} maxLength={140} value={oproep} aria-label="Bericht bij de oproep (mag leeg blijven)"
            placeholder="Bericht erbij (mag leeg). Bijvoorbeeld: finaledag, het wordt gezellig druk!"
            onChange={(e) => setOproep(e.target.value)} />
          <div className="knoppen">
            <Knop soort="accent" klein icon="megafoon"
              onClick={async () => { if (await actie(rpc("promoot", { p_shift: s.id, p_tekst: oproep }), "Oproep verstuurd")) setOproep(null); }}>
              Verstuur
            </Knop>
            <Knop soort="rustig" klein onClick={() => setOproep(null)}>Annuleren</Knop>
          </div>
        </div>
      )}
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
  const [draft, setDraft] = useState(dienstVoorstel([]));
  const [vraag, setVraag] = useState(null);

  const dagen = !cur ? [] : r.days.filter((d) => d.edition_id === cur.id).sort((a, b) => a.datum.localeCompare(b.datum));
  const datums = dagen.map((d) => d.datum);
  const bezet = (s) => (r.conceptPerShift.get(s.id) || []).length + (r.toewPerShift.get(s.id) || []).length;

  const updEditie = (e, patch, ok) => actie(doe(supabase.from("editions").update(patch).eq("id", e.id)), ok);
  const updShift = (s, patch) => actie(doe(supabase.from("shifts").update(patch).eq("id", s.id)));
  // de eindtijd moet na de begintijd liggen ("sluit" mag altijd)
  const tijdFout = (start, eind) => (minuten(start) !== null && minuten(eind) !== null && minuten(eind) <= minuten(start)
    ? "De eindtijd moet na de begintijd liggen" : null);

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
      day_id: dag.id, post: draft.post, start_tijd: draft.start, eind_tijd: draft.end, plekken: draft.cap })), "Dienst toegevoegd")) setNieuwVoor(null);
  };

  return (
    <div className="kolom breed">
      <section className="kaart">
        <div className="kopregel">
          <h2 className="kaart-titel">Edities</h2>
          <Info>Vrijwilligers zien alleen edities die op <b>Open</b> staan. Concept is je werkversie, Gesloten is archief. Een nieuwe editie kan de dagen en diensten van een eerdere editie overnemen.</Info>
          {!nieuwe && (
            <span className="kopregel-acties">
              <Knop soort="tweede" klein icon="plus" onClick={() => setNieuwe({ naam: "", start: vandaag(), kopieVan: cur?.id || "" })}>Nieuw</Knop>
            </span>
          )}
        </div>
        <ul className="rijen">
          {r.editions.map((e) => (
            <li key={e.id} className={`editie-rij${cur?.id === e.id ? " gekozen" : ""}`}>
              <input className="veld" defaultValue={e.naam} aria-label="Naam van de editie"
                onBlur={(ev) => ev.target.value.trim() && ev.target.value !== e.naam && updEditie(e, { naam: ev.target.value.trim() }, "Naam aangepast")} />
              <select className="veld smal" value={e.status} aria-label="Status"
                onChange={(ev) => updEditie(e, { status: ev.target.value }, `${e.naam} staat nu op ${STATUS[ev.target.value]}`)}>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <Knop soort="rustig" klein alleenIcon icon={cur?.id === e.id ? "vink" : "bewerk"} onClick={() => setCurId(e.id)} disabled={cur?.id === e.id}>
                {cur?.id === e.id ? `${e.naam} is gekozen` : `Bewerk de dagen en diensten van ${e.naam}`}</Knop>
              <Knop soort="rustig" klein alleenIcon icon="prullenbak"
                onClick={() => setVraag({ titel: `Editie "${e.naam}" verwijderen?`, tekst: "Alle dagen, diensten, aanmeldingen en indelingen van deze editie verdwijnen. Dit kan niet ongedaan worden gemaakt.",
                  ja: "Ja, verwijder de editie", doe: () => actie(doe(supabase.from("editions").delete().eq("id", e.id)), "Editie verwijderd") })}>{`Verwijder ${e.naam}`}</Knop>
            </li>
          ))}
        </ul>
        {nieuwe ? (
          <div className="blok">
            <label className="veld-groep"><span>Naam</span>
              <input className="veld" autoFocus placeholder="Bijv. Veere Open 2027" value={nieuwe.naam}
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
              <Knop klein onClick={maakEditie}>Editie aanmaken</Knop>
              <Knop soort="rustig" klein onClick={() => setNieuwe(null)}>Annuleren</Knop>
            </div>
          </div>
        ) : null}
      </section>

      {cur && (
        <section>
          <div className="werkbalk">{editieKeuze}<p className="klein-tekst">{fmtRange(datums)}</p></div>
          {dagen.map((dag) => {
            const ss = r.shiftsPerDag.get(dag.id) || [];
            return (
              <div className="kaart dag-kaart" key={dag.id}>
                <div className="dag-rij">
                  <h3 className="dagkop los">{fmtDag(dag.datum)}</h3>
                  <Knop soort="rustig" klein alleenIcon icon="prullenbak"
                    onClick={() => setVraag({ titel: `${fmtDag(dag.datum)} verwijderen?`, tekst: "Alle diensten, aanmeldingen en indelingen van deze dag verdwijnen.",
                      ja: "Ja, verwijder de dag", doe: () => actie(doe(supabase.from("days").delete().eq("id", dag.id)), "Dag verwijderd") })}>{`${fmtDag(dag.datum)} verwijderen`}</Knop>
                </div>
                {ss.map((s) => (
                  <div className="dienst-bewerk" key={s.id}>
                    <select className="veld post" value={s.post} aria-label="Post" onChange={(e) => updShift(s, { post: e.target.value })}>
                      {[...new Set([...POSTEN, s.post])].map((p) => <option key={p}>{p}</option>)}
                    </select>
                    <span className="tijden">
                      <TijdVeld label="Begintijd" waarde={s.start_tijd} onFout={(f) => zeg(f, "fout")}
                        controle={(v) => tijdFout(v, s.eind_tijd)} onChange={(v) => updShift(s, { start_tijd: v })} />
                      <span aria-hidden="true">–</span>
                      <TijdVeld label="Eindtijd" magSluit waarde={s.eind_tijd} onFout={(f) => zeg(f, "fout")}
                        controle={(v) => tijdFout(s.start_tijd, v)} onChange={(v) => updShift(s, { eind_tijd: v })} />
                    </span>
                    <span className="plekken" title="Aantal plekken"><Icon n="mensen" />
                      <Stepper waarde={s.plekken} label="Aantal plekken" onChange={(v) => updShift(s, { plekken: v })} /></span>
                    <Knop soort="rustig" klein alleenIcon icon="prullenbak"
                      onClick={() => (bezet(s) ? setVraag({ titel: "Dienst verwijderen?", tekst: "Er staan al mensen op deze dienst. Zij krijgen geen automatisch bericht.",
                        ja: "Ja, verwijder de dienst", doe: () => actie(doe(supabase.from("shifts").delete().eq("id", s.id)), "Dienst verwijderd") })
                        : actie(doe(supabase.from("shifts").delete().eq("id", s.id)), "Dienst verwijderd"))}>{`Verwijder dienst ${tijdLabel(s)}`}</Knop>
                  </div>
                ))}
                {nieuwVoor === dag.id ? (
                  <div className="dienst-bewerk nieuw">
                    <select className="veld post" value={draft.post} aria-label="Post" onChange={(e) => setDraft({ ...draft, post: e.target.value })}>
                      {[...new Set([...POSTEN, draft.post])].map((p) => <option key={p}>{p}</option>)}</select>
                    <span className="tijden">
                      <TijdVeld label="Begintijd" waarde={draft.start} onFout={(f) => zeg(f, "fout")}
                        controle={(v) => tijdFout(v, draft.end)} onChange={(v) => setDraft({ ...draft, start: v })} />
                      <span aria-hidden="true">–</span>
                      <TijdVeld label="Eindtijd" magSluit waarde={draft.end} onFout={(f) => zeg(f, "fout")}
                        controle={(v) => tijdFout(draft.start, v)} onChange={(v) => setDraft({ ...draft, end: v })} />
                    </span>
                    <span className="plekken" title="Aantal plekken"><Icon n="mensen" />
                      <Stepper waarde={draft.cap} label="Aantal plekken" onChange={(v) => setDraft({ ...draft, cap: v })} /></span>
                    <span className="knoppen">
                      <Knop klein icon="vink" onClick={() => voegDienstToe(dag)}>Toevoegen</Knop>
                      <Knop soort="rustig" klein alleenIcon icon="kruis" onClick={() => setNieuwVoor(null)}>Annuleren</Knop>
                    </span>
                  </div>
                ) : (
                  <Knop soort="tweede" klein icon="plus" onClick={() => { setDraft(dienstVoorstel(ss)); setNieuwVoor(dag.id); }}>Dienst</Knop>
                )}
              </div>
            );
          })}
          <div className="kaart dag-nieuw">
            <input className="veld" type="date" aria-label="Datum van de nieuwe dag" value={dagDraft || nextDate(datums)} onChange={(e) => setDagDraft(e.target.value)} />
            <Knop soort="tweede" klein icon="plus" onClick={voegDagToe}>Dag</Knop>
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
  const { r, profiel, actie, zeg } = ctx;
  const [leden, setLeden] = useState(null);
  const [zoek, setZoek] = useState("");
  const [kies, setKies] = useState(null);
  const [nieuw, setNieuw] = useState(null);     // null = dicht, anders { naam, mail }
  const [mail, setMail] = useState(null);       // null = niet aan het bewerken
  const [samenvoegen, setSamenvoegen] = useState(null);
  const [naam, setNaam] = useState(null);       // null = niet aan het hernoemen
  const [weg, setWeg] = useState(false);

  useEffect(() => {
    let leeft = true;
    supabase.rpc("admin_leden").then(({ data }) => { if (leeft) setLeden(data || []); });
    return () => { leeft = false; };
  }, [r.profiles]);

  const tel = (rijen) => {
    const m = new Map();
    for (const t of rijen) m.set(t.profile_id, (m.get(t.profile_id) || 0) + 1);
    return m;
  };
  const diensten = useMemo(() => tel(r.toewijzingen), [r.toewijzingen]);
  const inConcept = useMemo(() => tel(r.concept), [r.concept]);

  if (!leden) return <div className="laden klein"><p>Laden…</p></div>;
  const lijst = leden.filter((p) => `${p.naam} ${p.email || ""}`.toLowerCase().includes(zoek.trim().toLowerCase()));
  const gekozen = kies && leden.find((p) => p.id === kies);
  const sluit = () => { setKies(null); setNaam(null); setMail(null); };

  // hoort dit adres al bij een account?
  const accountMet = (adres) => leden.find((p) => !p.handmatig && (p.email || "").toLowerCase() === adres.trim().toLowerCase());
  const geldigAdres = (adres) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adres.trim());
  const nieuwAdres = nieuw?.mail.trim() || "";
  const nieuwBezet = nieuwAdres ? accountMet(nieuwAdres) : null;
  const nieuwFout = nieuwAdres && !geldigAdres(nieuwAdres) ? "Dit e-mailadres lijkt niet te kloppen" : null;

  const voegToe = async () => {
    const { data, error } = await supabase.rpc("admin_voeg_persoon", { p_naam: nieuw.naam });
    if (error) return zeg(foutTekst(error), "fout");
    let tekst = `${nieuw.naam.trim()} toegevoegd. Je kunt deze persoon nu indelen.`;
    if (nieuwAdres) {
      const fout = await rpc("admin_zet_email", { p_profile: data, p_email: nieuwAdres });
      tekst = fout ? `${nieuw.naam.trim()} toegevoegd, maar het e-mailadres is niet gekoppeld: ${fout}`
        : `${nieuw.naam.trim()} toegevoegd. Na het eerste inloggen met dat adres is deze persoon automatisch gekoppeld.`;
    }
    zeg(tekst); setNieuw(null); await r.laad();
  };

  // adres koppelen, wijzigen of ontkoppelen bij iemand zonder account
  const zetAdres = async (adres) => {
    const { data, error } = await supabase.rpc("admin_zet_email", { p_profile: gekozen.id, p_email: adres });
    if (error) return zeg(foutTekst(error), "fout");
    zeg(data === "samengevoegd" ? `${gekozen.naam} is samengevoegd met het bestaande account`
      : data === "ontkoppeld" ? "E-mailadres ontkoppeld" : "E-mailadres gekoppeld");
    sluit(); await r.laad();
  };
  const bewaarAdres = () => {
    if (!geldigAdres(mail)) return zeg("Dit e-mailadres lijkt niet te kloppen", "fout");
    const account = accountMet(mail);
    return account ? setSamenvoegen(account) : zetAdres(mail);
  };

  return (
    <div className="kolom breed">
      <div className="kopregel">
        <input className="veld" value={zoek} onChange={(e) => setZoek(e.target.value)} aria-label="Zoek op naam of e-mailadres"
          placeholder={`Zoek (${leden.length})`} />
        <Info>Iedereen die inlogt, komt vanzelf in deze lijst. Met de plus voeg je iemand toe die niet zelf inlogt. Zo iemand krijgt geen meldingen: je deelt die persoon zelf in en informeert die persoon ook zelf. Heb je wel een e-mailadres, vul dat dan in: logt die persoon later in met dat adres, dan wordt alles automatisch gekoppeld.</Info>
        <Knop soort="primair" klein icon="plus" onClick={() => setNieuw({ naam: "", mail: "" })}>Persoon</Knop>
      </div>

      {nieuw !== null && (
        <form className="blok" onSubmit={(e) => e.preventDefault()}>
          <input className="veld" autoFocus value={nieuw.naam} placeholder="Voornaam en achternaam" aria-label="Naam van de nieuwe persoon"
            onChange={(e) => setNieuw({ ...nieuw, naam: e.target.value })} />
          <input className="veld" type="email" inputMode="email" autoComplete="off" value={nieuw.mail} placeholder="E-mailadres (mag leeg)"
            aria-label="E-mailadres van de nieuwe persoon (mag leeg)" aria-invalid={!!(nieuwFout || nieuwBezet) || undefined}
            onChange={(e) => setNieuw({ ...nieuw, mail: e.target.value })} />
          {(nieuwFout || nieuwBezet) && (
            <p className="klein-tekst fout-tekst">{nieuwFout || `Dit adres hoort al bij ${nieuwBezet.naam}, die staat al in de lijst.`}</p>
          )}
          <div className="knoppen">
            <Knop klein icon="vink" disabled={nieuw.naam.trim().length < 2 || !!nieuwFout || !!nieuwBezet} onClick={voegToe}>Toevoegen</Knop>
            <Knop soort="rustig" klein onClick={() => setNieuw(null)}>Annuleren</Knop>
          </div>
        </form>
      )}

      <ul className="kaart rijen mensen">
        {lijst.map((p) => (
          <li key={p.id}>
            <button type="button" className="mens" onClick={() => setKies(p.id)}>
              <span className="rij-naam"><b>{p.naam || "(nog geen naam)"}{p.id === profiel.id && " (jij)"}</b>
                <small>{p.handmatig ? (p.email ? <><Mail adres={p.email} /> · nog niet ingelogd</> : "Geen account, zelf informeren") : <Mail adres={p.email} />}</small></span>
              <span className="labels">
                {p.is_admin && <Label kleur="blauw">Beheerder</Label>}
                {!p.actief && <Label kleur="oranje">Geblokkeerd</Label>}
                <span className="bezet" title="Gepubliceerde diensten"><Icon n="kalender" />{diensten.get(p.id) || 0}</span>
              </span>
              <Icon n="pijl" />
            </button>
          </li>
        ))}
        {lijst.length === 0 && <li><span className="klein-tekst">Niemand gevonden.</span></li>}
      </ul>

      {gekozen && (
        <Venster titel={gekozen.naam || gekozen.email} onSluit={sluit}>
          <dl className="gegevens">
            <div><dt>{gekozen.handmatig ? "Account" : "E-mailadres"}</dt>
              <dd>{gekozen.handmatig ? "Nog geen. Krijgt geen meldingen: informeer deze persoon zelf." : <Mail adres={gekozen.email} />}</dd></div>
            {gekozen.handmatig && (
              <div><dt>Gekoppeld e-mailadres</dt>
                <dd>{gekozen.email ? <><Mail adres={gekozen.email} /> <Info>Zodra deze persoon voor het eerst inlogt met dit adres (via de link of code in de mail), wordt het account automatisch gekoppeld en blijven alle aanmeldingen en indelingen staan.</Info></> : "Geen"}</dd></div>
            )}
            <div><dt>In de lijst sinds</dt><dd>{fmtMoment(gekozen.created_at)}</dd></div>
            <div><dt>Diensten</dt><dd>{diensten.get(gekozen.id) || 0} gepubliceerd · {inConcept.get(gekozen.id) || 0} in de indeling</dd></div>
          </dl>

          {mail !== null ? (
            <form className="blok" onSubmit={(e) => { e.preventDefault(); bewaarAdres(); }}>
              <input className="veld" type="email" inputMode="email" autoComplete="off" autoFocus value={mail} placeholder="E-mailadres"
                aria-label="E-mailadres" onChange={(e) => setMail(e.target.value)} />
              <div className="knoppen">
                <Knop klein disabled={!mail.trim()} onClick={bewaarAdres}>Koppelen</Knop>
                <Knop soort="rustig" klein onClick={() => setMail(null)}>Annuleren</Knop>
              </div>
            </form>
          ) : naam !== null ? (
            <form className="blok" onSubmit={(e) => e.preventDefault()}>
              <input className="veld" autoFocus value={naam} aria-label="Naam" onChange={(e) => setNaam(e.target.value)} />
              <div className="knoppen">
                <Knop klein onClick={async () => { if (await actie(rpc("admin_hernoem", { p_profile: gekozen.id, p_naam: naam }), "Naam aangepast")) setNaam(null); }}>Opslaan</Knop>
                <Knop soort="rustig" klein onClick={() => setNaam(null)}>Annuleren</Knop>
              </div>
            </form>
          ) : (
            <div className="knoppen stapel">
              {gekozen.handmatig ? (
                <>
                  <Knop soort="tweede" breed icon="mail" onClick={() => setMail(gekozen.email || "")}>{gekozen.email ? "E-mailadres wijzigen" : "E-mailadres koppelen"}</Knop>
                  {gekozen.email && <Knop soort="tweede" breed onClick={() => zetAdres("")}>E-mailadres ontkoppelen</Knop>}
                  <Knop soort="tweede" breed icon="bewerk" onClick={() => setNaam(gekozen.naam)}>Naam wijzigen</Knop>
                </>
              ) : (
                <>
                  <Knop soort="tweede" breed icon="sleutel"
                    onClick={async () => { await actie(rpc("admin_zet_rol", { p_profile: gekozen.id, p_admin: !gekozen.is_admin }),
                      gekozen.is_admin ? "Beheerrol ingetrokken" : `${gekozen.naam} is nu beheerder`); sluit(); }}>
                    {gekozen.is_admin ? "Beheerrol intrekken" : "Maak beheerder"}
                  </Knop>
                  <Knop soort="tweede" breed
                    onClick={async () => { await actie(rpc("admin_zet_actief", { p_profile: gekozen.id, p_actief: !gekozen.actief }),
                      gekozen.actief ? "Toegang geblokkeerd" : "Toegang hersteld"); sluit(); }}>
                    {gekozen.actief ? "Toegang blokkeren" : "Toegang teruggeven"}
                  </Knop>
                </>
              )}
              {gekozen.id !== profiel.id && (
                <Knop soort="gevaar" breed icon="prullenbak" onClick={() => setWeg(true)}>Verwijderen</Knop>
              )}
            </div>
          )}
          {!gekozen.handmatig && (
            <p className="klein-tekst">Blokkeren houdt iemand buiten; indelingen blijven staan. Verwijderen wist ook het account, maar iemand kan zich daarna opnieuw registreren.</p>
          )}
        </Venster>
      )}

      {samenvoegen && gekozen && (
        <Bevestig titel={`Samenvoegen met ${samenvoegen.naam}?`} ja="Ja, voeg samen"
          tekst={`Dit adres hoort al bij het account van ${samenvoegen.naam}. Alle aanmeldingen, indelingen en opmerkingen van ${gekozen.naam} worden overgezet naar dat account, en ${gekozen.naam} verdwijnt als aparte persoon. Dit kan niet ongedaan worden gemaakt.`}
          onJa={() => zetAdres(mail)} onSluit={() => setSamenvoegen(null)} />
      )}

      {weg && gekozen && (
        <Bevestig gevaar titel={`${gekozen.naam || gekozen.email} verwijderen?`} ja="Ja, verwijder"
          tekst={`Alle aanmeldingen, indelingen en opmerkingen van deze persoon verdwijnen${gekozen.handmatig ? "" : ", net als het account"}. `
            + `${(diensten.get(gekozen.id) || 0) > 0 ? `Let op: ${meervoud(diensten.get(gekozen.id), "gepubliceerde dienst komt", "gepubliceerde diensten komen")} weer open te staan, zonder melding. ` : ""}`
            + "Dit kan niet ongedaan worden gemaakt."}
          onJa={async () => { if (await actie(rpc("admin_verwijder", { p_profile: gekozen.id }), `${gekozen.naam || "Persoon"} verwijderd`)) sluit(); }}
          onSluit={() => setWeg(false)} />
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
