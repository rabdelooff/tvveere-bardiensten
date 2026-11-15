import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { doe, rpc } from "./data";
import { isGeinstalleerd, isIOS, pushStatus, zetPushAan, zetPushUit } from "./push";
import { fmtDag, fmtDagKort, fmtMoment, foutTekst, icsHref, opsomming, tijdLabel, vandaag, voornaam } from "./util";
import { Bevestig, Icon, Info, Knop, Label, Leeg, Venster } from "./ui";

/* --- gedeeld: alle komende diensten van open edities, op volgorde --- */

function useKomend(r) {
  return useMemo(() => {
    const open = new Set(r.editions.filter((e) => e.status === "open").map((e) => e.id));
    const nu = vandaag();
    return r.days.filter((d) => open.has(d.edition_id) && d.datum >= nu)
      .sort((a, b) => a.datum.localeCompare(b.datum))
      .map((dag) => ({ dag, shifts: r.shiftsPerDag.get(dag.id) || [] }))
      .filter((x) => x.shifts.length);
  }, [r.editions, r.days, r.shiftsPerDag]);
}

function toestand(r, s, ik) {
  const toew = r.toewPerShift.get(s.id) || [];
  const mijnToew = toew.find((t) => t.profile_id === ik) || null;
  const mijnAanm = (r.aanmPerShift.get(s.id) || []).find((a) => a.profile_id === ik) || null;
  const zoekers = toew.filter((t) => t.status === "zoekt_vervanger" && t.profile_id !== ik);
  return { toew, mijnToew, mijnAanm, zoekers, vrij: Math.max(0, s.plekken - toew.length) };
}

/* --- kaart van één dienst --- */

function DienstKaart({ s, dag, ctx, toonDag }) {
  const { r, profiel, actie } = ctx;
  const ik = profiel.id;
  const { toew, mijnToew, mijnAanm, zoekers, vrij } = toestand(r, s, ik);
  const [vraag, setVraag] = useState(false);
  const promo = !!s.gepromoot_at && vrij > 0 && !mijnToew;
  const namen = toew.map((t) => (t.profile_id === ik ? "jij" : r.naam(t.profile_id)));

  const aanmelden = () => actie(
    doe(supabase.from("aanmeldingen").insert({ shift_id: s.id, profile_id: ik })),
    "Je bent aangemeld. De beheerder deelt de diensten in.");
  const afmelden = () => actie(
    doe(supabase.from("aanmeldingen").delete().eq("id", mijnAanm.id)), "Je aanmelding is ingetrokken");

  const vol = vrij === 0;

  return (
    <article className={`kaart dienst${mijnToew ? " van-mij" : ""}${promo || zoekers.length ? " hulp" : ""}`}>
      <div className="dienst-rij">
        <div className="dienst-info">
          {toonDag && <div className="dienst-dag">{fmtDag(dag.datum)}</div>}
          <div className="dienst-kop">
            <span className="dienst-tijd">{tijdLabel(s)}</span>
            {s.post !== "Bar" && <Label kleur="blauw">{s.post}</Label>}
            <span className={`bezet${vol ? " vol" : promo ? " oranje" : ""}`} title={`${toew.length} van ${s.plekken} plekken bezet`}>
              <Icon n="mensen" />{toew.length}/{s.plekken}<span className="sr"> plekken bezet</span>
            </span>
          </div>
          <p className="wie">{namen.length ? opsomming(namen) : "Nog niemand ingedeeld"}</p>
        </div>
        <div className="dienst-actie">
          {mijnToew ? <Label kleur="groen"><Icon n="vink" /> Ingedeeld</Label>
            : mijnAanm ? (
              <>
                <span className="status-ok" title="Je hoort het als je bent ingedeeld"><Icon n="vink" /> Aangemeld</span>
                <Knop soort="rustig" klein alleenIcon icon="kruis" onClick={() => setVraag(true)}>Aanmelding intrekken</Knop>
              </>
            ) : vol && zoekers.length > 0 ? null : (
              <Knop soort={vol ? "tweede" : "primair"} klein icon="plus" onClick={aanmelden}
                title={vol ? "Aanmelden als reserve" : "Ik kan deze dienst"}>
                {vol ? "Reserve" : "Ik kan"}
              </Knop>
            )}
        </div>
      </div>

      {promo && (
        <p className="oproep"><Icon n="megafoon" /> <span><b>Hulp gezocht.</b> {s.promo_tekst || "Kun jij deze dienst draaien?"}</span></p>
      )}

      {zoekers.map((t) => {
        const aangeboden = (r.aanbodPerToew.get(t.id) || []).some((a) => a.profile_id === ik);
        return (
          <div className="blok oranje" key={t.id}>
            <p><Icon n="ruil" /> <span><b>{r.naam(t.profile_id)}</b> zoekt een vervanger.</span></p>
            {mijnToew ? null : aangeboden ? (
              <div className="rij-status">
                <span className="status-ok"><Icon n="vink" /> Aangeboden <Info>De beheerder beslist wie de dienst overneemt. Je krijgt bericht.</Info></span>
                <Knop soort="rustig" klein onClick={() => actie(rpc("trek_aanbod_in", { p_toewijzing: t.id }), "Aanbod ingetrokken")}>
                  Toch niet
                </Knop>
              </div>
            ) : (
              <Knop soort="accent" klein icon="ruil"
                onClick={() => actie(rpc("bied_aan", { p_toewijzing: t.id }), "Bedankt! De beheerder krijgt bericht.")}>
                Ik neem over
              </Knop>
            )}
          </div>
        );
      })}

      {vraag && (
        <Bevestig titel="Aanmelding intrekken?" ja="Ja, ik kan toch niet" nee="Nee, laat staan"
          tekst={`${fmtDag(dag.datum)}, ${tijdLabel(s)}`} onJa={afmelden} onSluit={() => setVraag(false)} />
      )}
    </article>
  );
}

