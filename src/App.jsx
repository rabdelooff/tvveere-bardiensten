import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

/* ---------------------------------------------------------------
   TV Veere — bardiensten
   Data in Supabase, realtime, geen inlog: je naam staat lokaal.
   --------------------------------------------------------------- */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=Archivo+Black&family=IBM+Plex+Mono:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');

.bb { --blauw:#2A3894; --blauwD:#1F2A75; --oranje:#EE6A1E; --oranjeD:#C9540F;
      --room:#FBF5E4; --wit:#FFFFFF; --inkt:#191C2E; --grijs:#70748A; --lijn:#E4E0CE;
      background:var(--room); color:var(--inkt); min-height:100%;
      font-family:Inter,system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
.bb *,.bb *::before,.bb *::after { box-sizing:border-box; }
.bb button { font:inherit; cursor:pointer; }
.bb :focus-visible { outline:2px solid var(--oranje); outline-offset:2px; border-radius:4px; }

.wrap { max-width:800px; margin:0 auto; padding:0 14px 64px; }

/* header ---------------------------------------------------- */
.hd { background:var(--blauw); color:#fff; margin:0 -14px 14px; padding:18px 18px 16px; }
.hd .eyebrow { font-family:Archivo,sans-serif; font-weight:700; font-size:11.5px; letter-spacing:.16em;
               text-transform:uppercase; color:var(--oranje); }
.hd h1 { font-family:'Archivo Black',sans-serif; font-size:30px; line-height:.98; margin:4px 0 0;
         letter-spacing:-.02em; text-transform:uppercase; }
.hd .dates { font-size:12px; opacity:.72; margin-top:6px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.badge { font-family:Archivo,sans-serif; font-size:9.5px; font-weight:700; letter-spacing:.1em;
         text-transform:uppercase; border-radius:99px; padding:2px 8px; opacity:1;
         background:var(--oranje); color:#fff; }
.badge.dim { background:rgba(255,255,255,.22); }
.meter { margin-top:14px; display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; }
.meter .num { font-family:'Archivo Black',sans-serif; font-size:29px; line-height:1; letter-spacing:-.02em; }
.meter .num small { font-family:Inter,sans-serif; font-size:13px; font-weight:600; opacity:.7; margin-left:4px; }
.meter .note { font-size:12.5px; opacity:.9; padding-bottom:2px; }
.track { height:6px; background:rgba(255,255,255,.2); border-radius:99px; margin-top:10px; overflow:hidden; }
.track i { display:block; height:100%; background:var(--oranje); border-radius:99px; transition:width .45s ease; }

/* controls -------------------------------------------------- */
.bar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px; }
.pill { display:flex; align-items:center; gap:6px; background:var(--wit); border:1px solid var(--lijn);
        border-radius:99px; padding:4px 5px 4px 11px; font-size:12.5px; color:var(--grijs); }
.pill select, .pill input { font:inherit; font-size:12.5px; border:0; background:#EFF0F7; border-radius:99px;
              padding:4px 9px; color:var(--blauw); font-weight:600; max-width:200px; }
.pill input::placeholder { color:#9AA0BC; font-weight:400; }
.toggle { margin-left:auto; display:flex; align-items:center; gap:7px; font-size:12.5px; color:var(--grijs); }
.sw { width:38px; height:22px; border-radius:99px; border:1px solid var(--lijn); background:#E8E4D6;
      position:relative; padding:0; transition:background .18s; }
.sw i { position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:99px;
        background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.2); transition:left .18s; }
.sw[data-on="true"] { background:var(--blauw); border-color:var(--blauw); }
.sw[data-on="true"] i { left:19px; }

.suggest { background:#FEF0E5; border:1px solid var(--oranje); border-radius:8px; padding:10px 12px;
           margin-bottom:8px; font-size:12.5px; color:var(--oranjeD); }
.suggest .row { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; align-items:center; }
.pick { border:1px solid var(--blauw); background:var(--blauw); color:#fff; border-radius:99px;
        padding:4px 12px; font-size:12.5px; font-weight:600; }

/* beheerpaneel ---------------------------------------------- */
.panel { background:var(--wit); border:1.5px dashed var(--blauw); border-radius:8px;
         padding:11px 12px; margin-bottom:12px; }
.panel .lab { font-family:Archivo,sans-serif; font-size:10.5px; letter-spacing:.12em; text-transform:uppercase;
              color:var(--blauw); font-weight:700; display:block; margin-bottom:8px; }
.panel .row { display:flex; flex-wrap:wrap; gap:7px; align-items:center; }
.panel .hint { font-size:11.5px; color:var(--grijs); margin:8px 0 0; line-height:1.5; }
.panel label.cb { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; color:var(--inkt); }
.divider { border-top:1px dashed var(--lijn); margin:11px 0 10px; }

.erow { display:flex; align-items:center; gap:7px; padding:5px 6px; border-radius:6px; margin-bottom:3px; }
.erow[data-cur="true"] { background:#F0F1F8; }
.erow .dot { border:0; background:none; color:var(--blauw); font-size:13px; padding:0 2px; line-height:1; }
.erow input { flex:1; min-width:130px; font:inherit; font-size:13px; padding:4px 7px;
              border:1px solid var(--lijn); border-radius:5px; background:#fff; }
.erow select { font:inherit; font-size:12px; padding:4px 5px; border:1px solid var(--lijn);
               border-radius:5px; background:#fff; color:var(--inkt); }
.erow .cntx { font-family:'IBM Plex Mono',monospace; font-size:10.5px; color:var(--grijs); white-space:nowrap; }
.erow[data-arch="true"] { opacity:.55; }
.erow .mini-btn { border:1px solid #BFC4E0; background:transparent; color:var(--blauw);
                  border-radius:5px; padding:3px 8px; font-size:11.5px; font-weight:600; white-space:nowrap; }
.erow .mini-btn.rood { border-color:#E3B4AA; color:var(--oranjeD); }
.zoek { width:100%; font:inherit; font-size:13px; padding:6px 9px; border:1px solid var(--lijn);
        border-radius:6px; background:#fff; margin-bottom:8px; }
.ledenlijst { max-height:320px; overflow-y:auto; }
.mergebox { background:#FEF0E5; border:1px dashed var(--oranje); border-radius:6px;
            padding:8px 10px; margin:4px 0 8px; font-size:12px; color:var(--oranjeD); }
.mergebox .row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-top:7px; }
.mergebox select { font:inherit; font-size:12.5px; padding:4px 6px; border:1px solid var(--lijn);
                   border-radius:5px; background:#fff; color:var(--inkt); max-width:200px; }

.tabs { display:flex; gap:5px; margin-bottom:8px; }
.tab { flex:1; border:1px solid var(--lijn); background:var(--wit); border-radius:8px;
       padding:7px 6px; font-size:12.5px; font-weight:600; color:var(--grijs); }
.tab[data-on="true"] { background:var(--blauw); border-color:var(--blauw); color:#fff; }

.legend { display:flex; gap:14px; flex-wrap:wrap; align-items:center; margin:0 2px 14px;
          font-size:11.5px; color:var(--grijs); }
.legend span { display:inline-flex; align-items:center; gap:5px; }
.foldall { margin-left:auto; border:0; background:none; color:var(--blauw); font-size:11.5px;
           font-weight:600; text-decoration:underline; text-underline-offset:2px; padding:2px; }

/* status ---------------------------------------------------- */
.st { width:19px; height:19px; border-radius:99px; display:inline-flex; align-items:center;
      justify-content:center; font-family:'IBM Plex Mono',monospace; font-size:11px; font-weight:700;
      flex:0 0 auto; line-height:1; }
.st.ok   { background:#DFE2F2; color:var(--blauw); }
.st.seek { background:#fff; color:var(--oranje); border:1.5px dashed var(--oranje); }
.st.gap  { background:var(--oranje); color:#fff; }

/* day ------------------------------------------------------- */
.day { margin-bottom:14px; }
.dayhd { display:flex; align-items:center; gap:8px; padding:0 2px 5px;
         border-bottom:2px solid var(--blauw); margin-bottom:6px; }
.dayToggle { display:flex; align-items:center; gap:8px; background:none; border:0; padding:0;
             text-align:left; color:inherit; flex:1; min-width:0; }
.dayToggle h2 { font-family:'Archivo Black',sans-serif; font-size:14.5px; letter-spacing:-.01em;
            margin:0; text-transform:uppercase; color:var(--blauw); white-space:nowrap;
            overflow:hidden; text-overflow:ellipsis; }
.caret { font-size:9px; color:var(--oranje); width:11px; flex:0 0 auto; transition:transform .18s; }
.caret[data-open="false"] { transform:rotate(-90deg); }
.mini { display:flex; gap:3px; flex:0 0 auto; }
.mini i { width:7px; height:7px; border-radius:99px; display:block; }
.cnt { font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--grijs); }
.delday { border:0; background:none; color:var(--oranjeD); font-size:11px; font-weight:600; padding:2px 4px; }

/* shift ----------------------------------------------------- */
.shift { position:relative; background:var(--wit); border:1px solid var(--lijn); border-radius:8px;
         padding:8px 11px; margin-bottom:5px; overflow:hidden; }
.shift .wash { position:absolute; inset:0 auto 0 0; background:rgba(238,106,30,.10); transition:width .35s ease; }
.shift.done .wash { background:rgba(42,56,148,.055); }
.srow { position:relative; display:flex; align-items:center; gap:9px; flex-wrap:wrap; }
.time { font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:12.5px;
        min-width:92px; letter-spacing:-.02em; color:var(--inkt); }
.tag { font-family:Archivo,sans-serif; font-size:10px; font-weight:700; letter-spacing:.06em;
       text-transform:uppercase; color:var(--blauw); background:#E7E9F5; border-radius:4px; padding:2px 5px; }
.chips { display:flex; flex-wrap:wrap; gap:4px; flex:1; min-width:170px; }
.chip { font-size:12px; background:#F4F2E8; border:1px solid var(--lijn); border-radius:99px;
        padding:2px 9px; display:inline-flex; align-items:center; gap:5px; white-space:nowrap; }
.chip.me { background:var(--blauw); border-color:var(--blauw); color:#fff; }
.chip.open { background:transparent; border:1px dashed #C6C2AE; color:var(--grijs); }
.chip.seek { background:#FEF0E5; border:1px dashed var(--oranje); color:var(--oranjeD); }
.chip .x { border:0; background:none; padding:0 0 0 1px; color:inherit; opacity:.55; font-size:13px; line-height:1; }
.right { display:flex; align-items:center; gap:6px; margin-left:auto; flex-wrap:wrap;
         justify-content:flex-end; }

.share { position:relative; margin-top:9px; padding-top:9px; border-top:1px dashed var(--oranje); }
.share .msg { background:#FEF7F0; border:1px solid #F3D6BC; border-radius:6px; padding:8px 10px;
              font-size:12px; line-height:1.55; color:var(--inkt); white-space:pre-wrap; }
.share .row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-top:7px; }
.wa { display:inline-flex; align-items:center; gap:6px; background:#25D366; color:#0B2E17;
      border:1px solid #1FB855; border-radius:6px; padding:5px 11px; font-size:12px; font-weight:700;
      text-decoration:none; }
.wa:hover { background:#20BC5B; }

a.btn { text-decoration:none; display:inline-flex; align-items:center; }
.ico { display:inline-flex; align-items:center; justify-content:center; width:25px; height:25px;
       border:1px solid #BFC4E0; border-radius:6px; background:transparent; color:var(--blauw);
       text-decoration:none; flex:0 0 auto; }
.ico:hover { background:#EFF0F7; }
.icoTop { position:absolute; top:7px; right:9px; z-index:2; }
.shift[data-cal="true"] { padding-right:44px; }
.cal { display:flex; gap:12px; align-items:center; flex-wrap:wrap; background:var(--wit);
       border:1px solid var(--lijn); border-left:3px solid var(--blauw); border-radius:8px;
       padding:10px 12px; margin-bottom:12px; }
.cal .txt { flex:1; min-width:190px; font-size:11.5px; color:var(--grijs); line-height:1.5; }
.cal .txt b { display:block; font-family:Archivo,sans-serif; font-size:13px; color:var(--inkt);
              margin-bottom:2px; }

.btn { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--oranje);
       background:var(--oranje); color:#fff; border-radius:6px;
       padding:5px 11px; font-size:12px; font-weight:600; white-space:nowrap; }
.btn.sq { padding:5px 7px; }
.btn.blauw { background:var(--blauw); border-color:var(--blauw); }
.btn.ghost { background:transparent; color:var(--blauw); border-color:#BFC4E0; font-weight:500; }
.btn.quiet { border-color:transparent; color:var(--grijs); background:transparent; font-weight:500; padding:5px 6px; }
.btn[disabled] { opacity:.35; cursor:not-allowed; }

/* beheer ---------------------------------------------------- */
.edit { position:relative; display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-top:8px;
        padding-top:8px; border-top:1px dashed var(--lijn); }
.edit label { font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.08em;
              text-transform:uppercase; color:var(--grijs); }
.edit input, .newf input, .newf select, .newday input, .panel input[type=date], .panel input[type=text] {
  font:inherit; font-size:12.5px; padding:4px 6px; border:1px solid var(--lijn);
  border-radius:5px; background:#fff; color:var(--inkt); width:66px; }
.newf select, .newday input, .panel input[type=date] { width:auto; }
.panel input[type=text] { width:auto; flex:1; min-width:170px; }
.stepper { display:inline-flex; align-items:center; border:1px solid var(--lijn); border-radius:5px; overflow:hidden; }
.stepper button { border:0; background:#F4F2E8; width:24px; height:25px; font-size:14px; line-height:1; color:var(--inkt); }
.stepper b { font-family:'IBM Plex Mono',monospace; font-size:12.5px; width:22px; text-align:center; }
.del { margin-left:auto; border:0; background:none; color:var(--oranjeD); font-size:12px; font-weight:600; padding:3px; }

.newf, .newday { background:var(--wit); border:1px dashed #C6C2AE; border-radius:8px; padding:9px 11px;
        display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.newday { margin-top:16px; }
.newday b { font-family:Archivo,sans-serif; font-size:11px; letter-spacing:.08em; text-transform:uppercase;
            color:var(--grijs); margin-right:2px; }
.addbtn { width:100%; border:1px dashed #CFCBB8; background:transparent; color:var(--grijs);
          border-radius:8px; padding:7px; font-size:12px; }

.empty { background:var(--wit); border:1px solid var(--lijn); border-radius:8px; padding:24px 18px;
         text-align:center; color:var(--grijs); font-size:13.5px; }
.empty b { display:block; color:var(--blauw); font-size:15px; margin-bottom:4px;
           font-family:'Archivo Black',sans-serif; text-transform:uppercase; }

.toast { position:fixed; left:50%; transform:translateX(-50%); bottom:20px; z-index:20;
         background:var(--blauw); color:#fff; padding:10px 17px; border-radius:99px;
         font-size:13px; box-shadow:0 6px 22px rgba(31,42,117,.3); max-width:92vw; text-align:center; }
.foot { font-size:11.5px; color:var(--grijs); text-align:center; margin-top:24px; line-height:1.6; }

.log { background:var(--wit); border:1px solid var(--lijn); border-left:3px solid var(--blauw);
       border-radius:8px; padding:10px 12px; margin-top:18px; }
.log .head { display:flex; align-items:center; gap:8px; width:100%; background:none; border:0;
             padding:0; color:inherit; text-align:left; }
.log .head .lab { font-family:Archivo,sans-serif; font-size:10.5px; letter-spacing:.12em;
                  text-transform:uppercase; color:var(--blauw); font-weight:700; }
.log .head .cnt { margin-left:auto; }
.logbody { margin-top:9px; }
.logrows { max-height:230px; overflow-y:auto; }
.logrow { display:flex; gap:8px; align-items:baseline; padding:4px 0; font-size:12px;
          border-top:1px solid #F0EEE2; line-height:1.45; }
.logrow:first-child { border-top:0; }
.logrow time { font-family:'IBM Plex Mono',monospace; font-size:10.5px; color:var(--grijs);
               white-space:nowrap; flex:0 0 auto; }
.logrow .wie { font-weight:600; }
.logrow .bh { font-family:Archivo,sans-serif; font-size:9px; letter-spacing:.08em; text-transform:uppercase;
              background:#E7E9F5; color:var(--blauw); border-radius:3px; padding:1px 4px; margin-left:4px; }
.logleeg, .loghint { font-size:11.5px; color:var(--grijs); line-height:1.5; }
.loghint { margin:8px 0 0; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

@media (max-width:560px){ .hd h1{font-size:25px} .time{min-width:86px} .chips{min-width:100%}
  .right{margin-left:0; justify-content:flex-start; width:100%} }
@media (prefers-reduced-motion: reduce){ .bb *{transition:none !important} }
` + `
.laden { padding:40px 18px; text-align:center; color:var(--grijs); font-size:13.5px; }
.fout { background:#FEF0E5; border:1px solid var(--oranje); color:var(--oranjeD);
        border-radius:8px; padding:12px 14px; font-size:12.5px; margin-bottom:12px; line-height:1.55; }
.pill.leeg select { background:var(--oranje); color:#fff; }
.pill { flex-wrap:wrap; max-width:100%; }
.pill.invoer { width:100%; border-radius:14px; padding:8px 10px; gap:7px; }
.pill.invoer input { flex:1 1 150px; min-width:0; max-width:none; border-radius:9px; padding:8px 11px; }
.pill.invoer .btn { flex:0 0 auto; padding:8px 14px; }
`;

/* --- datumhulp --------------------------------------------------- */

const D = (s) => new Date(s + "T12:00:00");
const isoD = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const fmtDay = (s) =>
  D(s).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "short", year: "numeric" })
    .replace(/\./g, "");
const fmtRange = (dates) => {
  if (!dates.length) return "Nog geen dagen ingepland";
  const s = [...dates].sort(), a = D(s[0]), b = D(s[s.length - 1]);
  const f = (d, o) => d.toLocaleDateString("nl-NL", o);
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
    ? `${a.getDate()} t/m ${f(b, { day: "numeric", month: "long", year: "numeric" })}`
    : `${f(a, { day: "numeric", month: "long" })} t/m ${f(b, { day: "numeric", month: "long", year: "numeric" })}`;
};
const nextDate = (dates) => {
  if (!dates.length) return isoD(new Date());
  const last = D([...dates].sort().pop());
  last.setDate(last.getDate() + 1);
  return isoD(last);
};

/* --- naamherkenning ---------------------------------------------- */

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

const lev = (a, b) => {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
};

const STOP = new Set(["van", "de", "der", "den", "ter", "te", "het", "v", "vd", "vander"]);
const kern = (s) => norm(s).split(" ").filter(w => w && !STOP.has(w));

const score = (invoer, kandidaat) => {
  const A = norm(invoer), B = norm(kandidaat);
  if (!A) return 0;
  if (A === B) return 100;
  const ka = kern(A), kb = kern(B);
  if (ka.join(" ") === kb.join(" ")) return 95;
  if (B.startsWith(A) || A.startsWith(B)) return 90;
  if (B.includes(A) || A.includes(B)) return 84;
  const gedeeld = ka.filter(w => kb.includes(w));
  if (gedeeld.length >= 2) return 88;
  if (gedeeld.length === 1 && gedeeld[0].length >= 3) return 74;
  if (ka[0] && kb[0] && lev(ka[0], kb[0]) <= 1 && ka.length > 1 && kb.length > 1
    && ka[ka.length - 1][0] === kb[kb.length - 1][0]) return 70;
  if (lev(A, B) <= 2) return 66;
  if (ka.some(w => kb.some(x => w.length >= 4 && lev(w, x) <= 1))) return 60;
  return 0;
};

const lijktOp = (invoer, lijst) =>
  lijst.map(p => ({ p, sc: score(invoer, p.naam) })).filter(x => x.sc > 0)
    .sort((a, b) => b.sc - a.sc).slice(0, 5).map(x => x.p);

/* --- agenda-export (.ics) ---------------------------------------- */

const SLUITTIJD = [23, 0];
const parseTijd = (t) => {
  if (!t || /sluit/i.test(t)) return SLUITTIJD;
  const m = String(t).replace(/[,:]/g, ".").match(/(\d{1,2})(?:\.(\d{1,2}))?/);
  return m ? [Number(m[1]), Number(m[2] ?? 0)] : SLUITTIJD;
};
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

const icsHref = (items, editieNaam) =>
  `data:text/calendar;charset=utf-8,${encodeURIComponent(maakIcs(items, editieNaam))}`;

/* --- iconen ------------------------------------------------------ */

const Icon = ({ p, size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p}</svg>
);
const IC = {
  agenda: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" /></>,
  ruil: <><path d="M7 4 3 8l4 4" /><path d="M3 8h13" /><path d="M17 20l4-4-4-4" /><path d="M21 16H8" /></>,
  bericht: <path d="M20.5 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.6A8 8 0 1 1 20.5 11.5z" />,
  terug: <><path d="M9 14 4 9l5-5" /><path d="M4 9h9a6 6 0 0 1 0 12h-2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
};

const GLYPH = { ok: "✓", seek: "⇄", gap: null };
const COLOR = { ok: "#C2C8E6", seek: "#EE6A1E", gap: "#EE6A1E" };
const STATUSLABEL = { concept: "Concept", open: "Open", gesloten: "Gesloten" };
const BEHEERCODE = import.meta.env.VITE_BEHEER_CODE || "";

/* --- app --------------------------------------------------------- */

export default function App() {
  const [db, setDb] = useState({ editions: [], days: [], shifts: [], people: [], assignments: [] });
  const [log, setLog] = useState([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState(null);

  const [meId, setMeId] = useState(() => localStorage.getItem("tvveere.persoon") || null);
  const [curId, setCurId] = useState(null);
  const [tab, setTab] = useState("alle");
  const [admin, setAdmin] = useState(false);
  const [shut, setShut] = useState([]);
  const [toast, setToast] = useState(null);
  const [logOpen, setLogOpen] = useState(false);

  const [naming, setNaming] = useState(false);
  const [naam, setNaam] = useState("");
  const [sugg, setSugg] = useState(null);
  const [sharing, setSharing] = useState(null);

  const [newFor, setNewFor] = useState(null);
  const [draft, setDraft] = useState({ post: "Bar", start: "19.00", end: "sluit", cap: 2 });
  const [dayDraft, setDayDraft] = useState("");
  const [nieuwe, setNieuwe] = useState(null);
  const [ledenZoek, setLedenZoek] = useState("");
  const [merge, setMerge] = useState(null);   // { van, naar }

  const say = (m) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  /* --- laden ----------------------------------------------------- */

  const laad = useCallback(async () => {
    const [e, d, s, p, a] = await Promise.all([
      supabase.from("editions").select("*").order("created_at"),
      supabase.from("days").select("*").order("datum"),
      supabase.from("shifts").select("*").order("created_at"),
      supabase.from("people").select("*").order("naam"),
      supabase.from("assignments").select("*").order("created_at"),
    ]);
    const err = [e, d, s, p, a].find(r => r.error);
    if (err) { setFout(err.error.message); setLaden(false); return; }
    setFout(null);
    setDb({ editions: e.data, days: d.data, shifts: s.data, people: p.data, assignments: a.data });
    setLaden(false);
  }, []);

  const laadLog = useCallback(async () => {
    const { data } = await supabase.from("changelog").select("*")
      .order("created_at", { ascending: false }).limit(60);
    setLog(data || []);
  }, []);

  useEffect(() => {
    laad(); laadLog();
    const ch = supabase.channel("rooster")
      .on("postgres_changes", { event: "*", schema: "public" }, () => { laad(); laadLog(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [laad, laadLog]);

  /* --- afgeleide data -------------------------------------------- */

  const { editions, days, shifts, people, assignments } = db;
  const me = people.find(p => p.id === meId) || null;

  const zichtbaar = admin ? editions : editions.filter(e => e.status === "open");
  const cur = zichtbaar.find(e => e.id === curId) || zichtbaar[0] || null;

  const curDays = useMemo(
    () => days.filter(d => cur && d.edition_id === cur.id),
    [days, cur]);
  const dayIds = useMemo(() => new Set(curDays.map(d => d.id)), [curDays]);
  const curShifts = useMemo(() => shifts.filter(s => dayIds.has(s.day_id)), [shifts, dayIds]);

  const naamVan = useCallback(
    (id) => people.find(p => p.id === id)?.naam || "—", [people]);
  const rijenVan = useCallback(
    (shiftId) => assignments.filter(a => a.shift_id === shiftId), [assignments]);
  const staatVan = useCallback((s) => {
    const r = rijenVan(s.id);
    if (r.length < s.plekken) return "gap";
    return r.some(x => x.status === "zoekt_vervanger") ? "seek" : "ok";
  }, [rijenVan]);

  const t = useMemo(() => ({
    slots: curShifts.reduce((a, s) => a + s.plekken, 0),
    filled: curShifts.reduce((a, s) => a + rijenVan(s.id).length, 0),
    gaps: curShifts.filter(s => staatVan(s) === "gap").length,
    seeks: curShifts.filter(s => staatVan(s) === "seek").length,
    mine: me ? curShifts.filter(s => rijenVan(s.id).some(a => a.person_id === me.id)).length : 0,
  }), [curShifts, rijenVan, staatVan, me]);

  const todo = t.gaps + t.seeks;
  const zichtbaarheid = (s) => tab === "alle" ? true
    : tab === "todo" ? staatVan(s) !== "ok"
      : !!me && rijenVan(s.id).some(a => a.person_id === me.id);

  const mijnLijst = useMemo(() => !me ? [] : curDays.flatMap(d =>
    shifts.filter(s => s.day_id === d.id && rijenVan(s.id).some(a => a.person_id === me.id))
      .map(s => ({ datum: d.datum, s }))), [curDays, shifts, rijenVan, me]);

  const wanneer = (dag, s) => `${fmtDay(dag.datum)} ${s.start_tijd}–${s.eind_tijd}`;

  /* --- schrijven -------------------------------------------------- */

  const noteer = async (tekst, beheer = false) => {
    await supabase.from("changelog").insert({
      edition_id: cur?.id ?? null, wie: me?.naam ?? "onbekend", tekst, beheer,
    });
  };

  const na = async (melding) => { await Promise.all([laad(), laadLog()]); if (melding) say(melding); };

  const eisNaam = () => {
    if (me) return true;
    setNaming(true); say("Kies eerst je naam bovenin");
    return false;
  };

  const helpMee = async (dag, s) => {
    if (!eisNaam()) return;
    const { error } = await supabase.from("assignments").insert({ shift_id: s.id, person_id: me.id });
    if (error) return say(/vol/i.test(error.message)
      ? "Net te laat — deze dienst is inmiddels vol" : "Er ging iets mis, probeer opnieuw");
    await noteer(`meldde zich aan voor ${wanneer(dag, s)}`);
    na(`Je helpt mee — ${fmtDay(dag.datum)}, ${s.start_tijd}`);
  };

  const zoekVervanger = async (dag, s, rij) => {
    await supabase.from("assignments").update({ status: "zoekt_vervanger" }).eq("id", rij.id);
    await noteer(`zoekt een vervanger voor ${wanneer(dag, s)}`);
    setSharing(s.id);
    na("Zichtbaar voor iedereen: je zoekt een vervanger");
  };

  const tochHouden = async (dag, s, rij) => {
    await supabase.from("assignments").update({ status: "ingedeeld" }).eq("id", rij.id);
    await noteer(`houdt ${wanneer(dag, s)} toch zelf`);
    setSharing(null); na("Je houdt de dienst");
  };

  const vrijgeven = async (dag, s, rij) => {
    await supabase.from("assignments").delete().eq("id", rij.id);
    await noteer(`gaf ${wanneer(dag, s)} definitief vrij`);
    setSharing(null); na("Vrijgegeven — de dienst staat nu open voor iedereen");
  };

  const neemOver = async (dag, s, rij) => {
    if (!eisNaam()) return;
    const { error } = await supabase.from("assignments")
      .update({ person_id: me.id, status: "ingedeeld" }).eq("id", rij.id)
      .eq("status", "zoekt_vervanger");
    if (error) return say("Iemand anders was je voor");
    await noteer(`nam ${wanneer(dag, s)} over van ${naamVan(rij.person_id)}`);
    na(`Je neemt over van ${naamVan(rij.person_id)}`);
  };

  /* --- zelf aanmelden --------------------------------------------- */

  const kies = (p) => {
    setMeId(p.id); localStorage.setItem("tvveere.persoon", p.id);
    setSugg(null); setNaming(false); setNaam("");
    say(`Welkom ${p.naam.split(" ")[0]}`);
  };

  const maakAan = async (n) => {
    const { data, error } = await supabase.from("people").insert({ naam: n, naam_norm: "" })
      .select().single();
    if (error) {
      const bestaand = people.find(p => norm(p.naam) === norm(n));
      if (bestaand) return kies(bestaand);
      return say("Die naam kon niet worden toegevoegd");
    }
    await laad(); kies(data);
  };

  const registreer = () => {
    const n = naam.trim().replace(/\s+/g, " ");
    if (!n) return;
    const exact = people.find(p => norm(p.naam) === norm(n));
    if (exact) return kies(exact);
    const opties = lijktOp(n, people);
    if (opties.length) return setSugg({ invoer: n, opties });
    maakAan(n);
  };

  /* --- beheer ------------------------------------------------------ */

  const zetBeheer = (aan) => {
    if (!aan) return setAdmin(false);
    if (!BEHEERCODE || sessionStorage.getItem("tvveere.beheer") === "1") return setAdmin(true);
    const inv = window.prompt("Beheercode");
    if (inv === BEHEERCODE) { sessionStorage.setItem("tvveere.beheer", "1"); setAdmin(true); }
    else if (inv !== null) say("Onjuiste code");
  };

  const haalVanDienst = async (dag, s, rij) => {
    await supabase.from("assignments").delete().eq("id", rij.id);
    await noteer(`haalde ${naamVan(rij.person_id)} van ${wanneer(dag, s)}`, true);
    na();
  };

  const wijzigDienst = async (s, patch, tekst) => {
    const { error } = await supabase.from("shifts").update(patch).eq("id", s.id);
    if (error) return say(error.message);
    if (tekst) await noteer(tekst, true);
    na();
  };

  const verwijderDienst = async (dag, s) => {
    await supabase.from("shifts").delete().eq("id", s.id);
    await noteer(`verwijderde de dienst ${wanneer(dag, s)}`, true);
    na("Dienst verwijderd");
  };

  const voegDienstToe = async (dag) => {
    await supabase.from("shifts").insert({
      day_id: dag.id, post: draft.post, start_tijd: draft.start,
      eind_tijd: draft.end, plekken: draft.cap,
    });
    await noteer(`voegde een dienst toe op ${fmtDay(dag.datum)} (${draft.start}–${draft.end})`, true);
    setNewFor(null); na("Dienst toegevoegd");
  };

  const voegDagToe = async () => {
    const d = dayDraft || nextDate(curDays.map(x => x.datum));
    if (curDays.some(x => x.datum === d)) return say("Die dag staat er al in");
    await supabase.from("days").insert({ edition_id: cur.id, datum: d });
    await noteer(`voegde ${fmtDay(d)} toe`, true);
    setDayDraft(""); na(`${fmtDay(d)} toegevoegd`);
  };

  const verwijderDag = async (dag) => {
    await supabase.from("days").delete().eq("id", dag.id);
    await noteer(`verwijderde ${fmtDay(dag.datum)}`, true);
    na("Dag verwijderd");
  };

  const updEditie = async (e, patch, tekst) => {
    await supabase.from("editions").update(patch).eq("id", e.id);
    if (tekst) await noteer(tekst, true);
    na();
  };

  const verwijderEditie = async (e) => {
    if (!window.confirm(`Editie "${e.naam}" en alle diensten erin verwijderen?`)) return;
    await supabase.from("editions").delete().eq("id", e.id);
    await noteer(`verwijderde de editie ${e.naam}`, true);
    na("Editie verwijderd");
  };

  /* --- ledenbeheer -------------------------------------------------- */

  const dienstenVan = useCallback(
    (pid) => assignments.filter(a => a.person_id === pid).length, [assignments]);

  const hernoem = async (p, nieuweNaam) => {
    const n = nieuweNaam.trim().replace(/\s+/g, " ");
    if (!n || n === p.naam) return;
    const { error } = await supabase.from("people").update({ naam: n }).eq("id", p.id);
    if (error) return say("Die naam bestaat al — gebruik Samenvoegen");
    await noteer(`hernoemde ${p.naam} naar ${n}`, true);
    na("Naam aangepast");
  };

  const archiveer = async (p, aan) => {
    await supabase.from("people").update({ gearchiveerd: aan }).eq("id", p.id);
    await noteer(`${aan ? "archiveerde" : "haalde"} ${p.naam}${aan ? "" : " terug uit het archief"}`, true);
    if (aan && p.id === meId) { localStorage.removeItem("tvveere.persoon"); setMeId(null); }
    na(aan ? "Gearchiveerd" : "Teruggehaald");
  };

  const verwijderPersoon = async (p) => {
    if (dienstenVan(p.id) > 0) return say("Staat nog op diensten — archiveer of voeg samen");
    if (!window.confirm(`${p.naam} definitief verwijderen?`)) return;
    await supabase.from("people").delete().eq("id", p.id);
    await noteer(`verwijderde ${p.naam} uit de ledenlijst`, true);
    if (p.id === meId) { localStorage.removeItem("tvveere.persoon"); setMeId(null); }
    na("Verwijderd");
  };

  const voegSamen = async () => {
    const van = people.find(p => p.id === merge.van);
    const naar = people.find(p => p.id === merge.naar);
    if (!van || !naar || van.id === naar.id) return say("Kies twee verschillende personen");
    const { error } = await supabase.rpc("voeg_samen", { van: van.id, naar: naar.id });
    if (error) return say("Samenvoegen mislukt — is de SQL-uitbreiding uitgevoerd?");
    await noteer(`voegde ${van.naam} samen met ${naar.naam}`, true);
    if (van.id === meId) { localStorage.setItem("tvveere.persoon", naar.id); setMeId(naar.id); }
    setMerge(null);
    na(`${van.naam} is samengevoegd met ${naar.naam}`);
  };

  const maakEditie = async () => {
    const naamE = (nieuwe.naam || "").trim() || "Nieuwe editie";
    const { data: nieuweEditie, error } = await supabase.from("editions")
      .insert({ naam: naamE, status: "concept" }).select().single();
    if (error) return say("Aanmaken mislukt");

    if (nieuwe.kopieVan) {
      const bron = days.filter(d => d.edition_id === nieuwe.kopieVan)
        .sort((a, b) => a.datum.localeCompare(b.datum));
      if (bron.length) {
        const basis = D(bron[0].datum), st = D(nieuwe.start);
        for (const b of bron) {
          const delta = Math.round((D(b.datum) - basis) / 864e5);
          const dt = new Date(st); dt.setDate(dt.getDate() + delta);
          const { data: nd } = await supabase.from("days")
            .insert({ edition_id: nieuweEditie.id, datum: isoD(dt) }).select().single();
          const bronDiensten = shifts.filter(s => s.day_id === b.id);
          if (nd && bronDiensten.length) {
            await supabase.from("shifts").insert(bronDiensten.map(s => ({
              day_id: nd.id, post: s.post, start_tijd: s.start_tijd,
              eind_tijd: s.eind_tijd, plekken: s.plekken,
            })));
          }
        }
      }
    }
    await noteer(`maakte de editie ${naamE} aan`, true);
    setCurId(nieuweEditie.id); setShut([]); setTab("alle"); setNieuwe(null);
    na(`${naamE} aangemaakt als concept`);
  };

  /* --- deelbericht -------------------------------------------------- */

  const link = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  const deelTekst = (dag, s) =>
    `Wie kan mijn bardienst overnemen?\n\n${cur?.naam ?? ""}\n${fmtDay(dag.datum)} · ${s.start_tijd}–${s.eind_tijd}\n\n`
    + `Je kunt hem zelf overnemen in het rooster:\n${link}`;
  const kopieer = async (txt) => {
    try { await navigator.clipboard.writeText(txt); say("Tekst gekopieerd"); }
    catch { say("Kopiëren lukt hier niet — selecteer de tekst handmatig"); }
  };

  const logTijd = (s) => new Date(s).toLocaleString("nl-NL",
    { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(/\./g, "");
  const logCsv = () => "datum;wie;rol;wijziging\n" + log.map(e =>
    `${e.created_at};${e.wie};${e.beheer ? "beheer" : "lid"};${e.tekst.replace(/;/g, ",")}`).join("\n");

  /* ---------------------------------------------------------------- */

  if (laden) return <div className="bb"><style>{CSS}</style><div className="laden">Rooster laden…</div></div>;

  if (!cur) return (
    <div className="bb"><style>{CSS}</style><div className="wrap">
      <header className="hd">
        <div className="eyebrow">Tennis Vereniging Veere</div>
        <h1>Bardiensten</h1>
      </header>
      {fout && <div className="fout">{fout}</div>}
      <div className="empty">
        <b>Geen rooster open</b>
        Er staat op dit moment geen toernooi open om je voor in te schrijven.
      </div>
      <div className="bar" style={{ marginTop: 12 }}>
        <div className="toggle">
          <span>Beheer</span>
          <button className="sw" data-on={admin} onClick={() => zetBeheer(!admin)}
            aria-pressed={admin} aria-label="Beheermodus"><i /></button>
        </div>
      </div>
    </div></div>
  );

  return (
    <div className="bb">
      <style>{CSS}</style>
      <div className="wrap">

        <header className="hd">
          <div className="eyebrow">Tennis Vereniging Veere</div>
          <h1>{cur.naam}<br />bardiensten</h1>
          <div className="dates">
            {fmtRange(curDays.map(d => d.datum))}
            {cur.status !== "open" && (
              <span className={`badge${cur.status === "gesloten" ? " dim" : ""}`}>
                {STATUSLABEL[cur.status]} — niet zichtbaar voor leden
              </span>
            )}
          </div>
          <div className="meter">
            <span className="num">{t.filled}<small>/{t.slots} plekken</small></span>
            <span className="note">
              {t.slots === 0 ? "Nog geen diensten ingepland"
                : todo === 0 ? "Alle diensten zijn rond — mooi werk"
                  : `${todo} dienst${todo > 1 ? "en" : ""} ${todo > 1 ? "hebben" : "heeft"} nog iemand nodig`}
            </span>
          </div>
          <div className="track"><i style={{ width: `${t.slots ? (t.filled / t.slots) * 100 : 0}%` }} /></div>
        </header>

        {fout && <div className="fout">{fout}</div>}

        <div className="bar">
          <div className={`pill${naming ? " invoer" : ""}${me ? "" : " leeg"}`}>
            {naming ? (
              <>
                <input autoFocus value={naam} placeholder="Voor- en achternaam"
                  onChange={e => setNaam(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && registreer()} />
                <button className="btn blauw" onClick={registreer}>Opslaan</button>
                <button className="btn quiet" onClick={() => { setNaming(false); setNaam(""); setSugg(null); }}>
                  Annuleren
                </button>
              </>
            ) : (
              <>
                {me ? "Ingelogd als" : "Wie ben jij?"}
                <select value={me?.id || ""} aria-label="Kies je naam"
                  onChange={e => {
                    if (e.target.value === "__new__") return setNaming(true);
                    const p = people.find(x => x.id === e.target.value);
                    if (p) kies(p);
                  }}>
                  {!me && <option value="">Kies je naam…</option>}
                  {people.filter(p => !p.gearchiveerd || p.id === meId)
                    .map(p => <option key={p.id} value={p.id}>{p.naam}</option>)}
                  <option value="__new__">+ Ik sta er nog niet bij…</option>
                </select>
              </>
            )}
          </div>

          {zichtbaar.length > 1 && !naming && (
            <div className="pill">
              Editie
              <select value={cur.id} onChange={e => { setCurId(e.target.value); setShut([]); }}
                aria-label="Kies editie">
                {zichtbaar.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.naam}{admin && e.status !== "open" ? ` · ${STATUSLABEL[e.status]}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="toggle">
            <span>Beheer</span>
            <button className="sw" data-on={admin} onClick={() => zetBeheer(!admin)}
              aria-pressed={admin} aria-label="Beheermodus"><i /></button>
          </div>
        </div>

        {sugg && (
          <div className="suggest">
            Deze naam lijkt op iemand die er al staat. Ben jij dat?
            <div className="row">
              {sugg.opties.map(o => (
                <button className="pick" key={o.id} onClick={() => kies(o)}>{o.naam}</button>
              ))}
              <button className="btn quiet" onClick={() => maakAan(sugg.invoer)}>
                Nee, maak “{sugg.invoer}” aan
              </button>
            </div>
          </div>
        )}

        {admin && (
          <div className="panel">
            <span className="lab">Edities</span>
            {editions.map(e => (
              <div className="erow" key={e.id} data-cur={e.id === cur.id}>
                <button className="dot" title="Bekijk deze editie"
                  onClick={() => { setCurId(e.id); setShut([]); }}>{e.id === cur.id ? "●" : "○"}</button>
                <input defaultValue={e.naam} aria-label="Naam van de editie"
                  onBlur={ev => ev.target.value !== e.naam
                    && updEditie(e, { naam: ev.target.value }, `hernoemde ${e.naam} naar ${ev.target.value}`)} />
                <select value={e.status} aria-label="Zichtbaarheid"
                  onChange={ev => updEditie(e, { status: ev.target.value },
                    `zette ${e.naam} op status ${STATUSLABEL[ev.target.value]}`)}>
                  <option value="concept">Concept</option>
                  <option value="open">Open</option>
                  <option value="gesloten">Gesloten</option>
                </select>
                <button className="del" style={{ marginLeft: 0 }}
                  onClick={() => verwijderEditie(e)}>×</button>
              </div>
            ))}
            <p className="hint">
              Leden zien alleen edities met status <b>Open</b>. Concept en Gesloten zijn hier zichtbaar.
            </p>

            <div className="divider" />
            {nieuwe ? (
              <>
                <span className="lab">Nieuwe editie</span>
                <div className="row">
                  <input type="text" placeholder="Naam, bijv. Veere Open winter 2027"
                    value={nieuwe.naam} onChange={e => setNieuwe({ ...nieuwe, naam: e.target.value })} />
                  <input type="date" value={nieuwe.start}
                    onChange={e => setNieuwe({ ...nieuwe, start: e.target.value })} />
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <label className="cb">
                    Structuur overnemen van
                    <select value={nieuwe.kopieVan}
                      onChange={e => setNieuwe({ ...nieuwe, kopieVan: e.target.value })}>
                      <option value="">niets — leeg beginnen</option>
                      {editions.map(e => <option key={e.id} value={e.id}>{e.naam}</option>)}
                    </select>
                  </label>
                </div>
                <div className="row" style={{ marginTop: 9 }}>
                  <button className="btn blauw" onClick={maakEditie}>Editie aanmaken</button>
                  <button className="btn quiet" onClick={() => setNieuwe(null)}>Annuleren</button>
                </div>
                <p className="hint">
                  De nieuwe editie start als concept. Dagen en diensttijden schuiven mee met de
                  startdatum; namen komen niet mee. Bestaande edities blijven ongewijzigd.
                </p>
              </>
            ) : (
              <button className="btn ghost" onClick={() => setNieuwe({
                naam: "", start: nextDate(curDays.map(d => d.datum)), kopieVan: cur.id,
              })}>Nieuwe editie…</button>
            )}
          </div>
        )}

        {admin && (() => {
          const zoek = norm(ledenZoek);
          const lijst = people.filter(p => !zoek || norm(p.naam).includes(zoek));
          return (
            <div className="panel">
              <span className="lab">Leden ({people.length})</span>
              <input className="zoek" placeholder="Zoek een naam…" value={ledenZoek}
                onChange={e => setLedenZoek(e.target.value)} />

              {merge && (
                <div className="mergebox">
                  <b>{people.find(p => p.id === merge.van)?.naam}</b> samenvoegen met een andere
                  persoon. Alle diensten en dubbelen worden overgezet; de eerste naam verdwijnt.
                  <div className="row">
                    <select value={merge.naar}
                      onChange={e => setMerge({ ...merge, naar: e.target.value })}>
                      <option value="">Kies de naam die blijft…</option>
                      {people.filter(p => p.id !== merge.van)
                        .map(p => <option key={p.id} value={p.id}>{p.naam}</option>)}
                    </select>
                    <button className="btn blauw" disabled={!merge.naar} onClick={voegSamen}>
                      Samenvoegen
                    </button>
                    <button className="btn quiet" onClick={() => setMerge(null)}>Annuleren</button>
                  </div>
                </div>
              )}

              <div className="ledenlijst">
                {lijst.map(p => {
                  const n = dienstenVan(p.id);
                  return (
                    <div className="erow" key={p.id} data-arch={!!p.gearchiveerd}>
                      <input defaultValue={p.naam} aria-label="Naam"
                        onBlur={e => hernoem(p, e.target.value)} />
                      <span className="cntx">{n} {n === 1 ? "dienst" : "diensten"}</span>
                      <button className="mini-btn"
                        onClick={() => setMerge({ van: p.id, naar: "" })}>Samenvoegen</button>
                      <button className="mini-btn" onClick={() => archiveer(p, !p.gearchiveerd)}>
                        {p.gearchiveerd ? "Terughalen" : "Archiveren"}
                      </button>
                      <button className="mini-btn rood" disabled={n > 0}
                        title={n > 0 ? "Staat nog op diensten" : "Definitief verwijderen"}
                        onClick={() => verwijderPersoon(p)}>Verwijderen</button>
                    </div>
                  );
                })}
                {lijst.length === 0 && <p className="hint">Geen naam gevonden.</p>}
              </div>

              <p className="hint">
                <b>Hernoemen</b> corrigeert een typefout; de persoon houdt al zijn diensten.
                <b> Samenvoegen</b> gebruik je bij een dubbele inschrijving.
                <b> Archiveren</b> haalt iemand uit de keuzelijst maar laat oude roosters intact.
                <b> Verwijderen</b> kan alleen bij iemand die nergens op staat.
              </p>
            </div>
          );
        })()}

        <nav className="tabs">
          {[["alle", "Alles"], ["todo", `Incompleet (${todo})`], ["mijn", `Mijn diensten (${t.mine})`]]
            .map(([k, label]) => (
              <button key={k} className="tab" data-on={tab === k} onClick={() => setTab(k)}>{label}</button>
            ))}
        </nav>

        <div className="legend">
          <span><i className="st ok">✓</i> compleet</span>
          <span><i className="st gap">1</i> aantal nog nodig</span>
          <span><i className="st seek">⇄</i> vervanger gezocht</span>
          <button className="foldall"
            onClick={() => setShut(v => v.length ? [] : curDays.map(d => d.id))}>
            {shut.length ? "Alles uitklappen" : "Alles inklappen"}
          </button>
        </div>

        {tab === "mijn" && mijnLijst.length > 0 && (
          <div className="cal">
            <span className="txt">
              <b>{mijnLijst.length === 1 ? "Je dienst" : `Je ${mijnLijst.length} diensten`} in je agenda</b>
              Werkt met Apple Agenda, Google Agenda en Outlook. Je krijgt twee uur vooraf een
              herinnering. Diensten tot sluitingstijd staan op 23.00.
            </span>
            <a className="btn blauw" href={icsHref(mijnLijst, cur.naam)}
              download={`bardiensten-${cur.naam.toLowerCase().replace(/\s+/g, "-")}.ics`}>
              Zet in mijn agenda
            </a>
          </div>
        )}

        {!curShifts.some(zichtbaarheid) && (
          <div className="empty">
            <b>{tab === "mijn" ? "Je staat nergens ingedeeld"
              : curDays.length === 0 ? "Nog geen dagen" : "Niets te doen"}</b>
            {tab === "mijn" ? "Kijk bij 'Incompleet' waar ze je kunnen gebruiken."
              : curDays.length === 0 ? "Zet beheer aan en voeg de eerste toernooidag toe."
                : "Wijzigingen verschijnen hier vanzelf."}
          </div>
        )}

        {curDays.map(dag => {
          const dd = shifts.filter(s => s.day_id === dag.id);
          const list = dd.filter(zichtbaarheid);
          if (!list.length && !admin) return null;
          const open = !shut.includes(dag.id);
          const dagBezet = dd.reduce((a, s) => a + rijenVan(s.id).length, 0);
          const dagCap = dd.reduce((a, s) => a + s.plekken, 0);

          return (
            <section className="day" key={dag.id}>
              <div className="dayhd">
                <button className="dayToggle" aria-expanded={open}
                  onClick={() => setShut(v => v.includes(dag.id) ? v.filter(x => x !== dag.id) : [...v, dag.id])}>
                  <span className="caret" data-open={open}>▼</span>
                  <h2>{fmtDay(dag.datum)}</h2>
                  {!open && (
                    <span className="mini">
                      {dd.map(s => <i key={s.id} style={{ background: COLOR[staatVan(s)] }} />)}
                    </span>
                  )}
                </button>
                <span className="cnt">{dagBezet}/{dagCap}</span>
                {admin && <button className="delday" onClick={() => verwijderDag(dag)}>Dag verwijderen</button>}
              </div>

              {open && list.map(s => {
                const rijen = rijenVan(s.id);
                const missing = s.plekken - rijen.length;
                const staat = staatVan(s);
                const mijnRij = me ? rijen.find(a => a.person_id === me.id) : null;
                const zoekRij = rijen.find(a => a.status === "zoekt_vervanger");
                const ikZoek = mijnRij && mijnRij.status === "zoekt_vervanger";

                return (
                  <article className={`shift${staat === "ok" ? " done" : ""}`} key={s.id}
                    data-cal={tab === "mijn" && !!mijnRij}>
                    <div className="wash" style={{ width: `${(rijen.length / s.plekken) * 100}%` }} />

                    {tab === "mijn" && mijnRij && (
                      <a className="ico icoTop" title="Zet deze dienst in mijn agenda"
                        aria-label="Zet deze dienst in mijn agenda"
                        href={icsHref([{ datum: dag.datum, s }], cur.naam)}
                        download={`bardienst-${dag.datum}.ics`}>
                        <Icon p={IC.agenda} />
                      </a>
                    )}

                    <div className="srow">
                      <span className={`st ${staat}`} title={
                        staat === "ok" ? "Compleet"
                          : staat === "seek" ? "Vervanger gezocht" : `Nog ${missing} nodig`}>
                        {GLYPH[staat] ?? missing}
                      </span>

                      <span className="time">{s.start_tijd}–{s.eind_tijd}</span>
                      {s.post !== "Bar" && <span className="tag">{s.post}</span>}

                      <span className="chips">
                        {rijen.map(a => {
                          const n = naamVan(a.person_id);
                          const zoekt = a.status === "zoekt_vervanger";
                          return (
                            <span key={a.id}
                              className={`chip${me && a.person_id === me.id ? " me" : ""}${zoekt ? " seek" : ""}`}
                              title={zoekt ? "Zoekt een vervanger" : undefined}>
                              {zoekt && "⇄ "}{n}
                              {admin && <button className="x" title="Van dienst halen"
                                onClick={() => haalVanDienst(dag, s, a)}>×</button>}
                            </span>
                          );
                        })}
                        {Array.from({ length: missing }).map((_, i) => (
                          <span className="chip open" key={i}>open</span>
                        ))}
                      </span>

                      <span className="right">
                        {ikZoek && (
                          <>
                            {sharing !== s.id && (
                              <button className="btn ghost sq" title="Bericht delen"
                                aria-label="Bericht delen" onClick={() => setSharing(s.id)}>
                                <Icon p={IC.bericht} />
                              </button>
                            )}
                            <button className="btn ghost" onClick={() => tochHouden(dag, s, mijnRij)}>
                              <Icon p={IC.terug} />Toch houden
                            </button>
                            <button className="btn" title="Definitief vrijgeven — de plek komt open voor iedereen"
                              onClick={() => vrijgeven(dag, s, mijnRij)}>Vrijgeven</button>
                          </>
                        )}

                        {mijnRij && !ikZoek && (
                          <button className="btn ghost" onClick={() => zoekVervanger(dag, s, mijnRij)}>
                            <Icon p={IC.ruil} />Vervanger zoeken
                          </button>
                        )}

                        {!mijnRij && zoekRij && (
                          <button className="btn blauw" title={`Neem de dienst over van ${naamVan(zoekRij.person_id)}`}
                            onClick={() => neemOver(dag, s, zoekRij)}>
                            <Icon p={IC.ruil} />Neem over
                          </button>
                        )}

                        {!mijnRij && !zoekRij && missing > 0 && (
                          <button className="btn" onClick={() => helpMee(dag, s)}>
                            <Icon p={IC.plus} />Ik help mee
                          </button>
                        )}
                      </span>
                    </div>

                    {ikZoek && sharing === s.id && (() => {
                      const txt = deelTekst(dag, s);
                      return (
                        <div className="share">
                          <div className="msg">{txt}</div>
                          <div className="row">
                            <a className="wa" target="_blank" rel="noreferrer"
                              href={`https://wa.me/?text=${encodeURIComponent(txt)}`}>
                              <Icon p={IC.bericht} />Delen via WhatsApp
                            </a>
                            <button className="btn ghost" onClick={() => kopieer(txt)}>Tekst kopiëren</button>
                            <button className="btn quiet" onClick={() => setSharing(null)}>Sluiten</button>
                          </div>
                        </div>
                      );
                    })()}

                    {admin && (
                      <div className="edit">
                        <label>van</label>
                        <input defaultValue={s.start_tijd}
                          onBlur={e => e.target.value !== s.start_tijd && wijzigDienst(s,
                            { start_tijd: e.target.value },
                            `zette de starttijd van ${fmtDay(dag.datum)} op ${e.target.value}`)} />
                        <label>tot</label>
                        <input defaultValue={s.eind_tijd}
                          onBlur={e => e.target.value !== s.eind_tijd && wijzigDienst(s,
                            { eind_tijd: e.target.value },
                            `zette de eindtijd van ${fmtDay(dag.datum)} op ${e.target.value}`)} />
                        <label>plekken</label>
                        <span className="stepper">
                          <button onClick={() => wijzigDienst(s, { plekken: Math.max(1, s.plekken - 1) },
                            `wijzigde het aantal plekken van ${wanneer(dag, s)}`)}>−</button>
                          <b>{s.plekken}</b>
                          <button onClick={() => wijzigDienst(s, { plekken: s.plekken + 1 },
                            `wijzigde het aantal plekken van ${wanneer(dag, s)}`)}>+</button>
                        </span>
                        <button className="del" onClick={() => verwijderDienst(dag, s)}>Verwijderen</button>
                      </div>
                    )}
                  </article>
                );
              })}

              {open && admin && (newFor === dag.id ? (
                <div className="newf">
                  <select value={draft.post} onChange={e => setDraft({ ...draft, post: e.target.value })}>
                    <option>Bar</option><option>Keuken</option><option>BBQ</option><option>Wedstrijdtafel</option>
                  </select>
                  <input value={draft.start} onChange={e => setDraft({ ...draft, start: e.target.value })} />
                  <input value={draft.end} onChange={e => setDraft({ ...draft, end: e.target.value })} />
                  <span className="stepper">
                    <button onClick={() => setDraft(d => ({ ...d, cap: Math.max(1, d.cap - 1) }))}>−</button>
                    <b>{draft.cap}</b>
                    <button onClick={() => setDraft(d => ({ ...d, cap: d.cap + 1 }))}>+</button>
                  </span>
                  <button className="btn blauw" onClick={() => voegDienstToe(dag)}>Toevoegen</button>
                  <button className="btn quiet" onClick={() => setNewFor(null)}>Annuleren</button>
                </div>
              ) : (
                <button className="addbtn" onClick={() => setNewFor(dag.id)}>+ Dienst op deze dag</button>
              ))}
            </section>
          );
        })}

        {admin && (
          <div className="newday">
            <b>Nieuwe dag</b>
            <input type="date" value={dayDraft || nextDate(curDays.map(d => d.datum))}
              onChange={e => setDayDraft(e.target.value)} />
            <button className="btn blauw" onClick={voegDagToe}>Dag toevoegen</button>
          </div>
        )}

        <section className="log">
          <button className="head" onClick={() => setLogOpen(o => !o)} aria-expanded={logOpen}>
            <span className="caret" data-open={logOpen}>▼</span>
            <span className="lab">Logboek</span>
            <span className="cnt">{log.length} wijziging{log.length === 1 ? "" : "en"}</span>
          </button>

          {logOpen && (
            <div className="logbody">
              {log.length === 0 ? (
                <p className="logleeg">Nog geen wijzigingen.</p>
              ) : (
                <div className="logrows">
                  {log.map(e => (
                    <div className="logrow" key={e.id}>
                      <time>{logTijd(e.created_at)}</time>
                      <span><span className="wie">{e.wie}</span> {e.tekst}
                        {e.beheer && <span className="bh">beheer</span>}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="loghint">
                Iedere wijziging is voor alle leden zichtbaar.
                {log.length > 0 && (
                  <a className="btn ghost sq" title="Exporteer als CSV" aria-label="Exporteer als CSV"
                    href={`data:text/csv;charset=utf-8,${encodeURIComponent(logCsv())}`}
                    download="logboek-bardiensten.csv">↓</a>
                )}
              </p>
            </div>
          )}
        </section>

        <p className="foot">
          Sta je er niet bij? Kies bovenin “Ik sta er nog niet bij” en vul je naam in.<br />
          Je naam wordt op dit toestel onthouden.
        </p>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
