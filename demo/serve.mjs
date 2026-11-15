import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const hier = dirname(fileURLToPath(import.meta.url));
const repo = resolve(hier, "..");
const { createServer } = await import(`${repo}/node_modules/vite/dist/node/index.js`);
const react = (await import(`${repo}/node_modules/@vitejs/plugin-react/dist/index.js`)).default;
const nep = resolve(hier, "fake-supabase.js");
const server = await createServer({
  configFile: false, root: repo, logLevel: "warn",
  server: { port: 5199, strictPort: true, fs: { allow: [repo, hier] } },
  plugins: [react(), {
    name: "demo", enforce: "pre",
    resolveId(bron, importer) { if (importer?.startsWith(`${repo}/src/`) && /^\.\/supabase(\.js)?$/.test(bron)) return nep; return null; },
    configureServer(s) {
      s.middlewares.use("/__stage", (_req, res) => { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(readFileSync(resolve(hier, "stage.html"))); });
    },
  }],
});
await server.listen();
console.log("klaar op 5199");