/* --- kaart van een dienst waarop je bent ingedeeld --- */

function MijnDienst({ s, dag, t, ctx }) {
  const { r, profiel, actie } = ctx;
  const [vraag, setVraag] = useState(false);
  const zoekt = t.status === "zoekt_vervanger";
  const collegas = (r.toewPerShift.get(s.id) || []).filter((x) => x.profile_id !== profiel.id).map((x) => r.naam(x.profile_id));
  const editie = r.editieVanShift(s);
  const aanbod = (r.aanbodPerToew.get(t.id) || []).length;
  const deel = `Wie kan mijn bardienst bij TV Veere overnemen?\n\n${fmtDag(dag.datum)}, ${tijdLabel(s)}\n\n`
    + `Meld je in de app, dan regelt de beheerder de rest:\n${window.location.origin}/#/diensten`;

  return (
    <article className={`kaart dienst van-mij${zoekt ? " hulp" : ""}`}>
      <div className="dienst-rij">
        <div className="dienst-info">
          <div className="dienst-dag">{fmtDag(dag.datum)}</div>
          <div className="dienst-kop">
            <span className="dienst-tijd">{tijdLabel(s)}</span>
            {s.post !== "Bar" && <Label kleur="blauw">{s.post}</Label>}
          </div>
          <p className="wie">{collegas.length ? <>Met {opsomming(collegas)}</> : "Je staat (nog) alleen"}</p>
        </div>
        {!zoekt && (
          <div className="dienst-actie">
            <a className="knop tweede klein icoon" href={icsHref([{ datum: dag.datum, s }], editie?.naam || "TV Veere")}
              download={`bardienst-${dag.datum}.ics`} title="Zet in mijn agenda" aria-label="Zet in mijn agenda"><Icon n="kalender" /></a>
            <Knop soort="rustig" klein icon="ruil" onClick={() => setVraag(true)} title="Ik kan toch niet: zoek een vervanger">Kan niet</Knop>
          </div>
        )}
      </div>

      {zoekt && (
        <div className="blok oranje">
          <p><Icon n="ruil" /> <span className="kop-tekst"><b>Je zoekt een vervanger.</b>{aanbod > 0 && " Er heeft zich al iemand gemeld."}</span>
            <Info>Tot de beheerder een vervanger heeft goedgekeurd, blijft deze dienst van jou.</Info></p>
          <div className="knoppen">
            <a className="knop whatsapp klein" target="_blank" rel="noreferrer"
              href={`https://wa.me/?text=${encodeURIComponent(deel)}`}><Icon n="bericht" /><span>WhatsApp</span></a>
            <Knop soort="tweede" klein onClick={() => actie(rpc("houd_dienst", { p_toewijzing: t.id }), "Fijn, je draait de dienst zelf")}>
              Ik kan toch wel
            </Knop>
          </div>
        </div>
      )}

      {vraag && (
        <Bevestig titel="Vervanger zoeken?" ja="Ja, zoek een vervanger" nee="Nee, ik draai de dienst"
          tekst="Alle vrijwilligers krijgen een bericht dat je iemand zoekt. De dienst blijft van jou tot de beheerder een vervanger heeft goedgekeurd."
          onJa={() => actie(rpc("zoek_vervanger", { p_toewijzing: t.id }), "Iedereen heeft een bericht gekregen")}
          onSluit={() => setVraag(false)} />
      )}
    </article>
  );
}

