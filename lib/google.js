/* Roverk – Google-tag (samtykkestyrt)
 *
 * Speiler lib/meta.js: laster INGENTING fra Google før brukeren aktivt har
 * samtykket. Samtykket eies av banneret i meta.js, som sender ut hendelsen
 * `roverk:consent` når brukeren velger. Vi lytter på den – og leser lagret
 * valg ved oppstart for brukere som allerede har svart.
 *
 * Consent Mode v2 settes i tillegg, slik at Google vet at lagring er avslått
 * i tilfelle taggen lastes av en annen grunn senere.
 *
 * Konverteringer fyres IKKE herfra. Kvitteringssiden /skjul/takk kaller
 * RoverkGoogle.conversion() – én ekte URL som alle plattformer kan telle.
 */
(function () {
  "use strict";

  var TAG_ID = 'AW-18411259315';
  var CONSENT_KEY = 'roverk_meta_consent';   // samme nøkkel som banneret bruker
  var PROD_HOSTS = { 'www.roverk.no': 1, 'roverk.no': 1 };

  var root = window;
  var lastet = false;

  root.dataLayer = root.dataLayer || [];
  function gtag() { root.dataLayer.push(arguments); }
  root.gtag = root.gtag || gtag;

  /* Consent Mode v2 – alt avslått som utgangspunkt. Må stå før taggen lastes. */
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500
  });

  function isProd() { return !!PROD_HOSTS[location.hostname]; }
  function getConsent() {
    try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }

  function loadTag() {
    if (lastet) return;
    lastet = true;
    if (!isProd()) {
      if (root.console) console.info('[RoverkGoogle] tørrkjøring – laster ikke taggen utenfor prod');
      return;
    }
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + TAG_ID;
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', TAG_ID);
  }

  function activate() {
    gtag('consent', 'update', {
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'granted'
    });
    loadTag();
  }

  /* Banneret i meta.js sender denne når brukeren velger. */
  document.addEventListener('roverk:consent', function (ev) {
    if (ev && ev.detail === 'granted') activate();
  });

  // Brukere som allerede har svart ja tidligere.
  if (getConsent() === 'granted') activate();

  /* ============================================================
     Konvertering – kalles fra kvitteringssiden.
     label: konverteringsetiketten fra Google Ads (Mål → Konverteringer).
     ============================================================ */
  function conversion(opts) {
    opts = opts || {};
    if (getConsent() !== 'granted') return false;
    if (!opts.label) {
      if (root.console) console.warn('[RoverkGoogle] mangler konverteringsetikett – hopper over');
      return false;
    }
    var data = { send_to: TAG_ID + '/' + opts.label };
    if (typeof opts.value === 'number' && isFinite(opts.value)) {
      data.value = Math.round(opts.value);
      data.currency = 'NOK';
    }
    if (opts.id) data.transaction_id = String(opts.id);
    gtag('event', 'conversion', data);
    return true;
  }

  root.RoverkGoogle = {
    conversion: conversion,
    hasConsent: function () { return getConsent() === 'granted'; },
    tagId: TAG_ID
  };
})();
