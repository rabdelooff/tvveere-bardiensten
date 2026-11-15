import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { configOk, supabase } from "./supabase";
import { useRooster } from "./data";
import { syncPush } from "./push";
import { foutTekst } from "./util";
import { Icon, Knop, Logo, Melding } from "./ui";
import { Login, NaamVragen, Scherm } from "./Login";
import { Diensten, Meer, Meldingen, Mijn } from "./Vrijwilliger";
import { Beheer } from "./Beheer";

/* TV Veere — bardiensten.
   Vrijwilligers melden zich aan, de beheerder deelt in en publiceert. */

const ROUTES = ["mijn", "diensten", "meldingen", "meer", "beheer"];
const leesRoute = () => {
  const h = window.location.hash;
  if (!h.startsWith("#/")) return ["mijn"];
  const delen = h.slice(2).split("/").filter(Boolean);
  return ROUTES.includes(delen[0]) ? delen : ["mijn"];
};

const linkFoutUitUrl = () => {
  const h = window.location.hash;
  if (!/error(_code|_description)?=/.test(h)) return null;
  window.history.replaceState(null, "", window.location.pathname);
  return "Deze inloglink is verlopen of al gebruikt. Vraag hieronder een nieuwe aan.";
};

export default function App() {
  const [linkFout] = useState(linkFoutUitUrl);
  const [sessie, setSessie] = useState(undefined);      // undefined = nog aan het kijken
  const [profiel, setProfiel] = useState(null);
  const [profielFout, setProfielFout] = useState(null);
  const [route, setRoute] = useState(leesRoute);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessie(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSessie(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const op = () => { setRoute(leesRoute()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", op);
    return () => window.removeEventListener("hashchange", op);
  }, []);

  const uid = sessie?.user?.id || null;
  const laadProfiel = useCallback(async () => {
    const { data, error } = await supabase.rpc("start_profiel");
    if (error) { setProfielFout(foutTekst(error)); return; }
    setProfielFout(null); setProfiel(data);
  }, []);

  useEffect(() => {
    if (!uid) { setProfiel(null); return; }
    laadProfiel().then(syncPush);
  }, [uid, laadProfiel]);

  const r = useRooster(profiel?.actief && profiel?.naam ? profiel : null);

  // rol of toegang gewijzigd door een beheerder: profiel opnieuw ophalen
  const ikInLijst = r.profiles.find((p) => p.id === uid);
  useEffect(() => {
    if (ikInLijst && profiel && (ikInLijst.is_admin !== profiel.is_admin || ikInLijst.actief !== profiel.actief
      || ikInLijst.naam !== profiel.naam || ikInLijst.meld_aanmeldingen !== profiel.meld_aanmeldingen)) laadProfiel();
  }, [ikInLijst, profiel, laadProfiel]);

  const zeg = useCallback((tekst, soort = "ok") => {
    clearTimeout(toastTimer.current);
    setToast({ tekst, soort });
    toastTimer.current = setTimeout(() => setToast(null), soort === "fout" ? 6000 : 3500);
  }, []);

  const ga = useCallback((pad) => { window.location.hash = `#/${pad}`; }, []);
  const uitloggen = useCallback(async () => { await supabase.auth.signOut(); setProfiel(null); }, []);

  /* Voert een actie uit, toont het resultaat en ververst het rooster. */
  const actie = useCallback(async (belofte, okTekst) => {
    const fout = await belofte;
    if (fout) { zeg(fout, "fout"); return false; }
    if (okTekst) zeg(okTekst);
    await r.laad();
    return true;
  }, [zeg, r.laad]);   // eslint-disable-line react-hooks/exhaustive-deps

  const ongelezen = useMemo(() => r.meldingen.filter((m) => !m.gelezen_at).length, [r.meldingen]);

  /* --- schermen vóór de app zelf --- */

  if (!configOk) return (
    <Scherm titel="Nog niet ingesteld">
      <p className="uitleg">De koppeling met de database ontbreekt (VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY).</p>
    </Scherm>
  );
  if (sessie === undefined) return <div className="laden"><Logo size={112} /><p>Even geduld…</p></div>;
  if (!sessie) return <Login linkFout={linkFout} />;
  if (profielFout) return (
    <Scherm titel="Dat lukte niet">
      <Melding soort="fout">{profielFout}</Melding>
      <div className="knoppen stapel">
        <Knop breed onClick={laadProfiel}>Opnieuw proberen</Knop>
        <Knop soort="rustig" breed onClick={uitloggen}>Uitloggen</Knop>
      </div>
    </Scherm>
  );
  if (!profiel) return <div className="laden"><Logo size={112} /><p>Even geduld…</p></div>;
  if (!profiel.actief) return (
    <Scherm titel="Geen toegang">
      <p className="uitleg">Je account is geblokkeerd. Neem contact op met de beheerder van de bardiensten.</p>
      <Knop soort="rustig" breed onClick={uitloggen}>Uitloggen</Knop>
    </Scherm>
  );
  if (!profiel.naam) return <NaamVragen onKlaar={laadProfiel} onUit={uitloggen} />;

  /* --- de app --- */

  const pagina = route[0] === "beheer" && !profiel.is_admin ? "mijn" : route[0];
  const ctx = { r, profiel, zeg, ga, actie, uitloggen, laadProfiel, email: sessie.user.email, route };

  const tabs = [
    ["mijn", "Mijn diensten", "kalender"],
    ["diensten", "Alle diensten", "lijst"],
    ...(profiel.is_admin ? [["beheer", "Beheer", "sleutel"]] : []),
    ["meldingen", "Meldingen", "bel"],
    ["meer", "Instellingen", "persoon"],
  ];
  const titel = tabs.find((t) => t[0] === pagina)?.[1] || "Bardiensten";

  return (
    <div className={`app${pagina === "beheer" ? " is-beheer" : ""}`}>
      <a className="skip" href="#inhoud">Naar de inhoud</a>

      <header className="top">
        <Logo size={40} />
        <div className="top-tekst">
          <div className="eyebrow">TV Veere · Bardiensten</div>
          <h1>{titel}</h1>
        </div>
        <button type="button" className="rond licht alleen-mobiel" onClick={() => ga("meldingen")}
          aria-label={ongelezen ? `Meldingen, ${ongelezen} nieuw` : "Meldingen"}>
          <Icon n="bel" />{ongelezen > 0 && <i className="stip">{ongelezen > 9 ? "9+" : ongelezen}</i>}
        </button>
      </header>

      <nav className="nav" aria-label="Hoofdmenu">
        <div className="nav-merk"><Logo size={48} /><div><div className="eyebrow">TV Veere</div><b>Bardiensten</b></div></div>
        {tabs.map(([k, label, icon]) => (
          <a key={k} href={`#/${k}`} className={`nav-item${k === "meldingen" ? " alleen-desktop" : ""}`}
            aria-current={pagina === k ? "page" : undefined}>
            <span className="nav-icoon"><Icon n={icon} size="1.5em" />
              {k === "meldingen" && ongelezen > 0 && <i className="stip">{ongelezen > 9 ? "9+" : ongelezen}</i>}</span>
            <span>{label}</span>
          </a>
        ))}
        <div className="nav-voet">{profiel.naam}</div>
      </nav>

      <main id="inhoud" className="inhoud">
        {r.fout && <Melding soort="fout">{r.fout}</Melding>}
        {r.laden ? <div className="laden klein"><p>Rooster laden…</p></div>
          : pagina === "mijn" ? <Mijn {...ctx} />
            : pagina === "diensten" ? <Diensten {...ctx} />
              : pagina === "meldingen" ? <Meldingen {...ctx} />
                : pagina === "meer" ? <Meer {...ctx} />
                  : <Beheer {...ctx} />}
      </main>

      {toast && <div className={`toast ${toast.soort}`} role="status">{toast.tekst}</div>}
    </div>
  );
}
