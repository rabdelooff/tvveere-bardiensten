# Bardiensten · TV Veere

Rooster voor kantinediensten per toernooi-editie. React + Vite, data in Supabase,
geen inlogsysteem: je naam wordt lokaal op je toestel onthouden.

---

## 1. Wat je nodig hebt

Uit Supabase → Project Settings → API:

- **Project URL** — `https://xxxx.supabase.co`
- **anon public key** — begint met `eyJ...`

De database moet al zijn ingericht met `supabase_setup.sql`.

---

## 2. Zonder lokale tools: GitHub + Vercel

1. Maak op github.com een nieuwe repository, bijvoorbeeld `tvveere-bardiensten`.
   Zet hem op **Public** — dan kan een opvolger er ooit bij zonder jouw wachtwoorden.
2. Kies **uploading an existing file** en sleep alle bestanden uit deze map erin
   (`src/`, `package.json`, `index.html`, `vite.config.js`, `.gitignore`, `README.md`).
   Upload `.env` **niet**; die bestaat hier ook niet.
3. Ga naar vercel.com, log in met GitHub, kies **Add New → Project** en importeer de repo.
   Vercel herkent Vite vanzelf.
4. Vóór het deployen: klap **Environment Variables** open en vul in:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | je Project URL |
   | `VITE_SUPABASE_ANON_KEY` | je anon public key |
   | `VITE_BEHEER_CODE` | een zelfgekozen code |

5. **Deploy**. Na een minuut staat het op `https://iets.vercel.app`.

Elke wijziging die je later in GitHub opslaat, wordt automatisch opnieuw uitgerold.

### Eigen adres
In Vercel → Settings → Domains kun je `bardiensten.tvveere.nl` toevoegen.
Dat vraagt één CNAME-record bij de partij waar het domein staat.

---

## 3. Wel lokale tools

```bash
npm install
cp .env.example .env      # vul je eigen waarden in
npm run dev               # http://localhost:5173
```

Bouwen: `npm run build`, resultaat staat in `dist/`.

---

## 4. Hoe het werkt

**Wie ben je.** Bij het eerste bezoek kies je je naam of voeg je jezelf toe. Die keuze
staat in `localStorage`, dus je hoeft het maar één keer te doen per toestel. Wist iemand
zijn browsergegevens, dan kiest hij zijn naam opnieuw — er gaat niets verloren.

**Beheer.** De schakelaar rechtsboven vraagt om `VITE_BEHEER_CODE`. Die code staat in de
browserbundel en is dus geen echte beveiliging, alleen een drempel tegen per ongeluk
klikken. Wie het wil, komt eromheen. Het logboek is je vangnet.

**Logboek.** Iedere wijziging wordt vastgelegd met naam en tijdstip en is voor alle leden
zichtbaar. In de database is de tabel append-only: niemand kan regels wijzigen of wissen.

**Capaciteit.** De database bewaakt dat er nooit meer mensen op een dienst staan dan er
plekken zijn, ook als twee mensen tegelijk op de laatste plek drukken.

**Realtime.** Het bord ververst zichzelf zodra iemand anders iets wijzigt.

---

## 5. Bij een volgende editie

Beheer aan → **Nieuwe editie…** → naam, startdatum, en kies van welke editie je de
dagen en diensttijden overneemt. De nieuwe editie start als concept en is dus nog niet
zichtbaar voor leden. Vul hem in, zet hem op **Open**, en zet de vorige op **Gesloten**.

---

## 6. Onderhoud

- Maak af en toe een back-up: Supabase → Table Editor → per tabel exporteren als CSV.
  Of gebruik de exportknop in het logboek voor de wijzigingsgeschiedenis.
- Namen van leden zijn persoonsgegevens. Noteer dit in het verwerkingsregister van de
  vereniging en verwijder oude edities als ze niet meer nodig zijn.
- Zorg dat een tweede bestuurslid toegang heeft tot de Supabase-, GitHub- en
  Vercel-accounts.
