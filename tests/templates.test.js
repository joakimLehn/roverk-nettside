import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEmail, customerEmail, slackMessage, leadSlackMessage, leadEmail } from '../api/_lib/templates.js';

const order = {
  site: 'skjul', product: '3-dunk Standard', preferred_date: '2026-08-15',
  name: 'Ola Nordmann', phone: '99887766', email: 'ola@example.com',
  address: 'Storgata 1', price_nok: 12900, config: { count: 3 }, utm: {}
};

test('ownerEmail har emne og inneholder kundedata', () => {
  const m = ownerEmail(order);
  assert.match(m.subject, /skjul/i);
  assert.match(m.html, /Ola Nordmann/);
  assert.match(m.html, /99887766/);
  assert.match(m.html, /ola@example.com/);
});

test('ownerEmail escaper HTML i kundeinput', () => {
  const m = ownerEmail({ ...order, name: '<script>x</script>' });
  assert.doesNotMatch(m.html, /<script>x<\/script>/);
  assert.match(m.html, /&lt;script&gt;/);
});

test('customerEmail takker og nevner produkt', () => {
  const m = customerEmail(order);
  assert.match(m.subject, /Roverk/i);
  assert.match(m.html, /3-dunk Standard/);
  assert.match(m.html, /Ola/);
});

test('slackMessage ok-status uten advarsler', () => {
  const s = slackMessage(order, { email_owner: 'ok', email_customer: 'ok' });
  assert.match(s.text, /Ny ordre/);
  assert.match(s.text, /skjul/);
  assert.doesNotMatch(s.text, /⚠️/);
});

test('slackMessage viser advarsel når e-post feilet', () => {
  const s = slackMessage(order, { email_owner: 'ok', email_customer: 'feil: timeout' });
  assert.match(s.text, /⚠️/);
  assert.match(s.text, /kunde/i);
});

const orderMeta = {
  ...order,
  address: 'Auntrøa 5, 7560 Vikhammer',
  address_meta: { postnummer: '7560', poststed: 'Vikhammer', kommunenummer: '5031', kommunenavn: 'MALVIK', lat: 63.43, lon: 10.6, verified: true }
};

test('ownerEmail viser postnr og poststed når tilgjengelig', () => {
  const m = ownerEmail(orderMeta);
  assert.match(m.html, /7560/);
  assert.match(m.html, /Vikhammer/);
});

test('ownerEmail viser advarsel ved uverifisert adresse', () => {
  const m = ownerEmail({ ...order, address_meta: { verified: false } });
  assert.match(m.html, /uverifisert/i);
});

test('ownerEmail uten advarsel når verifisert', () => {
  const m = ownerEmail(orderMeta);
  assert.doesNotMatch(m.html, /uverifisert/i);
});

test('slackMessage viser postnr/poststed og uverifisert-markør', () => {
  const okMsg = slackMessage(orderMeta, { email_owner: 'ok', email_customer: 'ok' });
  assert.match(okMsg.text, /7560/);
  assert.match(okMsg.text, /Vikhammer/);
  assert.doesNotMatch(okMsg.text, /uverifisert/i);
  const unv = slackMessage({ ...order, address_meta: { verified: false } }, { email_owner: 'ok', email_customer: 'ok' });
  assert.match(unv.text, /uverifisert/i);
});

test('slack: callback setter navn og nummer først', () => {
  const m = leadSlackMessage({ site: 'skjul', kind: 'callback', name: 'Kristin Berg', phone: '90186693', callback_time: 'kveld', product: '3-dunk Standard', email: null });
  assert.match(m.text, /Ring meg opp/);
  assert.match(m.text, /\*Kristin Berg\* · \*90186693\*/);
  assert.match(m.text, /etter kl\. 16/);
  assert.doesNotMatch(m.text, /E-post/);
});

test('slack: callback uten tidspunkt faller tilbake til «når som helst»', () => {
  const m = leadSlackMessage({ site: 'skjul', kind: 'callback', name: 'Ola', phone: '99887766', callback_time: null, product: null, email: 'ola@example.com' });
  assert.match(m.text, /når som helst/);
  assert.match(m.text, /ola@example\.com/);
});

test('slack: config_share-lead er uendret', () => {
  const m = leadSlackMessage({ site: 'orden', kind: 'config_share', email: 'k@x.no', product: 'Orden 60L', price_nok: 8390, config: {}, consent: true });
  assert.match(m.text, /Ny lead \(delt konfig\)/);
  assert.match(m.text, /k@x\.no/);
});

// ---------- prisoversikt på e-post (/skjul) ----------
const oversikt = { site: 'skjul', kind: 'config_share', email: 'k@x.no', product: 'Roverk Skjul', price_nok: null, share_url: null, consent: true, config: { intro_aktiv: true, intro_til: '13. september', storrelser: [ { dunker: 2, mal: '1350×850×1930 mm', mal_xl: '1750×1000×2040 mm', levert: 7190, montert: 8920 }, { dunker: 4, mal: '2650×850×1930 mm', mal_xl: '3350×1000×2040 mm', levert: 11910, montert: 14720 } ] } };

test('leadEmail: skjul-oversikt erstatter konfig-lenkemalen', () => {
  const m = leadEmail(oversikt);
  assert.match(m.subject, /Mål og priser/);
  assert.match(m.html, /2 dunker/);
  assert.match(m.html, /1350×850×1930 mm/);
  assert.match(m.html, /13\. september/);
  assert.doesNotMatch(m.html, /racket du satte sammen/);
});

test('leadEmail: uten storrelser brukes fortsatt konfig-lenkemalen', () => {
  const m = leadEmail({ site: 'orden', email: 'k@x.no', product: 'Orden 60L', price_nok: 8390, share_url: 'https://www.roverk.no/orden?k=1', config: {} });
  assert.match(m.html, /racket du satte sammen/);
});

test('leadEmail: tullete pris i oversikten blir en strek, ikke NaN', () => {
  const m = leadEmail({ ...oversikt, config: { ...oversikt.config, storrelser: [{ dunker: 2, mal: 'x', mal_xl: 'y', levert: 'gratis', montert: -5 }] } });
  assert.doesNotMatch(m.html, /NaN/);
  assert.match(m.html, /—/);
});

test('leadEmail: oversikten escaper felt fra klienten', () => {
  const m = leadEmail({ ...oversikt, config: { ...oversikt.config, storrelser: [{ dunker: '<script>x</script>', mal: 'a', mal_xl: 'b', levert: 1, montert: 2 }] } });
  assert.doesNotMatch(m.html, /<script>x<\/script>/);
});

test('leadEmail: utløpt intropris viser ingen frist', () => {
  const m = leadEmail({ ...oversikt, config: { ...oversikt.config, intro_aktiv: false } });
  assert.doesNotMatch(m.html, /13\. september/);
});