/* --- algemene opmerking voor de beheerder, per open editie --- */

const OPM_MAX = 500;

function OpmerkingKaart({ editie, ctx, toonEditie }) {
  const { r, profiel, actie } = ctx;
  const huidig = r.opmerking(editie.id, profiel.id);
  const [tekst, setTekst] = useState(null);   // null = niet aan het bewerken
  const [vraag, setVraag] = useState(false);
  const veldId = `opm-${editie.id}`;

  const bewaar = async () => {
    if (!tekst.trim()) return setTekst(null);
    if (await actie(rpc("zet_opmerking", { p_edition: editie.id, p_tekst: tekst }), "Opgeslagen. De beheerder ziet je opmerking bij het indelen.")) setTekst(null);
  };

  return (
    <section className="kaart opmerking">
      <div className="kopregel">
        <h2 className="kaart-titel"><Icon n="notitie" /> Opmerking voor beheerder{toonEditie && ` · ${editie.naam}`}</h2>
        <Info>Wil je iets kwijt over je aanmeldingen? Bijvoorbeeld dat je je voor meerdere diensten aanmeldt, maar er maximaal één wilt draaien. Alleen de beheerders lezen dit.</Info>
        {tekst === null && (huidig ? (
          <span className="kopregel-acties">
            <Knop soort="rustig" klein alleenIcon icon="bewerk" onClick={() => setTekst(huidig)}>Opmerking wijzigen</Knop>
            <Knop soort="rustig" klein alleenIcon icon="prullenbak" onClick={() => setVraag(true)}>Opmerking verwijderen</Knop>
          </span>
        ) : (
          <span className="kopregel-acties">
            <Knop soort="tweede" klein alleenIcon icon="plus" onClick={() => setTekst("")}>Opmerking toevoegen</Knop>
          </span>
        ))}
      </div>
      {tekst !== null ? (
        <form className="veld-groep" onSubmit={(e) => { e.preventDefault(); bewaar(); }}>
          <textarea id={veldId} className="veld" rows={3} maxLength={OPM_MAX} autoFocus value={tekst}
            aria-label="Wat moet de beheerder weten bij het indelen?"
            placeholder="Bijvoorbeeld: ik meld me aan voor vier diensten, maar wil er maximaal één draaien."
            onChange={(e) => setTekst(e.target.value)} />
          <div className="knoppen">
            <Knop klein onClick={bewaar} disabled={!tekst.trim()}>Opslaan</Knop>
            <Knop soort="rustig" klein onClick={() => setTekst(null)}>Annuleren</Knop>
            <span className="klein-tekst teller-tekst">{tekst.length}/{OPM_MAX}</span>
          </div>
        </form>
      ) : huidig ? <p className="opm-tekst">{huidig}</p> : null}
      {vraag && (
        <Bevestig titel="Opmerking verwijderen?" ja="Ja, verwijder" nee="Nee, laat staan" tekst={huidig}
          onJa={() => actie(rpc("zet_opmerking", { p_edition: editie.id, p_tekst: "" }), "Opmerking verwijderd")}
          onSluit={() => setVraag(false)} />
      )}
    </section>
  );
}

