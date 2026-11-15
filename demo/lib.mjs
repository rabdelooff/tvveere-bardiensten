import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");

/* DEMO_SNEL=1: proefrun zonder wachttijden, om een scenario snel te controleren.
   DEMO_SCHERMEN=1: bewaart aan het eind van elke scène een schermafbeelding in <uit>/schermen. */
const SNEL = !!process.env.DEMO_SNEL, SCHERMEN = !!process.env.DEMO_SCHERMEN;
export const slaap = (ms) => new Promise((r) => setTimeout(r, SNEL ? Math.min(ms, 250) : ms));
const hier = dirname(fileURLToPath(import.meta.url));
const TRIM = 0.35;   // seconden die aan het begin van de opname worden weggeknipt

/* Voice-over: demo/spraak/<video>.json bevat de zinnen, op volgorde van de titelkaarten en
   ondertitels. Staat er voor elke zin een fragment in demo/audio/<video>/NN.mp3, dan duurt elke
   scène zo lang als het fragment en komt het geluid onder de video. Zonder fragmenten wordt de
   duur geschat en blijft de video stil. */
function laadSpraak(video) {
  const pad = resolve(hier, "spraak", `${video}.json`);
  if (!existsSync(pad)) return [];
  return JSON.parse(readFileSync(pad, "utf8")).map((tekst, i) => {
    const audio = resolve(process.env.DEMO_AUDIO || resolve(hier, "audio"), video, `${String(i).padStart(2, "0")}.mp3`);
    const heeft = existsSync(audio);
    const duur = heeft
      ? Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audio]).toString())
      : 0.6 + tekst.length / 15;
    return { tekst, audio: heeft ? audio : null, duur };
  });
}

