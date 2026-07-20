#!/usr/bin/env node
/**
 * publiser-blogg.mjs — datostyrt drypp-publisering for Roverk-bloggene (statisk).
 *
 * Leser alle artikkelfiler i ved/blogg og skjul/blogg, og regenererer:
 *   - listekortene på hver blogg-forside (kun artikler med dato <= i dag)
 *   - sitemap.xml (kun publiserte artikler)
 *   - robots-meta i hver artikkel (noindex til publiseringsdato, ellers index)
 *
 * Kjøres daglig av en planlagt jobb -> commit -> push -> Vercel deployer statisk.
 * Idempotent: kan kjøres når som helst uten bivirkninger.
 *
 * Test: BLOGG_TODAY=2026-07-16 node scripts/publiser-blogg.mjs   (overstyr "i dag")
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTS = ['ved', 'skjul'];
const MONTHS = ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'];

// "I dag" i Europe/Oslo (YYYY-MM-DD), evt. overstyrt for test
function today() {
  if (process.env.BLOGG_TODAY) return process.env.BLOGG_TODAY;
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
  return p; // en-CA gir YYYY-MM-DD
}
const TODAY = today();

function pick(re, s, d = '') { const m = s.match(re); return m ? m[1] : d; }
function humanDate(iso) { const [y,m,dd] = iso.split('-'); return `${parseInt(dd,10)}. ${MONTHS[parseInt(m,10)-1]} ${y}`; }
function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// Les alle artikler for et produkt
function readArticles(product) {
  const dir = join(ROOT, product, 'blogg');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.html') && f !== 'index.html' && !f.startsWith('_'))
    .map(f => {
      const path = join(dir, f);
      const html = readFileSync(path, 'utf8');
      const slug = f.replace(/\.html$/, '');
      const date = pick(/<meta property="article:published_time" content="([^"]+)"/, html)
                || pick(/<time[^>]*datetime="([^"]+)"/, html);
      const title = pick(/<meta property="og:title" content="([^"]+)"/, html, slug);
      let excerpt = pick(/<meta name="description" content="([^"]+)"/, html, '');
      if (excerpt.length > 150) excerpt = excerpt.slice(0, 147).replace(/\s+\S*$/, '') + '…';
      return { product, slug, path, html, date, title, excerpt };
    })
    .filter(a => a.date)
    .sort((a, b) => b.date.localeCompare(a.date)); // nyeste først
}

// Bygg ett listekort
function card(a) {
  return `      <a class="post-card hover-dim" href="/${a.product}/blogg/${a.slug}">
        <span class="post-accent"></span>
        <div class="post-body">
          <time class="post-date" datetime="${a.date}">${humanDate(a.date)}</time>
          <h2 class="post-title">${esc(a.title)}</h2>
          <p class="post-excerpt">${esc(a.excerpt)}</p>
          <span class="post-more">Les mer <span class="arw">→</span></span>
        </div>
      </a>`;
}

const emptyState = (product) => {
  const txt = product === 'ved'
    ? 'Vi publiserer snart guider om vedlagring, tørking og valg av vedskjul. Kom tilbake snart.'
    : 'Vi publiserer snart guider om søppelskjul, plassering og valg av skur. Kom tilbake snart.';
  return `      <div class="empty-state" style="grid-column:1/-1">
        <h2>Første artikler er på vei</h2>
        <p>${txt}</p>
      </div>`;
};

let published = [];
let hidden = [];

for (const product of PRODUCTS) {
  const all = readArticles(product);
  const live = all.filter(a => a.date <= TODAY);
  const future = all.filter(a => a.date > TODAY);
  published.push(...live);
  hidden.push(...future);

  // 1) Oppdater listekort på forsiden
  const indexPath = join(ROOT, product, 'blogg', 'index.html');
  let idx = readFileSync(indexPath, 'utf8');
  const cards = live.length ? live.map(card).join('\n') : emptyState(product);
  idx = idx.replace(
    /(<!-- POST_CARDS_START -->)[\s\S]*?(<!-- POST_CARDS_END -->)/,
    `$1\n${cards}\n      $2`
  );
  writeFileSync(indexPath, idx);

  // 2) Robots-meta + "Les også"-relaterte lenker (kun til publiserte artikler)
  for (const a of all) {
    let h = a.html;
    const isLive = a.date <= TODAY;
    h = h.replace(/(<meta name="robots" content=")[^"]*(">)/, `$1${isLive ? 'index,follow' : 'noindex,follow'}$2`);
    // fjern ev. eksisterende related-blokk (idempotent)
    h = h.replace(/\n\s*<!-- RELATED_START -->[\s\S]*?<!-- RELATED_END -->/, '');
    if (isLive) {
      const rel = live.filter(x => x.slug !== a.slug).slice(0, 3);
      if (rel.length) {
        const items = rel.map(r => `        <li><a href="/${product}/blogg/${r.slug}" style="color:var(--wood);font-weight:600;text-decoration:none">${esc(r.title)} →</a></li>`).join('\n');
        const block = `\n  <!-- RELATED_START -->\n  <section aria-label="Les også" style="max-width:720px;margin:8px auto 0;padding:0 24px">\n    <h2 style="font-family:'Archivo',system-ui,sans-serif;font-size:20px;font-weight:800;letter-spacing:-.01em;margin:0 0 14px">Les også</h2>\n    <ul style="list-style:none;padding:0;margin:0;display:grid;gap:10px">\n${items}\n    </ul>\n  </section>\n  <!-- RELATED_END -->`;
        h = h.replace(/(\n\s*<!-- ===== CTA)/, `${block}$1`);
      }
    }
    if (h !== a.html) writeFileSync(a.path, h);
  }
}

// 3) Regenerer sitemap.xml
const base = [
  ['https://www.roverk.no/', '1.0', 'weekly'],
  ['https://www.roverk.no/orden', '0.9', 'weekly'],
  ['https://www.roverk.no/skjul', '0.9', 'weekly'],
  ['https://www.roverk.no/ved', '0.9', 'weekly'],
  ['https://www.roverk.no/orden/blogg', '0.7', 'weekly'],
  ['https://www.roverk.no/ved/blogg', '0.7', 'weekly'],
  ['https://www.roverk.no/skjul/blogg', '0.7', 'weekly'],
  ['https://www.roverk.no/personvern', '0.2', 'yearly'],
];
const urls = base.map(([loc, pr, cf]) =>
  `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>${cf}</changefreq>\n    <priority>${pr}</priority>\n  </url>`);
for (const a of published.sort((x,y)=>y.date.localeCompare(x.date))) {
  urls.push(`  <url>\n    <loc>https://www.roverk.no/${a.product}/blogg/${a.slug}</loc>\n    <lastmod>${a.date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`);
}
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
writeFileSync(join(ROOT, 'sitemap.xml'), sitemap);

console.log(`[publiser-blogg] i dag=${TODAY}  publisert=${published.length}  skjult(fremtid)=${hidden.length}`);
for (const a of published) console.log(`  LIVE  ${a.date}  ${a.product}/${a.slug}`);
for (const a of hidden) console.log(`  vent  ${a.date}  ${a.product}/${a.slug}`);
