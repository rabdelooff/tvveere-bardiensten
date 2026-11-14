import { useEffect, useRef, useState } from "react";

/* --- iconen --- */

const P = {
  kalender: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" /></>,
  lijst: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></>,
  bel: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  persoon: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  mensen: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>,
  sleutel: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  vink: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  kruis: <path d="M6 6l12 12M18 6L6 18" />,
  pijl: <path d="M9 6l6 6-6 6" />,
  terug: <path d="M15 6l-6 6 6 6" />,
  ruil: <><path d="M7 4 3 8l4 4" /><path d="M3 8h13" /><path d="M17 20l4-4-4-4" /><path d="M21 16H8" /></>,
  megafoon: <><path d="M3 11v2a1 1 0 0 0 1 1h3l8 5V5L7 10H4a1 1 0 0 0-1 1z" /><path d="M18.5 9a4 4 0 0 1 0 6" /></>,
  download: <><path d="M12 4v11M7 11l5 5 5-5" /><path d="M5 20h14" /></>,
  delen: <><path d="M12 15V4M8 8l4-4 4 4" /><path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 7l8.5 6 8.5-6" /></>,
  klok: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  bewerk: <><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></>,
  prullenbak: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  uit: <><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M10 8l-4 4 4 4M6 12h10" /></>,
  bericht: <path d="M20.5 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.6A8 8 0 1 1 20.5 11.5z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></>,
  zoek: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
};

export const Icon = ({ n, size = "1.25em" }) => (
  <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[n]}</svg>
);

export const Logo = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo">
    <rect width="64" height="64" rx="14" fill="#2A3894" />
    <circle cx="32" cy="32" r="19" fill="#fff" />
    <path d="M21 16.5c9 8 9 23 0 31M43 16.5c-9 8-9 23 0 31" fill="none" stroke="#EE6A1E" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

/* --- knop met "bezig"-toestand: voorkomt dubbel tikken --- */

export function Knop({ soort = "primair", icon, onClick, children, breed, klein, disabled, ...rest }) {
  const [bezig, setBezig] = useState(false);
  const leeft = useRef(true);
  useEffect(() => () => { leeft.current = false; }, []);
  const klik = async (e) => {
    if (bezig || !onClick) return;
    const r = onClick(e);
    if (r && typeof r.then === "function") {
      setBezig(true);
      try { await r; } finally { if (leeft.current) setBezig(false); }
    }
  };
  return (
    <button type="button" className={`knop ${soort}${breed ? " breed" : ""}${klein ? " klein" : ""}`}
      onClick={klik} disabled={disabled || bezig} aria-busy={bezig || undefined} {...rest}>
      {bezig ? <span className="spinner" aria-hidden="true" /> : icon && <Icon n={icon} />}
      <span>{children}</span>
    </button>
  );
}

/* --- venster: schuift op de telefoon van onder omhoog, op groot scherm in het midden --- */

export function Venster({ titel, onSluit, children, breed }) {
  const ref = useRef(null);
  useEffect(() => {
    const vorige = document.activeElement;
    ref.current?.focus();
    const toets = (e) => { if (e.key === "Escape") onSluit(); };
    document.addEventListener("keydown", toets);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", toets);
      document.body.style.overflow = "";
      vorige?.focus?.();
    };
  }, [onSluit]);
  return (
    <div className="venster-achter" onMouseDown={(e) => e.target === e.currentTarget && onSluit()}>
      <div className={`venster${breed ? " breed" : ""}`} role="dialog" aria-modal="true" aria-label={titel}
        tabIndex={-1} ref={ref}>
        <div className="venster-kop">
          <h2>{titel}</h2>
          <button type="button" className="rond" onClick={onSluit} aria-label="Sluiten"><Icon n="kruis" /></button>
        </div>
        <div className="venster-inhoud">{children}</div>
      </div>
    </div>
  );
}

export function Bevestig({ titel, tekst, ja, nee = "Annuleren", gevaar, onJa, onSluit }) {
  return (
    <Venster titel={titel} onSluit={onSluit}>
      {tekst && <p className="uitleg">{tekst}</p>}
      <div className="knoppen stapel">
        <Knop soort={gevaar ? "gevaar" : "primair"} breed onClick={async () => { await onJa(); onSluit(); }}>{ja}</Knop>
        <Knop soort="rustig" breed onClick={onSluit}>{nee}</Knop>
      </div>
    </Venster>
  );
}

export const Leeg = ({ titel, children }) => (
  <div className="leeg"><b>{titel}</b>{children && <p>{children}</p>}</div>
);

export const Melding = ({ soort = "info", children }) => (
  <div className={`banner ${soort}`} role={soort === "fout" ? "alert" : "status"}>{children}</div>
);

export const Label = ({ kleur = "grijs", children }) => <span className={`label ${kleur}`}>{children}</span>;

export function Stepper({ waarde, min = 1, max = 12, onChange, label }) {
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, waarde - 1))} disabled={waarde <= min}
        aria-label="Eén minder">−</button>
      <b aria-live="polite">{waarde}</b>
      <button type="button" onClick={() => onChange(Math.min(max, waarde + 1))} disabled={waarde >= max}
        aria-label="Eén meer">+</button>
    </span>
  );
}
