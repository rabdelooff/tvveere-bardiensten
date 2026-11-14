# Uitlegvideo's opnemen

Scripts waarmee de twee uitlegvideo's (vrijwilligers en beheerders) worden opgenomen.
De app draait hierbij op een nep-database in het geheugen (`fake-supabase.js`) met fictieve
namen; de echte Supabase-database wordt niet aangeraakt en de app-code zelf blijft ongewijzigd.

## Opnemen

Nodig: Node, Playwright met Chromium, en `ffmpeg`.

```bash
npm ci
node demo/serve.mjs &            # demo-versie van de app op poort 5199
node demo/vrijwilliger.mjs /pad/naar/uitvoermap
node demo/beheerder.mjs /pad/naar/uitvoermap
```

Resultaat: `bardiensten-vrijwilliger.mp4` (staand, 1080×1920) en
`bardiensten-beheerder.mp4` (liggend, 1920×1080), met ondertitels in beeld.

## Opbouw

| Bestand | Wat |
|---|---|
| `serve.mjs` | Vite-server die `src/supabase.js` vervangt door de nepversie en het opnamepodium serveert |
| `fake-supabase.js` | Nep-Supabase: tabellen, inlog en de databasefuncties (publiceren, oproep, vervanger) |
| `stage.html` | Het podium: de app in een kader, met ondertitel, cursor en titelkaarten |
| `lib.mjs` | Hulpfuncties voor de opname (`cap`, `tik`, `typ`, `tussen`) en omzetting naar mp4 |
| `vrijwilliger.mjs`, `beheerder.mjs` | De scenario's: wat er achtereenvolgens gebeurt en welke tekst erbij staat |

## Nog te doen: voice-over

Plan: per ondertitel (`h.cap(...)`) een spreektekst laten inspreken via ElevenLabs
(`ELEVENLABS_API_KEY`, domein `api.elevenlabs.io` moet bereikbaar zijn), de wachttijd per scène
afstemmen op de lengte van het audiofragment, en de fragmenten met `ffmpeg` op de juiste
tijdstippen onder de video zetten. De ondertitels blijven staan.
