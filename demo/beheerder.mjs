import { opname, slaap } from "./lib.mjs";

await opname({
  naam: "bardiensten-beheerder", vorm: "desk", demo: "admin", hash: "#/beheer/opzet", uit: process.argv[2],
  async scenario(h) {
    const { app } = h;
    const tab = (n) => app.locator(".subnav button", { hasText: n }).first();
    const zij = app.locator("aside.zij");
    const kaart = (dag, tekst) => app.locator(`section:has(h2:has-text("${dag}")) button.indeel`, { hasText: tekst }).first();
    const indelen = (naam) => zij.locator("li", { hasText: naam }).getByRole("button", { name: "Indelen" });

    await h.titel("TV Veere · Bardiensten", "Zo werkt het beheer", "Uitleg voor beheerders: van rooster opzetten tot publiceren");
    await h.knop("Nieuwe editie").waitFor();
    await slaap(3400);
    await h.titelWeg();

    /* 1. opzetten */
    await h.cap("<small>Stap 1 · Rooster opzetten</small>Alles voor beheerders staat onder <b>Beheer</b>. Begin met een nieuwe editie.");
    await h.wijs('a.nav-item[href="#/beheer"]');
    await h.lees();
    await h.tik(h.knop("Nieuwe editie"));
    await h.cap("Geef een naam en neem de dagen en diensten over van een <b>eerdere editie</b>.");
    await h.typ('input[placeholder^="Bijvoorbeeld Veere Open"]', "Veere Open winter 2026", 45);
    const start = await h.demo(() => { const d = new Date(); d.setDate(d.getDate() + 4); while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
      return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); });
    const datum = await h.wijs('.blok input[type="date"]');
    await datum.fill(start); await slaap(500);
    await h.lees();
    await h.tik(h.knop("Editie aanmaken"));
    await slaap(1200);
    await h.cap("Pas daarna aan wat anders is: dagen, tijden, posten en het <b>aantal plekken</b>.");
    const zondag = app.locator(".kaart", { has: app.locator("h3", { hasText: "zondag" }) });
    await h.tik(zondag.getByRole("button", { name: "Dienst toevoegen" }));
    const nieuw = app.locator(".dienst-bewerk.nieuw");
    await (await h.wijs(nieuw.locator("select"))).selectOption("BBQ"); await slaap(400);
    await (await h.wijs(nieuw.locator("input.tijd").nth(0))).fill("16.00"); await slaap(300);
    await (await h.wijs(nieuw.locator("input.tijd").nth(1))).fill("19.00"); await slaap(300);
    await h.tik(nieuw.getByRole("button", { name: "Eén minder" }));
    await h.tik(nieuw.getByRole("button", { name: "Toevoegen", exact: true }));
    await h.lees();
    await h.cap("Zet de editie op <b>Open</b>. Pas dan zien vrijwilligers de diensten en kunnen ze zich aanmelden.");
    await (await h.wijs("li.editie-rij.gekozen select")).selectOption("open");
    await h.lees();

    /* 2. indelen */
    await h.tussen("<small>Even later</small>De vrijwilligers melden zich aan", 2200, async () => {
      await h.demo(() => {
        const d = window.__demo;
        const aan = (s, namen) => namen.forEach((n) => d.rij("aanmeldingen", { shift_id: s.id, profile_id: d.pNaam(n).id }));
        aan(d.dienst(0, "18.00"), ["Tom Smits"]);
        aan(d.dienst(1, "10.00"), ["Lotte Visser", "Daan Meijer", "Sanne Jansen"]);
        aan(d.dienst(1, "14.00"), ["Sanne Jansen", "Pieter Bakker", "Eva Mulder"]);
        aan(d.dienst(1, "18.00"), ["Femke Bos", "Joost Vos"]);
        aan(d.dienst(2, "10.00"), ["Lotte Visser", "Sanne Jansen", "Pieter Bakker"]);
        aan(d.dienst(2, "14.00"), ["Tom Smits", "Femke Bos", "Eva Mulder"]);
        d.ververs();
      });
      await tab("Indelen").evaluate((n) => n.click());
      await h.frame().evaluate(() => window.scrollTo(0, 0));
    });
    await h.cap("<small>Stap 2 · Indelen</small>Bij <b>Indelen</b> zie je per dienst hoeveel mensen zich hebben aangemeld.");
    await h.wijs(kaart("zaterdag", "14.00 – 18.00"));
    await h.lees();
    await h.tik(kaart("zaterdag", "14.00 – 18.00"));
    await h.cap("Kies een dienst en deel in. Je ziet meteen hoeveel diensten iemand <b>al heeft</b>.");
    await h.tik(indelen("Sanne Jansen"));
    await h.tik(indelen("Pieter Bakker"));
    await h.lees();
    await h.cap("Te weinig aanmeldingen? Deel dan <b>iemand anders</b> in, ook wie zich niet heeft aangemeld.");
    await h.tik(kaart("vrijdag", "18.00"));
    await h.tik(indelen("Tom Smits"));
    await h.tik(h.knop("Iemand anders indelen"));
    await h.typ(zij.locator('input[placeholder="Naam"]'), "Joo", 140);
    await h.tik(indelen("Joost Vos"));
    await zij.getByRole("button", { name: "Sluiten", exact: true }).last().evaluate((n) => n.click());
    await h.lees();
    await h.demo(() => {
      const d = window.__demo;
      const zet = (s, namen) => namen.forEach((n) => d.rij("indeling_concept", { shift_id: s.id, profile_id: d.pNaam(n).id }));
      zet(d.dienst(1, "10.00"), ["Lotte Visser", "Daan Meijer"]);
      zet(d.dienst(1, "18.00"), ["Femke Bos", "Joost Vos"]);
      zet(d.dienst(2, "10.00"), ["Lotte Visser", "Pieter Bakker"]);
      zet(d.dienst(2, "14.00"), ["Tom Smits", "Femke Bos"]);
      d.ververs();
    });
    await h.cap("Zo vul je dienst voor dienst. Alles is nog <b>concept</b>: vrijwilligers zien hier niets van.");
    await h.wijs(app.locator(".cijfers"));
    await h.lees();

    /* 3. publiceren */
    await h.cap("<small>Stap 3 · Publiceren</small>Klaar? Tik op <b>Bekijk en publiceer</b> en controleer de lijst.");
    await h.tik(h.knop("Bekijk en publiceer"));
    await h.lees();
    await h.cap("Na publiceren is het rooster zichtbaar en krijgt iedereen op de lijst een <b>melding</b>.");
    await h.tik(h.knop("Publiceer en stuur meldingen"));
    await h.lees();

    /* 4. oproep */
    await h.cap("<small>Dienst niet vol?</small>Stuur een <b>oproep</b>. De dienst komt bij iedereen bovenaan te staan.");
    await h.tik(app.locator("button.indeel", { hasText: "BBQ" }));
    await h.tik(h.knop("Stuur een oproep"));
    await h.typ(zij.locator("textarea"), "Wie helpt bij de BBQ op finaledag?", 40);
    await h.tik(h.knop("Verstuur oproep"));
    await h.lees();

    /* 5. vervanger */
    await h.tussen("<small>Een paar dagen later</small>Tom kan niet, Eva wil zijn dienst overnemen", 2400, () => h.demo(() => {
      const d = window.__demo;
      const t = d.db.toewijzingen.find((x) => x.shift_id === d.dienst(0, "18.00").id && x.profile_id === d.pNaam("Tom Smits").id);
      d.zoekVervanger(t.id); d.biedAan(t.id, d.pNaam("Eva Mulder").id);
      window.scrollTo(0, 0); d.ververs();
    }));
    await h.cap("<small>Vervanger goedkeuren</small>Je krijgt een melding en ziet het bij de dienst: <b>Vervanger gezocht</b>.");
    await h.tik(kaart("vrijdag", "18.00"));
    await h.lees();
    await h.cap("Met <b>Goedkeuren</b> wissel je de dienst om. Beiden krijgen direct bericht.");
    await h.tik(zij.getByRole("button", { name: "Goedkeuren" }));
    await h.lees();

    /* 6. mensen en logboek */
    await h.cap("<small>Mensen</small>Iedereen die inlogt komt in deze lijst. Maak iemand <b>beheerder</b> of blokkeer een account.");
    await h.tik(tab("Mensen"));
    await h.tik(app.locator("button.mens", { hasText: "Pieter Bakker" }));
    await h.wijs(h.knop("Maak beheerder"));
    await h.lees();
    await h.tik(h.knop("Maak beheerder"));
    await h.cap("<small>Logboek</small>Hier lees je terug wie wat heeft gedaan: publicaties, oproepen en vervangingen.");
    await h.tik(tab("Logboek"));
    await h.lees();
    await h.curWeg();

    await h.titel("Samengevat", "Opzetten. Indelen. Publiceren.", "Daarna alleen nog: oproepen sturen en vervangers goedkeuren");
    await slaap(6000);
  },
});