export async function opname({ naam, vorm, demo, hash = "", scenario, uit, spraak: video }) {
  const zinnen = laadSpraak(video); let zinNr = 0, schermNr = 0;
  if (SCHERMEN) mkdirSync(`${uit}/schermen`, { recursive: true });
  const maat = vorm === "phone" ? { w: 450, h: 800, schaal: 2.4 } : { w: 1280, h: 720, schaal: 1.5 };
  const tmp = `${uit}/raw-${naam}`;
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const browser = await chromium.launch({ args: ["--lang=nl-NL"], env: { ...process.env, LANG: "nl_NL.UTF-8", LANGUAGE: "nl" } });
  const context = await browser.newContext({
    viewport: { width: Math.round(maat.w * maat.schaal), height: Math.round(maat.h * maat.schaal) }, deviceScaleFactor: 1, locale: "nl-NL", timezoneId: "Europe/Amsterdam",
    serviceWorkers: "block", hasTouch: false,
    recordVideo: { dir: tmp, size: { width: Math.round(maat.w * maat.schaal), height: Math.round(maat.h * maat.schaal) } },
  });
  await context.addInitScript(() => {
    if (window.top === window) return;
    let sub = null;
    const nep = { endpoint: "https://push.voorbeeld/demo", toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "x", auth: "y" } }; },
      async unsubscribe() { sub = null; return true; } };
    try {
      Object.defineProperty(Notification, "permission", { get: () => window.__perm || "default" });
      Notification.requestPermission = async () => (window.__perm = "granted");
      Object.defineProperty(navigator.serviceWorker, "ready",
        { get: () => Promise.resolve({ pushManager: { getSubscription: async () => sub, subscribe: async () => (sub = nep) } }) });
    } catch (e) { console.error("push-nep mislukt", e); }
  });
  const page = await context.newPage();
  const t0 = Date.now();
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log("[console]", m.text().slice(0, 300)); });
  const appUrl = `/?demo=${demo}${hash}`;
  await page.goto(`http://localhost:5199/__stage?vorm=${vorm}&zoom=${maat.schaal}&app=${encodeURIComponent(appUrl)}`);
  const app = page.frameLocator("#app");
  const frame = () => page.frame({ name: "app" });
  const st = (fn, ...a) => page.evaluate(([f, args]) => window.stage[f](...args), [fn, a]);

  const h = {
    page, app, frame, slaap,
    /* ondertitel tonen en lang genoeg laten staan om te lezen */
    /* volgende zin van de voice-over: onthoudt het tijdstip en geeft de duur in ms terug */
    zeg() {
      const z = zinnen[zinNr++];
      if (!z) return 0;
      z.start = (Date.now() - t0) / 1000 - TRIM;
      return z.duur * 1000;
    },
    async cap(html, extra = 0) {
      await h.lees();                      // vorige zin eerst laten uitspreken
      await st("cap", html);
      const tekens = html.replace(/<[^>]+>/g, "").length;
      h._tot = Date.now() + Math.max(2600, 1100 + tekens * 62, h.zeg() + 450) + extra;
    },
    async lees() {
      const rest = (h._tot || 0) - Date.now(); if (rest > 0) await slaap(rest);
      if (SCHERMEN && h._tot) { h._tot = 0; await page.screenshot({ path: `${uit}/schermen/${naam}-${String(zinNr - 1).padStart(2, "0")}-${++schermNr}.png` }); }
    },
    async wijs(loc, { blok = "center" } = {}) {
      const el = typeof loc === "string" ? app.locator(loc).first() : loc;
      await el.waitFor({ state: "visible", timeout: 8000 });
      await el.evaluate((n, b) => n.scrollIntoView({ behavior: "smooth", block: b }), blok);
      await slaap(650);
      const bb = await el.boundingBox();
      await st("naar", bb.x + Math.min(bb.width / 2, 260), bb.y + bb.height / 2);
      await slaap(700);
      return el;
    },
    async tik(loc, opt) {
      const el = await h.wijs(loc, opt);
      await st("druk"); await slaap(170);
      await el.evaluate((n) => { if (n.matches("input, textarea, select")) n.focus(); else n.click(); });
      await slaap(650);
      return el;
    },
    async typ(loc, tekst, delay = 65) {
      const el = await h.tik(loc);
      await el.pressSequentially(tekst, { delay });
      await slaap(350);
    },
    knop: (naam) => app.getByRole("button", { name: naam, exact: true }).first(),
    async titel(...a) { await h.lees(); await st("titel", ...a); await slaap(500); h._tot = Date.now() + Math.max(3200, h.zeg() + 600); },
    titelWeg: () => st("titelWeg"),
    async tussen(html, ms, doe) {
      await h.lees(); await st("curWeg"); await st("skip", html); await slaap(500);
      const klaar = Date.now() + Math.max(ms, h.zeg() + 400);
      if (doe) await doe();
      await slaap(Math.max(0, klaar - Date.now()));
      if (SCHERMEN) await page.screenshot({ path: `${uit}/schermen/${naam}-${String(zinNr - 1).padStart(2, "0")}-${++schermNr}.png` });
      await st("skipWeg"); await slaap(500);
    },
    curWeg: () => st("curWeg"),
    demo: (fn, arg) => frame().evaluate(fn, arg),
  };

  let fout = null;
  try { await scenario(h); } catch (e) { fout = e; await page.screenshot({ path: `${uit}/fout-${naam}.png` }); }
  const duur = (Date.now() - t0) / 1000;
  await context.close(); await browser.close();
  if (fout) throw fout;
  const webm = readdirSync(tmp).find((f) => f.endsWith(".webm"));
  renameSync(`${tmp}/${webm}`, `${uit}/${naam}.webm`);
  if (zinNr !== zinnen.length) console.warn(`Let op: ${zinnen.length} zinnen in spraak/${video}.json, ${zinNr} gebruikt`);
  const metGeluid = zinnen.length > 0 && zinnen.every((z) => z.audio && z.start !== undefined);
  const stil = metGeluid ? `${uit}/${naam}-stil.mp4` : `${uit}/${naam}.mp4`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(TRIM), "-i", `${uit}/${naam}.webm`, "-r", "30",
    "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", stil]);
  writeFileSync(`${uit}/${naam}-spraak.json`, JSON.stringify(zinnen.map(({ tekst, start, duur: d }) => ({ start, duur: d, tekst })), null, 1));
  if (metGeluid) {
    const filters = zinnen.map((z, i) => `[${i + 1}:a]adelay=${Math.round(z.start * 1000)}:all=1[a${i}]`);
    filters.push(`${zinnen.map((_, i) => `[a${i}]`).join("")}amix=inputs=${zinnen.length}:normalize=0,apad[uit]`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", stil, ...zinnen.flatMap((z) => ["-i", z.audio]),
      "-filter_complex", filters.join(";"), "-map", "0:v", "-map", "[uit]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
      "-shortest", "-movflags", "+faststart", `${uit}/${naam}.mp4`]);
    rmSync(stil);
  }
  console.log(`${naam}: ${duur.toFixed(1)} s, ${metGeluid ? "met voice-over" : "zonder geluid"}`);
}
