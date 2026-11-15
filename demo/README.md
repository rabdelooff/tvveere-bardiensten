# Uitlegvideo's opnemen

Scripts waarmee de twee uitlegvideo's (vrijwilligers en beheerders) worden opgenomen.
De app draait hierbij op een nep-database in het geheugen (`fake-supabase.js`) met fictieve
namen; de echte Supabase-database wordt niet aangeraakt. De nepversie moet wel meegroeien met de
app: komt er een tabel of databasefunctie bij, voeg die dan ook toe in `fake-supabase.js`.

## Opnemen

Nodig: Node, Playwright met Chromium, en `ffmpeg`.

```bash
npm ci
node demo/serve.mjs &            # demo-versie van de app op poort 5199
node demo/vrijwilliger.mjs /pad/naar/uitvoermap
node demo/beheerder.mjs /pad/naar/uitvoermap
```

Proefdraaien zonder wachttijden en zonder geluid, met een schermafbeelding per scène:

```bash
DEMO_SNEL=1 DEMO_SCHERMEN=1 DEMO_AUDIO=/tmp/leeg node demo/beheerder.mjs demo/uitvoer
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

Stand van zaken: inspreken gaat via de ElevenLabs-koppeling (stem Jose, een eigen gekloonde stem,
model `eleven_v4`, flow "Bardiensten uitlegvideo's voice-over (Jose)"). `spraak/ingesproken.json`
houdt bij welke zinnen zijn ingesproken (zinnummer → generation-id); alle zinnen van beide video's
zijn ingesproken en de 39 mp3's staan in `audio/vrijwilliger/` (19) en `audio/beheerder/` (20),
samen ongeveer 4 MB. De generations staan in flow `MeFyeOdbRt9Mez2ir5Fl`. Wil je de mp3's opnieuw
ophalen, vraag dan met `creative_get_flow_run_status` of `creative_get_generations` verse
(tijdelijke) signed URL's op; genereer niets opnieuw, dat kost credits (ongeveer 1 credit per teken
per take; beide video's samen ruim 3.000 credits bij één take per zin).

Verandert er een knop of scherm in de app, pas dan de zin in `spraak/*.json` én de ondertitel in
het scenario aan en spreek alleen die zin opnieuw in.

Om rekening mee te houden:

- De audiobestanden staan op `elevenlabsusercontent.com`; dat domein moet in de
  netwerkinstellingen van de omgeving zijn toegestaan om ze opnieuw te kunnen downloaden.
  Voor het opnemen zelf is dat niet nodig, omdat de mp3's in de repo staan.