function Opmerkingen({ komend, ctx, alleenMet }) {
  const { r, profiel } = ctx;
  const edities = [...new Set(komend.map(({ dag }) => dag.edition_id))].map((id) => r.editieVan.get(id)).filter(Boolean)
    .filter((e) => !alleenMet || r.opmerking(e.id, profiel.id));
  return edities.map((e) => <OpmerkingKaart key={e.id} editie={e} ctx={ctx} toonEditie={edities.length > 1} />);
}

/* --- installeren en meldingen aanzetten --- */

let installVraag = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installVraag = e; window.dispatchEvent(new Event("tvv-install")); });
  window.addEventListener("appinstalled", () => { installVraag = null; window.dispatchEvent(new Event("tvv-install")); });
}

function useAppStatus() {
  const [st, setSt] = useState({ push: null, geinstalleerd: isGeinstalleerd(), kanVragen: !!installVraag });
  const ververs = async () => setSt({ push: await pushStatus(), geinstalleerd: isGeinstalleerd(), kanVragen: !!installVraag });
  useEffect(() => {
    ververs();
    window.addEventListener("tvv-install", ververs);
    return () => window.removeEventListener("tvv-install", ververs);
  }, []);
  return [st, ververs];
}

function InstallUitleg({ onSluit }) {
  const ios = isIOS();
  return (
    <Venster titel="Zet de app op je telefoon" onSluit={onSluit}>
      {ios ? (
        <ol className="stappen">
          <li>Open deze pagina in <b>Safari</b> (het blauwe kompas).</li>
          <li>Tik onderaan op het <b>deel-icoon</b> <Icon n="delen" /> (vierkantje met pijl omhoog).</li>
          <li>Kies <b>Zet op beginscherm</b>.</li>
          <li>Tik rechtsboven op <b>Voeg toe</b>.</li>
          <li>Open de app voortaan via het nieuwe icoon en log daar één keer in.</li>
        </ol>
      ) : (
        <ol className="stappen">
          <li>Tik rechtsboven in de browser op de <b>drie puntjes</b>.</li>
          <li>Kies <b>App installeren</b> of <b>Toevoegen aan startscherm</b>.</li>
          <li>Open de app voortaan via het nieuwe icoon.</li>
        </ol>
      )}
      <Knop breed onClick={onSluit}>Begrepen</Knop>
    </Venster>
  );
}

