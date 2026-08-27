/* Roverk – Google-tag (AW-18411259315) med Consent Mode v2
 *
 * MERK forskjellen fra lib/meta.js, som er bevisst:
 *
 *   Meta-pixelen laster INGENTING før samtykke.
 *   Google-taggen lastes alltid, men med all lagring AVSLÅTT til samtykke
 *   foreligger. Den skriver da ingen informasjonskapsler og bruker ingen
 *   identifikatorer – bare anonyme signaler.
 *
 * Grunnen: Consent Mode v2 er laget for EØS og lar Google modellere
 * konverteringene fra de som svarer nei. Med et samtykkebanner sier ofte
 * halvparten nei, og uten modellering budgir Google på halve datagrunnlaget.
 * ads_data_redaction fjerner annonse-klikk-ID-er fra signalene så lenge
 * samtykke mangler.
 *
 * Samtykket eies av banneret i meta.js, som sender hendelsen `roverk:consent`.
 */
(function () {
  "use strict";

  var TAG_ID = 'AW-18411259315';

  // Konverteringsetiketter fra Google Ads (Mål -> Konverteringer). Uten disse
  // registreres hendelsene aldri som konverteringer, uansett hvor riktig navnet er.
  var KONVERTERINGER = {
    ring_meg_opp:   'AW-18411259315/kHRtCJOdzOgcELOLlstE',
    oversikt_epost: 'AW-18411259315/pJ3DCJadzOgcELOLlstE'
  };
  var CONSENT_KEY = 'roverk_meta_consent';   // samme nøkkel som banneret bruker
  var PROD_HOSTS = { 'www.roverk.no': 1, 'roverk.no': 1 };

  var root = window;

  root.dataLayer = root.dataLayer || [];
  function gtag() { root.dataLayer.push(arguments); }
  root.gtag = root.gtag || gtag;

  function isProd() { return !!PROD_HOSTS[location.hostname]; }
  function getConsent() {
    try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }

  var samtykket = getConsent() === 'granted';

  /* 1. Standardtilstand FØR taggen lastes. Alt avslått med mindre brukeren
        allerede har sagt ja i en tidligere økt. */
  gtag('consent', 'default', {
    ad_storage: samtykket ? 'granted' : 'denied',
    ad_user_data: samtykket ? 'granted' : 'denied',
    ad_personalization: samtykket ? 'granted' : 'denied',
    analytics_storage: samtykket ? 'granted' : 'denied',
    wait_for_update: 500
  });

  /* Fjern annonse-klikk-ID-er fra signalene så lenge samtykke mangler,
     og la gclid følge URL-en i stedet for informasjonskapsel. */
  gtag('set', 'ads_data_redaction', !samtykket);
  gtag('set', 'url_passthrough', true);

  /* 2. Last taggen. Utenfor prod gjøres ingenting. */
  if (isProd()) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + TAG_ID;
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', TAG_ID);
  } else if (root.console) {
    console.info('[RoverkGoogle] tørrkjøring – laster ikke taggen utenfor prod');
  }

  /* 3. Oppdater når brukeren velger. */
  function grantAll() {
    gtag('consent', 'update', {
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'granted'
    });
    gtag('set', 'ads_data_redaction', false);
  }

  document.addEventListener('roverk:consent', function (ev) {
    if (ev && ev.detail === 'granted') grantAll();
    // 'denied' krever ingenting – standardtilstanden er allerede avslått.
  });

  /* ============================================================
     Konvertering.

     Konverteringshandlingen i Google Ads heter `sign_up` og er
     HENDELSESBASERT (Hendelse: sign_up: www.roverk.no), ikke URL-basert.
     Et besøk på kvitteringssiden teller derfor ikke i seg selv – siden må
     fyre hendelsen. Ingen konverteringsetikett trengs i dette oppsettet:
     destinasjonen AW-18411259315 er koblet til taggen og matcher på
     hendelsesnavnet.

     Fyres UANSETT samtykke: Consent Mode avgjør hva som følger med.
     Uten samtykke blir den modellert, ikke identifiserende.
     ============================================================ */
  function event(navn, params) {
    if (!navn) return false;
    gtag('event', navn, params || {});
    // Hendelsesnavnet alene binder ikke til en konverteringshandling. Google Ads
    // lytter på 'conversion' + send_to med etiketten fra handlingen, så den fyres
    // i tillegg. Vårt eget navn beholdes for rapportering og feilsøking.
    var etikett = KONVERTERINGER[navn];
    if (etikett) gtag('event', 'conversion', { send_to: etikett });
    return true;
  }

  function conversion(opts) {
    opts = opts || {};
    var data = {};
    if (typeof opts.value === 'number' && isFinite(opts.value)) {
      data.value = Math.round(opts.value);
      data.currency = 'NOK';
    }
    if (opts.id) data.transaction_id = String(opts.id);
    return event(opts.name || 'sign_up', data);
  }

  root.RoverkGoogle = {
    conversion: conversion,
    event: event,
    hasConsent: function () { return getConsent() === 'granted'; },
    tagId: TAG_ID
  };
})();
