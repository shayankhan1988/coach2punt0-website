# Coach 2punt0 website

Statische website van https://coach2punt0.nl, gehost op Netlify. Teksten en foto's
worden aangepast via [Pages CMS](https://app.pagescms.org) (zie `HANDLEIDING.md`).

## Hoe het werkt

- `site/` is de website zelf (HTML, CSS, afbeeldingen). Ontwerp en opmaak pas je hier aan.
- `content/*.json` bevat de bewerkbare teksten en foto's. Pages CMS past alleen deze
  bestanden aan (plus nieuwe foto's in `site/assets/img/`). Welke velden er in het CMS
  staan, staat in `.pages.yml`.
- `content/thema.json` kiest een geteste kleurenset (`THEMAS` in `scripts/build.mjs`); de build schrijft dan `assets/theme.css`.
- `scripts/build.mjs` kopieert `site/` naar `dist/` en vult de teksten uit `content/` in.
  Netlify draait dit bij elke push (`netlify.toml`) en publiceert `dist/`.

In de HTML staan markeringen als `<!--cms:t:home.hero.titel-->…<!--/cms:home.hero.titel-->`.
Zonder wijzigingen in `content/` is `dist/` exact gelijk aan `site/` (zonder markeringen).
Nieuwe foto's worden bij de build bijgesneden en verkleind naar WebP (`dist/assets/img/cms/`).
Telefoon en e-mail uit `content/algemeen.json` worden op alle pagina's vervangen,
ook in JSON-LD en llms.txt.

Pas je zelf een tekst aan die een markering heeft? Doe dat dan in `content/`, niet in de
HTML, anders wordt hij bij de build overschreven.

## Lokaal bekijken

```sh
npm install
npm start          # bouwt en serveert op http://localhost:8642
```

Een nieuw veld bewerkbaar maken: zet een markering in de HTML, voeg de waarde toe aan
het juiste `content/*.json`-bestand en het veld aan `.pages.yml`. Draai `npm run build`
en controleer dat de pagina er hetzelfde uitziet.
