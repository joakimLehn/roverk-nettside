import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEmail, customerEmail, slackMessage } from '../api/_lib/templates.js';

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
  address_meta: { postnummer: '7560', poststed: 'VIKHAMMER', kommunenummer: '5031', kommunenavn: 'MALVIK', lat: 63.43, lon: 10.6, verified: true }
};

test('ownerEmail viser postnr og poststed når tilgjengelig', () => {
  const m = ownerEmail(orderMeta);
  assert.match(m.html, /7560/);
  assert.match(m.html, /VIKHAMMER/);
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
  assert.match(okMsg.text, /VIKHAMMER/);
  assert.doesNotMatch(okMsg.text, /uverifisert/i);
  const unv = slackMessage({ ...order, address_meta: { verified: false } }, { email_owner: 'ok', email_customer: 'ok' });
  assert.match(unv.text, /uverifisert/i);
});
