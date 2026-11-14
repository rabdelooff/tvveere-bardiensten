import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");

export const slaap = (ms) => new Promise((r) => setTimeout(r, ms));

export async function opname({ naam, vorm, demo, hash = "", scenario, uit }) {
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
    async cap(html, extra = 0) {
      await st("cap", html);
      const tekens = html.replace(/<[^>]+>/g, "").length;
      h._tot = Date.now() + Math.max(2600, 1100 + tekens * 62) + extra;
    },
    async lees() { const rest = (h._tot || 0) - Date.now(); if (rest > 0) await slaap(rest); },
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
    titel: (...a) => st("titel", ...a), titelWeg: () => st("titelWeg"),
    async tussen(html, ms, doe) { await st("curWeg"); await st("skip", html); await slaap(500); if (doe) await doe(); await slaap(ms); await st("skipWeg"); await slaap(500); },
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
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "0.35", "-i", `${uit}/${naam}.webm`, "-r", "30",
    "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${uit}/${naam}.mp4`]);
  console.log(`${naam}: ${duur.toFixed(1)} s`);
}
