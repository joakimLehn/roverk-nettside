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
  const r = validateOrder({ site: 'ved', name: 'Kari', phone: '123', email: 'k@x.no', address: 'Storgata 1' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.config, {});
  assert.deepEqual(r.data.utm, {});
  assert.equal(r.data.price_nok, null);
  assert.deepEqual(r.data.address_meta, { postnummer: null, poststed: null, kommunenummer: null, kommunenavn: null, lat: null, lon: null, verified: false });
});

test('tom adresse avvises', () => {
  const base = { site: 'skjul', name: 'Ola', phone: '1', email: 'o@x.no' };
  assert.equal(validateOrder({ ...base }).ok, false);
  assert.equal(validateOrder({ ...base, address: '   ' }).ok, false);
  assert.equal(validateOrder({ ...base, address: 'Storgata 1' }).ok, true);
});

test('address_meta normaliseres og whitelistes', () => {
  const r = validateOrder({
    site: 'skjul', name: 'Ola', phone: '1', email: 'o@x.no', address: 'Auntrøa 5',
    address_meta: { postnummer: '7560', poststed: 'VIKHAMMER', kommunenummer: '5031', kommunenavn: 'MALVIK', lat: 63.43, lon: 10.6, verified: true, evilExtra: 'x' }
  });
  assert.equal(r.ok, true);
  assert.equal(r.data.address_meta.postnummer, '7560');
  assert.equal(r.data.address_meta.poststed, 'VIKHAMMER');
  assert.equal(r.data.address_meta.verified, true);
  assert.equal(r.data.address_meta.lat, 63.43);
  assert.equal(r.data.address_meta.evilExtra, undefined);
});

test('address_meta.verified tvinges til boolean', () => {
  const r = validateOrder({
    site: 'skjul', name: 'Ola', phone: '1', email: 'o@x.no', address: 'Auntrøa 5',
    address_meta: { verified: 'ja' }
  });
  assert.equal(r.data.address_meta.verified, false);
});
