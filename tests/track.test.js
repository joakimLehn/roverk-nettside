import { test } from 'node:test';
import assert from 'node:assert/strict';

// track.js is a browser IIFE that attaches to window; set up a fake window,
// then import it for its side effects.
globalThis.window = {};
await import('../lib/track.js');

test('exposes Roverk.track', () => {
  assert.equal(typeof globalThis.window.Roverk.track, 'function');
});

test('forwards to window.va as an event', () => {
  const calls = [];
  globalThis.window.va = (...args) => calls.push(args);
  globalThis.window.Roverk.track('bestilling_sendt', { produkt: 'Orden', verdi: 4990 });
  assert.deepEqual(calls, [
    ['event', { name: 'bestilling_sendt', data: { produkt: 'Orden', verdi: 4990 } }],
  ]);
});

test('defaults data to empty object', () => {
  const calls = [];
  globalThis.window.va = (...args) => calls.push(args);
  globalThis.window.Roverk.track('bestilling_start');
  assert.deepEqual(calls, [['event', { name: 'bestilling_start', data: {} }]]);
});

test('is a safe no-op when window.va is missing', () => {
  globalThis.window.va = undefined;
  assert.doesNotThrow(() => globalThis.window.Roverk.track('x', { a: 1 }));
});
