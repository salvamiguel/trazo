// Writes site/index.html listing every rendered view (light/dark SVG + .drawio).
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SITE = 'site';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const sections = readdirSync(SITE, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => {
    const files = readdirSync(join(SITE, d.name));
    const views = files.filter((f) => f.endsWith('.light.svg')).map((f) => f.replace('.light.svg', '')).sort();
    const cards = views
      .map(
        (v) => `<figure>
  <picture>
    <source srcset="${d.name}/${v}.dark.svg" media="(prefers-color-scheme: dark)">
    <img src="${d.name}/${v}.light.svg" alt="${esc(v)}" loading="lazy">
  </picture>
  <figcaption>${esc(v)} · <a href="${d.name}/${v}.light.svg">SVG claro</a> · <a href="${d.name}/${v}.dark.svg">SVG oscuro</a> · <a href="${d.name}/${v}.drawio" download>.drawio</a></figcaption>
</figure>`,
      )
      .join('\n');
    return `<section><h2>${esc(d.name)}</h2>\n${cards}\n</section>`;
  })
  .join('\n');

writeFileSync(
  join(SITE, 'index.html'),
  `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trazo</title>
<style>
  :root { color-scheme: light dark; --bg: #ffffff; --fg: #1b1f24; --muted: #5b6472; --border: #e3e6ea; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0f1318; --fg: #e8ebef; --muted: #9aa4b2; --border: #2b323c; } }
  body { margin: 0; padding: 32px 16px; background: var(--bg); color: var(--fg); font: 15px/1.5 Inter, 'Segoe UI', Helvetica, Arial, sans-serif; }
  main { max-width: 1200px; margin: 0 auto; }
  h1 { margin: 0 0 4px; } p { color: var(--muted); margin: 0 0 32px; }
  figure { margin: 0 0 32px; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  img { display: block; width: 100%; height: auto; }
  figcaption { padding: 10px 14px; border-top: 1px solid var(--border); color: var(--muted); font-size: 13px; }
  a { color: inherit; }
</style>
</head>
<body>
<main>
<h1>Trazo</h1>
<p>Diagramas de arquitectura generados desde modelos CALM.</p>
${sections}
</main>
</body>
</html>
`,
);
console.log(`→ ${join(SITE, 'index.html')}`);
