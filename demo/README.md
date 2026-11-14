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
| `spraak/*.json` | De spreekteksten voor de voice-over |

## Voice-over

De spreekteksten staan in `spraak/vrijwilliger.json` en `spraak/beheerder.json`: één zin per
titelkaart, ondertitel of tussenkaart, in de volgorde van het scenario.

Zet de ingesproken fragmenten als `audio/<video>/00.mp3`, `01.mp3`, … in deze map (of wijs met
`DEMO_AUDIO` een andere map aan). Bij de opname duurt elke scène dan zo lang als het fragment en
komt het geluid op het juiste moment onder de video. Ontbreken er fragmenten, dan wordt de duur
geschat en blijft de video stil. Naast elke video komt een `…-spraak.json` met de starttijden.

Stand van zaken: de fragmenten zijn nog niet ingesproken. Inspreken gaat via de
ElevenLabs-koppeling (stem Leonie, model `eleven_v4`, flow "Bardiensten uitlegvideo's
voice-over"). De audiobestanden staan op `elevenlabsusercontent.com`; dat domein moet in de
netwerkinstellingen van de omgeving zijn toegestaan om ze te kunnen downloaden.