function AppInstellen({ ctx, compact }) {
  const { zeg } = ctx;
  const [st, ververs] = useAppStatus();
  const [uitleg, setUitleg] = useState(false);
  const [weg, setWeg] = useState(() => Number(localStorage.getItem("tvveere.later") || 0) > Date.now());
  if (st.push === null) return null;

  const installeer = async () => {
    if (installVraag) { installVraag.prompt(); await installVraag.userChoice.catch(() => {}); installVraag = null; ververs(); }
    else setUitleg(true);
  };
  const pushAan = async () => {
    try { await zetPushAan(); zeg("Meldingen staan aan"); } catch (e) { zeg(foutTekst(e), "fout"); }
    ververs();
  };
  const pushUit = async () => { await zetPushUit(); zeg("Meldingen staan uit"); ververs(); };

  const moetInstalleren = !st.geinstalleerd;
  const pushKlaar = st.push === "aan";
  if (compact && ((!moetInstalleren && pushKlaar) || weg || st.push === "niet-mogelijk" && !moetInstalleren)) return null;

  return (
    <section className={compact ? "kaart instel" : "instel"}>
      {compact && <h2 className="kaart-titel">Maak het jezelf makkelijk</h2>}
      <div className="instel-rij">
        <span className={`bol${st.geinstalleerd ? " klaar" : ""}`}>{st.geinstalleerd ? <Icon n="vink" /> : "1"}</span>
        <div>
          <b>App op je telefoon</b>
          <p>{st.geinstalleerd ? "De app staat op dit toestel." : "Dan vind je het rooster altijd terug, met één tik."}</p>
          {!st.geinstalleerd && <Knop soort="tweede" icon="download" onClick={installeer}>Zet op mijn telefoon</Knop>}
        </div>
      </div>
      <div className="instel-rij">
        <span className={`bol${pushKlaar ? " klaar" : ""}`}>{pushKlaar ? <Icon n="vink" /> : "2"}</span>
        <div>
          <b>Meldingen</b>
          <p>
            {st.push === "aan" && "Je krijgt een bericht als je bent ingedeeld, een dag voor je dienst en als er hulp nodig is."}
            {st.push === "uit" && "Krijg een bericht als je bent ingedeeld, een dag voor je dienst en als er hulp nodig is."}
            {st.push === "eerst-installeren" && "Op een iPhone werken meldingen pas nadat je de app op je beginscherm hebt gezet (stap 1)."}
            {st.push === "geblokkeerd" && "Meldingen zijn op dit toestel geblokkeerd. Zet ze aan bij de instellingen van je telefoon of browser."}
            {st.push === "niet-mogelijk" && "Dit toestel of deze browser ondersteunt geen meldingen."}
          </p>
          {st.push === "uit" && <Knop soort="primair" icon="bel" onClick={pushAan}>Zet meldingen aan</Knop>}
          {st.push === "aan" && !compact && <Knop soort="rustig" onClick={pushUit}>Zet meldingen uit</Knop>}
        </div>
      </div>
      {compact && (
        <button type="button" className="tekstknop" onClick={() => {
          localStorage.setItem("tvveere.later", String(Date.now() + 7 * 864e5)); setWeg(true);
        }}>Nu even niet</button>
      )}
      {uitleg && <InstallUitleg onSluit={() => setUitleg(false)} />}
    </section>
  );
}

/* --- Mijn diensten --- */

export function Mijn(ctx) {
  const { r, profiel, ga } = ctx;
  const komend = useKomend(r);
  const ik = profiel.id;

  const { mijn, aangemeld, hulp } = useMemo(() => {
    const mijn = [], aangemeld = [], hulp = [];
    for (const { dag, shifts } of komend) for (const s of shifts) {
      const t = toestand(r, s, ik);
      if (t.mijnToew) mijn.push({ dag, s, t: t.mijnToew });
      else {
        if (t.mijnAanm) aangemeld.push({ dag, s });
        if (t.zoekers.length || (s.gepromoot_at && t.vrij > 0 && !t.mijnAanm)) hulp.push({ dag, s });
      }
    }
    return { mijn, aangemeld, hulp };
  }, [komend, r, ik]);

  const editieNaam = mijn.length ? r.editieVanShift(mijn[0].s)?.naam || "TV Veere" : "";

  return (
    <div className="kolom">
      <p className="groet">Hallo {voornaam(profiel.naam)}!</p>

      <AppInstellen ctx={ctx} compact />

      {hulp.length > 0 && (
        <section>
          <h2 className="sectie oranje"><Icon n="megafoon" /> Hulp gezocht</h2>
          {hulp.map(({ dag, s }) => <DienstKaart key={s.id} s={s} dag={dag} ctx={ctx} toonDag />)}
        </section>
      )}

      <section>
        <h2 className="sectie">Je bent ingedeeld{mijn.length > 0 && ` (${mijn.length})`}</h2>
        {mijn.length === 0 ? (
          <Leeg titel="Nog geen diensten">
            {aangemeld.length ? "Zodra de beheerder het rooster publiceert, zie je hier je diensten."
              : "Meld je aan voor de diensten waarop je kunt. De beheerder deelt daarna in."}
          </Leeg>
        ) : mijn.map(({ dag, s, t }) => <MijnDienst key={s.id} s={s} dag={dag} t={t} ctx={ctx} />)}
        {mijn.length > 1 && (
          <a className="knop tweede klein" href={icsHref(mijn.map(({ dag, s }) => ({ datum: dag.datum, s })), editieNaam)}
            download="bardiensten-tvveere.ics"><Icon n="kalender" /><span>Alle {mijn.length} in mijn agenda</span></a>
        )}
      </section>

      {aangemeld.length > 0 && (
        <section>
          <h2 className="sectie"><span className="kop-tekst">Aangemeld ({aangemeld.length})</span>
            <Info>Voor deze diensten heb je je aangemeld, maar je bent nog niet ingedeeld. Je krijgt bericht zodra de beheerder het rooster heeft gemaakt.</Info></h2>
          <ul className="kaart lijst">
            {aangemeld.map(({ dag, s }) => (
              <li key={s.id}><Icon n="klok" /><span><b>{fmtDagKort(dag.datum)}</b> · {tijdLabel(s)}{s.post !== "Bar" && ` · ${s.post}`}</span></li>
            ))}
          </ul>
        </section>
      )}

      <Opmerkingen komend={komend} ctx={ctx} alleenMet={aangemeld.length === 0} />

      <Knop soort={mijn.length || aangemeld.length ? "tweede" : "primair"} breed icon="lijst" onClick={() => ga("diensten")}>
        Alle diensten
      </Knop>
    </div>
  );
}

