/* Datums, tijden en agenda-export */

export const D = (s) => new Date(s + "T12:00:00");
export const isoD = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const vandaag = () => isoD(new Date());

const schoon = (s) => s.replace(/\./g, "");
export const fmtDag = (s) => schoon(D(s).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" }));
export const fmtDagKort = (s) => schoon(D(s).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" }));
export const fmtMoment = (s) => schoon(new Date(s).toLocaleString("nl-NL",
  { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }));

export const fmtRange = (dates) => {
  if (!dates.length) return "Nog geen dagen";
  const s = [...dates].sort(), a = D(s[0]), b = D(s[s.length - 1]);
  const f = (d, o) => d.toLocaleDateString("nl-NL", o);
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
    ? `${a.getDate()} t/m ${f(b, { day: "numeric", month: "long", year: "numeric" })}`
    : `${f(a, { day: "numeric", month: "long" })} t/m ${f(b, { day: "numeric", month: "long", year: "numeric" })}`;
};

export const nextDate = (dates) => {
  if (!dates.length) return vandaag();
  const last = D([...dates].sort().pop());
  last.setDate(last.getDate() + 1);
  return isoD(last);
};

export const tijdLabel = (s) => `${s.start_tijd} – ${/sluit/i.test(s.eind_tijd) ? "sluit" : s.eind_tijd}`;
export const voornaam = (naam) => (naam || "").trim().split(" ")[0] || "";
export const meervoud = (n, een, meer) => `${n} ${n === 1 ? een : meer}`;

export const opsomming = (namen) => namen.length <= 1 ? namen.join("")
  : `${namen.slice(0, -1).join(", ")} en ${namen[namen.length - 1]}`;

/* --- agenda (.ics) --- */

const SLUITTIJD = [23, 0];
export const parseTijd = (t) => {
  if (!t || /sluit/i.test(t)) return SLUITTIJD;
  const m = String(t).replace(/[,:]/g, ".").match(/(\d{1,2})(?:\.(\d{1,2}))?/);
  return m ? [Number(m[1]), Number(m[2] ?? 0)] : SLUITTIJD;
};
export const startMinuten = (s) => { const [h, m] = parseTijd(s.start_tijd); return h * 60 + m; };

const pad2 = (n) => String(n).padStart(2, "0");
const stamp = (d, [h, mi]) => `${d.replace(/-/g, "")}T${pad2(h)}${pad2(mi)}00`;
const esc = (s) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");

const maakIcs = (items, editieNaam) => [
  "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TV Veere//Bardiensten//NL", "CALSCALE:GREGORIAN",
  ...items.flatMap(({ datum, s }) => [
    "BEGIN:VEVENT",
    `UID:dienst-${s.id}@tvveere.nl`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
    `DTSTART:${stamp(datum, parseTijd(s.start_tijd))}`,
    `DTEND:${stamp(datum, parseTijd(s.eind_tijd))}`,
    `SUMMARY:${esc(`${s.post}dienst TV Veere`)}`,
    `DESCRIPTION:${esc(`${editieNaam}\n${s.start_tijd}–${s.eind_tijd}${/sluit/i.test(s.eind_tijd)
      ? " (eindtijd is sluitingstijd, hier op 23.00 gezet)" : ""}`)}`,
    "LOCATION:Tennisvereniging Veere",
    "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY",
    "DESCRIPTION:Straks bardienst bij TV Veere", "END:VALARM",
    "END:VEVENT",
  ]),
  "END:VCALENDAR",
].join("\r\n");

export const icsHref = (items, editieNaam) =>
  `data:text/calendar;charset=utf-8,${encodeURIComponent(maakIcs(items, editieNaam))}`;

/* --- foutmeldingen in gewone taal --- */

export const foutTekst = (error) => {
  const m = error?.message || String(error || "");
  if (/rate limit|too many|only request this after/i.test(m)) return "Even geduld: je kunt pas over een minuut een nieuwe mail aanvragen.";
  if (/expired|invalid.*(token|otp)|otp.*invalid/i.test(m)) return "Deze code klopt niet of is verlopen. Vraag een nieuwe aan.";
  if (/failed to fetch|network/i.test(m)) return "Geen verbinding. Controleer je internet en probeer opnieuw.";
  if (/row-level security|permission denied/i.test(m)) return "Dat mag je hier niet doen.";
  if (/duplicate key/i.test(m)) return "Dat stond er al.";
  if (/email.*invalid|invalid.*email|unable to validate email/i.test(m)) return "Dit e-mailadres lijkt niet te kloppen.";
  return m || "Er ging iets mis. Probeer het opnieuw.";
};
