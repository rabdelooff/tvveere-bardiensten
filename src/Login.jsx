import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { foutTekst } from "./util";
import { Icon, Knop, Logo, Melding } from "./ui";

const Kader = ({ children }) => (
  <div className="login">
    <div className="login-kop">
      <Logo size={64} />
      <div>
        <div className="eyebrow">Tennis Vereniging Veere</div>
        <h1>Bardiensten</h1>
      </div>
    </div>
    <div className="login-kaart">{children}</div>
  </div>
);

export function Login({ linkFout }) {
  const [stap, setStap] = useState("email");
  const [email, setEmail] = useState(() => localStorage.getItem("tvveere.email") || "");
  const [code, setCode] = useState("");
  const [fout, setFout] = useState(linkFout || null);
  const [wacht, setWacht] = useState(0);

  useEffect(() => {
    if (wacht <= 0) return undefined;
    const t = setTimeout(() => setWacht((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wacht]);

  const stuur = async () => {
    const adres = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(adres)) { setFout("Vul je e-mailadres in, bijvoorbeeld naam@voorbeeld.nl"); return; }
    setFout(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: adres,
      options: { emailRedirectTo: window.location.origin + "/", shouldCreateUser: true },
    });
    if (error) { setFout(foutTekst(error)); return; }
    localStorage.setItem("tvveere.email", adres);
    setEmail(adres); setCode(""); setStap("code"); setWacht(60);
  };

  const controleer = async () => {
    const token = code.replace(/\D/g, "");
    if (token.length < 6) { setFout("Vul de hele code uit de mail in."); return; }
    setFout(null);
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error) setFout(foutTekst(error));
  };

  if (stap === "code") return (
    <Kader>
      <div className="mail-icoon"><Icon n="mail" size="2rem" /></div>
      <h2>Kijk in je mail</h2>
      <p className="uitleg">
        We hebben een mail gestuurd naar <b>{email}</b>.
        Tik in die mail op de knop <b>Inloggen</b>. Daarna ben je binnen.
      </p>
      {fout && <Melding soort="fout">{fout}</Melding>}
      <form className="veld-groep" onSubmit={(e) => { e.preventDefault(); controleer(); }}>
        <label htmlFor="code">Of typ hier de code uit de mail</label>
        <input id="code" className="veld code" inputMode="numeric" autoComplete="one-time-code"
          placeholder="123456" maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} />
        <Knop breed onClick={controleer} disabled={code.replace(/\D/g, "").length < 6}>Inloggen met code</Knop>
      </form>
      <div className="knoppen stapel">
        <Knop soort="rustig" breed onClick={stuur} disabled={wacht > 0}>
          {wacht > 0 ? `Geen mail? Opnieuw sturen kan over ${wacht} sec` : "Geen mail gekregen? Stuur opnieuw"}
        </Knop>
        <Knop soort="rustig" breed onClick={() => { setStap("email"); setFout(null); }}>Ander e-mailadres gebruiken</Knop>
      </div>
      <p className="klein-tekst">Niets te zien? Kijk ook even bij ongewenste mail (spam).</p>
    </Kader>
  );

  return (
    <Kader>
      <h2>Inloggen</h2>
      <p className="uitleg">
        Vul je e-mailadres in. Je krijgt een mail met een knop om in te loggen.
        Een wachtwoord is niet nodig.
      </p>
      {fout && <Melding soort="fout">{fout}</Melding>}
      <form className="veld-groep" onSubmit={(e) => { e.preventDefault(); stuur(); }}>
        <label htmlFor="email">Je e-mailadres</label>
        <input id="email" className="veld" type="email" inputMode="email" autoComplete="email"
          autoCapitalize="none" placeholder="naam@voorbeeld.nl" value={email}
          onChange={(e) => setEmail(e.target.value)} />
        <Knop breed icon="mail" onClick={stuur}>Stuur mij een inlogmail</Knop>
      </form>
      <p className="klein-tekst">Eerste keer hier? Dan maken we meteen een account voor je aan.</p>
    </Kader>
  );
}

export function NaamVragen({ onKlaar, onUit }) {
  const [naam, setNaam] = useState("");
  const [fout, setFout] = useState(null);
  const bewaar = async () => {
    const n = naam.trim().replace(/\s+/g, " ");
    if (n.length < 3 || !n.includes(" ")) { setFout("Vul je voornaam én achternaam in."); return; }
    const { error } = await supabase.rpc("zet_naam", { p_naam: n });
    if (error) { setFout(foutTekst(error)); return; }
    await onKlaar();
  };
  return (
    <Kader>
      <h2>Welkom! Hoe heet je?</h2>
      <p className="uitleg">Zo weten de anderen met wie ze achter de bar staan.</p>
      {fout && <Melding soort="fout">{fout}</Melding>}
      <form className="veld-groep" onSubmit={(e) => { e.preventDefault(); bewaar(); }}>
        <label htmlFor="naam">Voornaam en achternaam</label>
        <input id="naam" className="veld" autoComplete="name" autoCapitalize="words" autoFocus
          placeholder="Bijvoorbeeld Jan de Vries" value={naam} onChange={(e) => setNaam(e.target.value)} />
        <Knop breed onClick={bewaar}>Verder</Knop>
      </form>
      <Knop soort="rustig" breed onClick={onUit}>Uitloggen</Knop>
    </Kader>
  );
}

export const Scherm = ({ titel, children }) => (
  <Kader><h2>{titel}</h2>{children}</Kader>
);