/* --- Alle diensten --- */

export function Diensten(ctx) {
  const { r, profiel } = ctx;
  const komend = useKomend(r);
  const [filter, setFilter] = useState("alle");
  const ik = profiel.id;

  const telling = useMemo(() => {
    let nodig = 0;
    for (const { shifts } of komend) for (const s of shifts) if (toestand(r, s, ik).vrij > 0) nodig++;
    return nodig;
  }, [komend, r, ik]);

  const lijst = komend.map(({ dag, shifts }) => ({
    dag, shifts: filter === "alle" ? shifts : shifts.filter((s) => {
      const t = toestand(r, s, ik);
      return t.vrij > 0 || t.zoekers.length > 0;
    }),
  })).filter((x) => x.shifts.length);

  if (!komend.length) return (
    <Leeg titel="Geen rooster open">Er staat op dit moment geen toernooi open om je voor aan te melden. Je krijgt bericht zodra dat verandert.</Leeg>
  );

  const edities = [...new Set(komend.map(({ dag }) => r.editieVan.get(dag.edition_id)?.naam))].filter(Boolean);

  return (
    <div className="kolom">
      <div className="kopregel">
        <b>{edities.join(" · ")}</b>
        <Info>Tik op <b>Ik kan</b> bij elke dienst waarop je kunt. De beheerder maakt daarna het rooster en laat je weten wanneer je bent ingedeeld. Het cijfer bij het poppetje laat zien hoeveel plekken al bezet zijn.</Info>
      </div>
      <Opmerkingen komend={komend} ctx={ctx} />
      <div className="keuze" role="group" aria-label="Welke diensten wil je zien">
        <button type="button" aria-pressed={filter === "alle"} onClick={() => setFilter("alle")}>Alle</button>
        <button type="button" aria-pressed={filter === "nodig"} onClick={() => setFilter("nodig")}>Hulp nodig ({telling})</button>
      </div>
      {lijst.length === 0 && <Leeg titel="Alles is rond">Voor alle diensten zijn genoeg mensen ingedeeld.</Leeg>}
      {lijst.map(({ dag, shifts }) => (
        <section key={dag.id}>
          <h2 className="dagkop">{fmtDag(dag.datum)}</h2>
          {shifts.map((s) => <DienstKaart key={s.id} s={s} dag={dag} ctx={ctx} />)}
        </section>
      ))}
    </div>
  );
}

/* --- Meldingen --- */

