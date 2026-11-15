# Bardiensten · TV Veere

Rooster voor kantinediensten per toernooi-editie. React + Vite, data en inlog in Supabase.

- **Vrijwilligers** loggen in met een mail (magic link of code), melden zich aan voor diensten
  en zien hun gepubliceerde rooster.
- **Beheerders** delen in, publiceren het rooster, keuren vervangers goed en sturen oproepen.
- De app is te installeren op de telefoon en stuurt pushmeldingen.

---

## 1. Hoe het werkt

| Stap | Wie | Wat |
|---|---|---|
| Aanmelden | vrijwilliger | "Ik kan deze dienst". Dit is nog géén toewijzing. Anderen zien niet wie zich aanmeldde. |
| Opmerking | vrijwilliger | Eén algemene opmerking per editie voor de beheerder, bijvoorbeeld "ik meld me aan voor vier diensten, maar wil er maximaal één draaien". Alleen beheerders zien dit, bij het indelen. |
| Indelen | beheerder | Kiest per dienst uit de aanmeldingen (of iemand anders). Dit is een concept. |
| Publiceren | beheerder | Maakt het concept zichtbaar. Iedereen die erbij komt of vervalt, krijgt een melding. |
| Vervanger zoeken | vrijwilliger | "Ik kan toch niet": alle anderen krijgen bericht. De dienst blijft van jou. |
| Overnemen | vrijwilliger + beheerder | Iemand biedt zich aan, de beheerder keurt goed. Beiden krijgen bericht. |
| Oproep | beheerder | Pushmelding voor een dienst die niet vol komt; staat bij iedereen bovenaan. |
| Herinnering | automatisch | De dag vóór de dienst om 18.00 uur. |

**Beheerders.** De allereerste persoon die inlogt, wordt beheerder. Daarna maak je anderen
beheerder bij *Beheer → Mensen*. Er blijft altijd minstens één beheerder over.

**Registratie is vrij.** Iedereen met een e-mailadres kan inloggen en ziet dan het gepubliceerde
rooster met namen. Ongewenste accounts blokkeer je bij *Beheer → Mensen*.

---

## 2. Eenmalig instellen in Supabase

Deze stappen kunnen alleen in het Supabase-dashboard.

### a. Adres van de app
*Authentication → URL Configuration*
- **Site URL**: het adres van de app, bijvoorbeeld `https://bardiensten.tvveere.nl`
- **Redirect URLs**: hetzelfde adres met `/**` erachter (en eventueel `http://localhost:5173/**`)

### b. Mail versturen via Gmail
De ingebouwde mail van Supabase verstuurt maar een paar mails per uur. Stel daarom een eigen
afzender in bij *Authentication → Emails → SMTP Settings*:

1. Zet in het Google-account van de vereniging **tweestapsverificatie** aan.
2. Maak op <https://myaccount.google.com/apppasswords> een **app-wachtwoord** aan.
3. Vul in Supabase in:

   | Veld | Waarde |
   |---|---|
   | Sender email | het Gmail-adres van de vereniging |
   | Sender name | `Bardiensten TV Veere` |
   | Host | `smtp.gmail.com` |
   | Port | `465` |
   | Username | het Gmail-adres |
   | Password | het app-wachtwoord (16 tekens) |

4. Zet daarna bij *Authentication → Rate Limits* het aantal mails per uur op bijvoorbeeld 100.

Gmail staat ongeveer 500 mails per dag toe; ruim voldoende.

### c. Mail in de stijl van TV Veere
*Authentication → Emails → Templates*. Plak de inhoud van:

| Template | Bestand | Onderwerp |
|---|---|---|
| Magic Link | `supabase/email/magic-link.html` | Inloggen bij Bardiensten TV Veere |
| Confirm signup | `supabase/email/bevestig-aanmelding.html` | Welkom bij Bardiensten TV Veere |

Beide mails bevatten een knop én een code. De code is nodig voor wie de app op een iPhone heeft
geïnstalleerd: de knop opent daar Safari in plaats van de app.

---

## 3. Uitrollen (GitHub + Vercel)

Vercel heeft twee omgevingsvariabelen nodig (*Settings → Environment Variables*):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL uit Supabase → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | anon public key |

`VITE_BEHEER_CODE` wordt niet meer gebruikt en mag weg. Elke wijziging op de hoofdbranch
wordt automatisch uitgerold.

Lokaal:

```bash
npm install
cp .env.example .env      # vul je eigen waarden in
npm run dev               # http://localhost:5173
```

---

## 4. Database en push

- `supabase/migrations/` bevat het volledige schema, de rechten (RLS) en alle functies.
- `supabase/functions/push/` is de edge function die pushberichten verstuurt. De database
  roept hem aan zodra er een melding bijkomt (via `pg_net`). De VAPID-sleutels maakt de
  functie zelf aan en bewaart ze in de tabel `push_config`; die is voor niemand leesbaar.
- Bij een nieuw Supabase-project: migraties uitvoeren, de functie deployen (zonder JWT-controle)
  en één rij toevoegen:

  ```sql
  insert into public.push_config values
    ('functie_url', 'https://<project-ref>.supabase.co/functions/v1/push');
  ```

- De oude namenlijst en indelingen (zonder inlog) staan in het schema `archief`. Niet meer
  nodig? Dan kan dat schema weg met `drop schema archief cascade;`.

**Pushmeldingen op iPhone** werken alleen als de app op het beginscherm staat (iOS 16.4 of
nieuwer). De app legt dat stap voor stap uit. Wie geen push heeft, ziet dezelfde berichten in
de app onder *Meldingen*.

---

## 5. Bij een volgende editie

*Beheer → Rooster opzetten → Nieuwe editie*: geef een naam, kies van welke editie je de dagen
en diensten overneemt en wat de eerste dag wordt. De nieuwe editie start als **Concept**.
Zet hem op **Open** zodra mensen zich mogen aanmelden, en de vorige op **Gesloten**.

---

## 6. Onderhoud

- Namen en e-mailadressen zijn persoonsgegevens. Noteer dit in het verwerkingsregister van de
  vereniging en verwijder oude edities en het archief als ze niet meer nodig zijn.
- Zorg dat een tweede bestuurslid beheerder is in de app en toegang heeft tot de Supabase-,
  GitHub- en Vercel-accounts.
- Back-up: Supabase → Table Editor → per tabel exporteren als CSV.
