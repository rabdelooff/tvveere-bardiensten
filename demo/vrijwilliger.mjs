import { opname, slaap } from "./lib.mjs";

await opname({
  naam: "bardiensten-vrijwilliger", vorm: "phone", demo: "vrijwilliger", uit: process.argv[2], spraak: "vrijwilliger",
  async scenario(h) {
    const { app } = h;
    await h.titel("TV Veere · Bardiensten", "Zo werkt de app", "Uitleg voor vrijwilligers\nin twee minuten");
    await app.locator("#email").waitFor();
    await h.lees();
    await h.titelWeg();

    /* 1. inloggen */
    await h.cap("<small>Stap 1 · Inloggen</small>Vul je <b>e-mailadres</b> in. Een wachtwoord heb je niet nodig.");
    await slaap(900);
    await h.typ("#email", "sanne@voorbeeld.nl", 55);
    await h.tik(h.knop("Stuur mij een inlogmail"));
    await h.lees();
    await h.cap("Je krijgt een mail. Tik daarin op <b>Inloggen</b>, of typ de code over.");
    await slaap(1200);
    await h.typ("#code", "482913", 110);
    await h.tik(h.knop("Inloggen met code"));
    await h.lees();
    await h.cap("De eerste keer vul je je <b>naam</b> in.");
    await h.typ("#naam", "Sanne Jansen", 70);
    await h.tik(h.knop("Verder"));
    await h.lees();

    /* 2. app en meldingen */
    await h.cap("<small>Stap 2 · Eenmalig instellen</small>Zet de app op je <b>beginscherm</b>…");
    await h.tik(h.knop("Zet op mijn telefoon"));
    await h.lees();
    await h.tik(h.knop("Begrepen"));
    await h.cap("…en zet <b>meldingen</b> aan. Dan mis je niets.");
    await h.tik(h.knop("Zet meldingen aan"));
    await h.lees();

    /* 3. aanmelden */
    await h.cap("<small>Stap 3 · Aanmelden</small>Bekijk alle diensten van het toernooi.");
    await h.tik(h.knop("Alle diensten"));
    await h.lees();
    await h.cap("Tik op <b>Ik kan</b> bij elke dienst waarop je kunt. Hoe meer, hoe beter.");
    const kaart = (dag, tijd) => app.locator(`section:has(h2:has-text("${dag}")) article:has-text("${tijd}")`);
    await h.tik(kaart("zaterdag", "14.00 – 18.00").getByRole("button", { name: "Ik kan", exact: true }));
    await slaap(900);
    await h.tik(kaart("zondag", "10.00 – 14.00").getByRole("button", { name: "Ik kan", exact: true }));
    await h.lees();
    await h.cap("Iets kwijt? Zet er een <b>opmerking</b> voor de beheerder bij.");
    await h.tik(h.knop("Opmerking toevoegen"));
    await h.typ("section.opmerking textarea", "Ik wil maximaal één dienst draaien.", 45);
    await h.tik(app.locator("section.opmerking").getByRole("button", { name: "Opslaan", exact: true }));
    await h.lees();
    await h.cap("Let op: aanmelden is nog <b>geen indeling</b>. De beheerder maakt het rooster.");
    await h.tik('a.nav-item[href="#/mijn"]');
    await h.wijs(app.locator("h2.sectie", { hasText: "Aangemeld" }), { blok: "start" });
    await h.lees();

    /* 4. ingedeeld */
    await h.tussen("<small>Even later</small>De beheerder publiceert het rooster", 2200, () => h.demo(() => {
      const d = window.__demo, ik = d.uid();
      const zet = (s, namen) => namen.forEach((n) => d.rij("toewijzingen", { shift_id: s.id, profile_id: n === "ik" ? ik : d.pNaam(n).id, status: "ingedeeld" }));
      zet(d.dienst(0, "18.00"), ["Tom Smits", "Eva Mulder"]);
      zet(d.dienst(1, "10.00"), ["Lotte Visser", "Daan Meijer"]);
      zet(d.dienst(1, "14.00"), ["ik", "Pieter Bakker"]);
      zet(d.dienst(1, "18.00"), ["Femke Bos", "Joost Vos"]);
      zet(d.dienst(2, "10.00"), ["Lotte Visser", "Pieter Bakker"]);
      zet(d.dienst(2, "14.00"), ["Tom Smits", "Femke Bos"]);
      zet(d.dienst(2, "16.00", "BBQ"), ["Daan Meijer"]);
      d.meld(ik, "rooster", "Je bent ingedeeld", d.label(d.dienst(1, "14.00").id), "/#/mijn");
      window.scrollTo(0, 0);
      d.ververs();
    }));
    await h.cap("<small>Stap 4 · Je rooster</small>Je krijgt een <b>melding</b> zodra je bent ingedeeld.");
    await h.tik("header.top button.rond");
    await h.lees();
    await h.tik(".melding");
    await h.cap("Onder <b>Mijn diensten</b> zie je wanneer je staat, en met wie.");
    await h.wijs(app.locator("article.van-mij"));
    await h.lees();
    await h.cap("Zet de dienst in je <b>agenda</b>. De dag ervoor krijg je een herinnering.");
    await h.wijs(app.locator('article.van-mij a[aria-label="Zet in mijn agenda"]'));
    await h.lees();

    /* 5. toch niet kunnen */
    await h.cap("<small>Kun je toch niet?</small>Tik op <b>Kan niet</b> om een vervanger te zoeken.");
    await h.tik(h.knop("Kan niet"));
    await h.lees();
    await h.tik(h.knop("Ja, zoek een vervanger"));
    await h.cap("Iedereen krijgt bericht. De dienst blijft <b>van jou</b> tot de beheerder een vervanger goedkeurt.");
    await h.wijs(app.locator("article.van-mij .blok.oranje"));
    await h.lees();

    /* 6. iemand helpen */
    await h.demo(() => {
      const d = window.__demo;
      const t = d.db.toewijzingen.find((x) => x.shift_id === d.dienst(0, "18.00").id && x.profile_id === d.pNaam("Tom Smits").id);
      d.zoekVervanger(t.id); d.ververs();
    });
    await h.cap("<small>Iemand anders helpen?</small>Bovenaan staat waar <b>hulp gezocht</b> wordt.");
    await h.wijs(app.locator("h2.sectie.oranje"), { blok: "start" });
    await h.lees();
    await h.cap("Tik op <b>Ik neem over</b>. De beheerder regelt de rest.");
    await h.tik(h.knop("Ik neem over"));
    await h.lees();
    await h.curWeg();

    await h.titel("Samengevat", "Aanmelden. Melding. Klaar.", "1. Meld je aan voor diensten waarop je kunt\n2. Je krijgt bericht als je bent ingedeeld\n3. Kun je niet? Zoek een vervanger in de app");
    await h.lees();
    await slaap(2500);
  },
});