export function Meldingen({ r, ga }) {
  const ongelezen = r.meldingen.some((m) => !m.gelezen_at);
  const [nieuw] = useState(() => new Set(r.meldingen.filter((m) => !m.gelezen_at).map((m) => m.id)));
  useEffect(() => {
    if (!ongelezen) return undefined;
    const t = setTimeout(() => { supabase.rpc("markeer_gelezen").then(() => r.laad()); }, 1200);
    return () => clearTimeout(t);
  }, [ongelezen]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!r.meldingen.length) return <Leeg titel="Nog geen meldingen">Hier zie je berichten over je diensten.</Leeg>;
  const icoon = { rooster: "kalender", herinnering: "klok", promotie: "megafoon", vervanger: "ruil", aanbod: "ruil", opmerking: "notitie" };
  return (
    <ul className="meldingen">
      {r.meldingen.map((m) => (
        <li key={m.id}>
          <button type="button" className={`kaart melding${nieuw.has(m.id) ? " nieuw" : ""}`}
            onClick={() => ga((m.url || "/#/mijn").replace(/^\/?#\//, ""))}>
            <span className="melding-icoon"><Icon n={icoon[m.soort] || "bel"} /></span>
            <span className="melding-tekst">
              <b>{m.titel}</b>
              <span>{m.tekst}</span>
              <time>{fmtMoment(m.created_at)}</time>
            </span>
            <Icon n="pijl" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/* --- Instellingen --- */

export function Meer(ctx) {
  const { profiel, email, uitloggen, laadProfiel, zeg } = ctx;
  const [naam, setNaam] = useState(profiel.naam);
  const [bewerk, setBewerk] = useState(false);

  const bewaarNaam = async () => {
    const fout = await rpc("zet_naam", { p_naam: naam });
    if (fout) return zeg(fout, "fout");
    await laadProfiel(); setBewerk(false); zeg("Naam aangepast");
  };
  const zetVoorkeur = async (aan) => {
    const fout = await rpc("zet_meld_aanmeldingen", { p_aan: aan });
    if (fout) return zeg(fout, "fout");
    await laadProfiel();
  };

  return (
    <div className="kolom">
      <section className="kaart">
        <h2 className="kaart-titel">Jouw gegevens</h2>
        {bewerk ? (
          <form className="veld-groep" onSubmit={(e) => { e.preventDefault(); bewaarNaam(); }}>
            <label htmlFor="naam">Voornaam en achternaam</label>
            <input id="naam" className="veld" value={naam} autoComplete="name" onChange={(e) => setNaam(e.target.value)} />
            <div className="knoppen">
              <Knop onClick={bewaarNaam}>Opslaan</Knop>
              <Knop soort="rustig" onClick={() => { setNaam(profiel.naam); setBewerk(false); }}>Annuleren</Knop>
            </div>
          </form>
        ) : (
          <dl className="gegevens">
            <div><dt>Naam</dt><dd>{profiel.naam}</dd></div>
            <div><dt>E-mailadres</dt><dd>{email}</dd></div>
            {profiel.is_admin && <div><dt>Rol</dt><dd>Beheerder</dd></div>}
          </dl>
        )}
        {!bewerk && <Knop soort="tweede" icon="bewerk" onClick={() => setBewerk(true)}>Naam wijzigen</Knop>}
      </section>

      <section className="kaart">
        <h2 className="kaart-titel">App en meldingen</h2>
        <AppInstellen ctx={ctx} />
      </section>

      {profiel.is_admin && (
        <section className="kaart">
          <h2 className="kaart-titel">Meldingen voor beheerders</h2>
          <label className="schakel">
            <input type="checkbox" checked={profiel.meld_aanmeldingen} onChange={(e) => zetVoorkeur(e.target.checked)} />
            <span>Stuur mij een melding bij elke nieuwe of ingetrokken aanmelding</span>
          </label>
          <p className="klein-tekst">Berichten over vervangers en opmerkingen van vrijwilligers krijg je altijd.</p>
        </section>
      )}

      <Knop soort="tweede" breed icon="uit" onClick={uitloggen}>Uitloggen</Knop>
      <p className="klein-tekst midden">Bardiensten · Tennis Vereniging Veere</p>
    </div>
  );
}
