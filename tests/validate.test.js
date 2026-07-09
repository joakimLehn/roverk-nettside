import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOrder } from '../api/_lib/validate.js';

const valid = {
  site: 'skjul', product: '3-dunk Standard', config: { count: 3 },
  preferred_date: '2026-08-15', name: 'Ola', phone: '99887766',
  email: 'ola@example.com', address: 'Storgata 1', price_nok: 12900,
  utm: { utm_source: 'meta' }, hp: ''
};

test('godtar gyldig payload og normaliserer', () => {
  const r = validateOrder(valid);
  assert.equal(r.ok, true);
  assert.equal(r.data.site, 'skjul');
  assert.equal(r.data.email, 'ola@example.com');
  assert.deepEqual(r.data.config, { count: 3 });
});

test('avviser ukjent site', () => {
  const r = validateOrder({ ...valid, site: 'hacker' });
  assert.equal(r.ok, false);
});

test('krever navn, telefon og e-post', () => {
  assert.equal(validateOrder({ ...valid, name: '  ' }).ok, false);
  assert.equal(validateOrder({ ...valid, phone: '' }).ok, false);
  assert.equal(validateOrder({ ...valid, email: '' }).ok, false);
});

test('avviser ugyldig e-postformat', () => {
  assert.equal(validateOrder({ ...valid, email: 'ikke-epost' }).ok, false);
});

test('honeypot utfylt => spam=true', () => {
  const r = validateOrder({ ...valid, hp: 'bot' });
  assert.equal(r.ok, false);
  assert.equal(r.spam, true);
});

test('tomt/ugyldig preferred_date blir null', () => {
  assert.equal(validateOrder({ ...valid, preferred_date: '' }).data.preferred_date, null);
  assert.equal(validateOrder({ ...valid, preferred_date: 'tull' }).data.preferred_date, null);
});

test('manglende valgfrie felt får trygge standardverdier', () => {
  const r = validateOrder({ site: 'ved', name: 'Kari', phone: '123', email: 'k@x.no' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.config, {});
  assert.deepEqual(r.data.utm, {});
  assert.equal(r.data.address, '');
  assert.equal(r.data.price_nok, null);
});
