/* Roverk – delt event-hjelper for Vercel Web Analytics.
   Roverk.track(navn, data) sender et custom event via window.va.
   Trygg no-op hvis analytics ikke er lastet (utvikling, ad-blocker, før last). */
(function () {
  "use strict";
  var root = (typeof window !== 'undefined') ? window : globalThis;
  function track(name, data) {
    try {
      if (root.va && typeof root.va === 'function') {
        root.va('event', { name: name, data: data || {} });
      }
    } catch (e) { /* aldri blokker brukerflyt */ }
  }
  root.Roverk = root.Roverk || {};
  root.Roverk.track = track;
})();
