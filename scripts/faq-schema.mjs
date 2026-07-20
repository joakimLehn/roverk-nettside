#!/usr/bin/env node
/**
 * faq-schema.mjs — bygger FAQPage JSON-LD fra `var FAQ=[...]` på produktsidene
 * og injiserer det i <head>. Idempotent (erstatter eksisterende data-faqschema-blokk).
 * Kjør ved behov: node scripts/faq-schema.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['ved', 'skjul', 'orden'];

for (const p of PAGES) {
  const file = join(ROOT, p, 'index.html');
  let html = readFileSync(file, 'utf8');
  const m = html.match(/var FAQ\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) { console.log(`[faq] ${p}: fant ingen FAQ-array – hopper over`); continue; }
  let faq;
  try { faq = new Function('return ' + m[1])(); }
  catch (e) { console.log(`[faq] ${p}: kunne ikke parse FAQ – ${e.message}`); continue; }

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `https://www.roverk.no/${p}#faq`,
    mainEntity: faq.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
  const block = `<script type="application/ld+json" data-faqschema>\n${JSON.stringify(ld, null, 2)}\n</script>`;

  // fjern ev. eksisterende blokk, injiser fersk rett før </head>
  html = html.replace(/\s*<script type="application\/ld\+json" data-faqschema>[\s\S]*?<\/script>/g, '');
  html = html.replace(/<\/head>/, `${block}\n</head>`);
  writeFileSync(file, html);
  console.log(`[faq] ${p}: FAQPage-schema med ${faq.length} spørsmål injisert`);
}
