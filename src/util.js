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

/* --- tijden invoeren: opslag is "9.30" of "sluit" --- */

export const minuten = (t) => {
  const m = String(t || "").trim().match(/^(\d{1,2})[.:](\d{2})$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};
const uitMinuten = (m) => `${Math.floor(m / 60)}.${pad2(m % 60)}`;
export const plusUren = (t, uren) => { const m = minuten(t); return m === null ? "" : uitMinuten(Math.min(23 * 60 + 45, m + uren * 60)); };

/* Maakt van wat iemand typt een nette tijd, of null als het geen tijd is.
   "19" → 19.00 · "930" → 9.30 · "1930" → 19.30 · "19:30", "19,30", "19u30" → 19.30 · "7.5" → 7.50 */
export const leesTijd = (tekst, magSluit) => {
  const t = String(tekst || "").trim().toLowerCase();
  if (magSluit && /^s/.test(t)) return "sluit";
  let u, m;
  const cijfers = t.match(/^(\d{1,4})\s*(?:u|uur|h)?$/);
  const gesplitst = t.match(/^(\d{1,2})\s*[.:,;uh\s-]\s*(\d{1,2})$/);
  if (cijfers) {
    const c = cijfers[1];
    [u, m] = c.length <= 2 ? [Number(c), 0] : [Number(c.slice(0, -2)), Number(c.slice(-2))];
  } else if (gesplitst) {
    [u, m] = [Number(gesplitst[1]), Number(gesplitst[2].length === 1 ? gesplitst[2] + "0" : gesplitst[2])];
  } else return null;
  return u > 23 || m > 59 ? null : uitMinuten(u * 60 + m);
};

/* Voorstel voor een nieuwe dienst: sluit aan op de laatste dienst van die dag. */
export const dienstVoorstel = (diensten) => {
  const laatste = diensten[diensten.length - 1];
  if (!laatste) return { post: "Bar", start: "19.00", end: "sluit", cap: 2 };
  const basis = { post: laatste.post, cap: laatste.plekken };
  if (/sluit/i.test(laatste.eind_tijd) || minuten(laatste.eind_tijd) === null) return { ...basis, start: laatste.start_tijd, end: laatste.eind_tijd };
  const eind = minuten(laatste.eind_tijd) + 180;
  return { ...basis, start: laatste.eind_tijd, end: eind > 22 * 60 ? "sluit" : plusUren(laatste.eind_tijd, 3) };
};
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
