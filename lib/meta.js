/* Roverk – Meta Pixel (samtykkestyrt)
 *
 * Laster INGENTING fra Meta før brukeren aktivt har samtykket.
 * - Ingen samtykke valgt  -> vis banner, ikke fyr noe
 * - «Godta»               -> last pixel, fyr PageView + ViewContent (hvis produktside)
 * - «Avslå»               -> ingenting lastes, ingen cookies fra Meta
 *
 * Hendelsesmodell: Roverk tar ikke betalt på nett (kunden betaler etter montering),
 * så hovedkonverteringen er `Lead` – innsendt bestilling/forespørsel. Purchase fyres
 * IKKE fra nettleseren; den hører hjemme server-side når oppdraget er fullført.
 *
 * Lead speiles server-side (Conversions API) med samme event_id for deduplisering.
 */
(function () {
  'use strict';

  var PIXEL_ID = '2847699825597498';
  var CONSENT_KEY = 'roverk_meta_consent'; // 'granted' | 'denied'
  var FBCLID_KEY = 'roverk_fbclid';
  var COOKIE_DOMAIN = '.roverk.no';
  var PROD_HOSTS = { 'roverk.no': 1, 'www.roverk.no': 1 };
  var FBC_MAX_AGE = 7776000; // 90 dager – Metas vindu for _fbc

  var inited = false;
  var pageViewSent = false;
  var viewContentSent = false;
  var matched = {}; // hashede match-keys som allerede er sendt til fbq('init')

  function product() { return window.__ROVERK_META_PRODUCT || null; }
  function productId() { var p = product(); return p ? p.id : null; }

  function getConsent() { try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; } }
  function setConsent(v) { try { localStorage.setItem(CONSENT_KEY, v); } catch (e) {} }

  function cookie(name) {
    var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? decodeURIComponent(m.pop()) : null;
  }

  function uuid() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return 'ev-' + Date.now() + '-' + Math.floor(Math.random() * 1e9);
  }

  function num(v) { return (typeof v === 'number' && isFinite(v) && v > 0) ? Math.round(v) : null; }

  /* ============================================================
     Miljøguard
     Pixelen skal aldri fyre fra localhost eller Vercel-preview –
     slike hendelser forurenser datasettet (skjedde 2026-07-24).

     ?metatest=1 utenfor produksjon gir TØRRKJØRING: hele flyten kjører
     og hendelsene kan inspiseres i window.__ROVERK_META_DRYRUN, men
     fbevents.js lastes aldri og ingenting sendes til Meta. Det gjør det
     umulig å forurense datasettet ved testing – en URL-parameter som
     skrudde på ekte sporing var i praksis en felle.
     ============================================================ */
  function isProd() { return !!PROD_HOSTS[location.hostname]; }

  var DRY_RUN = (function () {
    if (isProd()) return false;
    try { return new URLSearchParams(location.search).get('metatest') === '1'; } catch (e) { return false; }
  })();

  if (DRY_RUN) window.__ROVERK_META_DRYRUN = [];

  function allowedEnv() { return isProd() || DRY_RUN; }

  // Eneste vei ut til pixelen. I tørrkjøring logges kallet i stedet.
  function sendToPixel(args) {
    if (DRY_RUN) {
      window.__ROVERK_META_DRYRUN.push(Array.prototype.slice.call(args));
      if (window.console && console.debug) console.debug('[RoverkMeta dry-run]', Array.prototype.slice.call(args));
      return;
    }
    if (window.fbq) window.fbq.apply(null, args);
  }

  /* ============================================================
     Klikk-ID (fbclid) -> _fbc
     Pixelen setter _fbc selv, men bare hvis den lastes mens fbclid
     står i URL-en. Samtykkebanneret gjør at pixelen ofte først lastes
     på en senere sidevisning, der fbclid er borte – da mistes både
     attribusjon og Event Match Quality. Derfor mellomlagrer vi
     klikk-ID-en i sessionStorage (ingen varig lagring uten samtykke)
     og skriver cookien selv når samtykke er gitt.
     ============================================================ */
  function captureFbclid() {
    try {
      var id = new URLSearchParams(location.search).get('fbclid');
      if (id) sessionStorage.setItem(FBCLID_KEY, JSON.stringify({ id: id, t: Date.now() }));
    } catch (e) {}
  }

  // Reserve: /skjul og /ved lagrer allerede fbclid i localStorage `ns_utm`
  // (eksisterende UTM-fangst). Klikker brukeren annonsen én dag og samtykker
  // en annen, er sessionStorage borte – da er ns_utm eneste kilde til klikk-ID-en.
  // Vi leser bare data som allerede ligger der; ingenting nytt lagres.
  function fbclidFromUtm() {
    try {
      var u = JSON.parse(localStorage.getItem('ns_utm') || 'null');
      return (u && u.fbclid) ? { id: u.fbclid, t: null } : null;
    } catch (e) { return null; }
  }

  function storedFbclid() {
    var o = null;
    try { o = JSON.parse(sessionStorage.getItem(FBCLID_KEY) || 'null'); } catch (e) {}
    if (o && o.id) return o;
    return fbclidFromUtm();
  }

  function ensureFbcCookie() {
    if (cookie('_fbc')) return;
    var o = storedFbclid();
    if (!o || !o.id) return;
    // Uten kjent klikktidspunkt er «nå» det tryggeste: Meta bruker tidsstempelet
    // til å aldre klikket, og et for gammelt stempel forkaster hele _fbc-en.
    var t = o.t || Date.now();
    document.cookie = '_fbc=fb.1.' + t + '.' + o.id +
      '; max-age=' + FBC_MAX_AGE + '; path=/; domain=' + COOKIE_DOMAIN + '; secure; samesite=lax';
  }

  /* ============================================================
     Avansert matching – SHA-256 i nettleseren.
     Aldri PII i klartekst til Meta.
     Normaliseringen MÅ være identisk med api/_lib/meta-capi.js,
     ellers matcher ikke nettleser- og server-hendelsen samme person.
     ============================================================ */
  function sha256Hex(s) {
    if (!s) return Promise.resolve(null);
    if (!(window.crypto && crypto.subtle && window.TextEncoder)) return Promise.resolve(null);
    try {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (buf) {
        var b = new Uint8Array(buf), out = '';
        for (var i = 0; i < b.length; i++) out += (b[i] < 16 ? '0' : '') + b[i].toString(16);
        return out;
      })['catch'](function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  function normEmail(v) { return String(v || '').trim().toLowerCase(); }

  function normPhone(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 8) d = '47' + d;                    // norsk nr uten landkode
    else if (d.indexOf('0047') === 0) d = '47' + d.slice(4);
    return d;
  }

  function normName(v) { return String(v || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function normZip(v) { return String(v || '').replace(/\D/g, ''); }
  function normCity(v) { return String(v || '').trim().toLowerCase(); }

  // Deler «Kari Nordmann» i fornavn/etternavn. Meta vil ha dem separat.
  function splitName(full) {
    var parts = normName(full).split(' ').filter(Boolean);
    if (!parts.length) return { fn: '', ln: '' };
    return { fn: parts[0], ln: parts.length > 1 ? parts[parts.length - 1] : '' };
  }

  // Bygger { em, ph, fn, ln, ct, zp, country } med hashede verdier.
  function buildMatchKeys(user) {
    if (!user) return Promise.resolve(null);
    var name = splitName(user.name);
    var plain = {
      em: normEmail(user.email),
      ph: normPhone(user.phone),
      fn: name.fn,
      ln: name.ln,
      ct: normCity(user.city),
      zp: normZip(user.zip),
      country: user.country ? normCity(user.country) : 'no'
    };
    var keys = Object.keys(plain).filter(function (k) { return !!plain[k]; });
    if (!keys.length) return Promise.resolve(null);
    return Promise.all(keys.map(function (k) { return sha256Hex(plain[k]); })).then(function (hashes) {
      var out = null;
      keys.forEach(function (k, i) {
        if (hashes[i]) { out = out || {}; out[k] = hashes[i]; }
      });
      return out;
    });
  }

  // Sender match-keys til pixelen via fbq('init', …). Meta tillater å kalle
  // init flere ganger for samme pixel for å utvide matchingen.
  function applyMatching(user) {
    if (!DRY_RUN && !window.fbq) return Promise.resolve();
    return buildMatchKeys(user).then(function (keys) {
      if (!keys) return;
      var fresh = false;
      for (var k in keys) { if (keys[k] !== matched[k]) { fresh = true; matched[k] = keys[k]; } }
      if (fresh) sendToPixel(['init', PIXEL_ID, keys]);
    })['catch'](function () {});
  }

  /* ============================================================
     Pixel-bootstrap (kjører først etter samtykke)
     ============================================================ */
  function pixelReady() {
    return !!(window.fbq && (window.fbq.callMethod || window.fbq.loaded));
  }

  function loadPixel() {
    if (inited) return;
    if (!allowedEnv()) return; // siste skanse mot events fra localhost/preview
    inited = true;

    // Tørrkjøring: aldri kontakt Meta. Hendelsene samles i __ROVERK_META_DRYRUN.
    if (DRY_RUN) {
      ensureFbcCookie();
      sendToPixel(['init', PIXEL_ID]);
      if (!pageViewSent) { pageViewSent = true; sendToPixel(['track', 'PageView']); }
      return;
    }

    // Metas offisielle snippet starter med `if (f.fbq) return;`. Ligger det en
    // plassholder-stub på window.fbq (f.eks. `window.fbq = window.fbq || function(){…q.push()}`),
    // returnerer snippeten umiddelbart: fbevents.js lastes aldri, init/PageView
    // kjører aldri, og alle events havner i en død kø. Rydd derfor bort alt som
    // ikke er den ekte pixelen før vi bootstrapper.
    if (window.fbq && !pixelReady()) {
      try { delete window.fbq; } catch (e) { window.fbq = undefined; }
      try { delete window._fbq; } catch (e) { window._fbq = undefined; }
    }

    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

    ensureFbcCookie();
    sendToPixel(['init', PIXEL_ID]);
    if (!pageViewSent) { pageViewSent = true; sendToPixel(['track', 'PageView']); }
  }

  function ready() { return getConsent() === 'granted' && allowedEnv(); }

  // Alle events går gjennom denne: sikrer samtykke + at pixelen faktisk er lastet.
  function track(name, data, eventId) {
    if (!ready()) return;
    loadPixel();
    if (!DRY_RUN && !window.fbq) return;
    var payload = {};
    for (var k in data) { if (data[k] !== null && data[k] !== undefined) payload[k] = data[k]; }
    if (eventId) sendToPixel(['track', name, payload, { eventID: eventId }]);
    else sendToPixel(['track', name, payload]);
  }

  function fireViewContent() {
    var p = product();
    if (!p || viewContentSent) return;
    viewContentSent = true;
    track('ViewContent', {
      content_ids: [p.id],
      content_type: 'product',
      content_name: p.name,
      content_category: p.category || 'Storage',
      value: num(p.value),
      currency: 'NOK'
    });
  }

  function activate() { loadPixel(); fireViewContent(); }

  /* ============================================================
     Contact – klikk på telefon/e-post. Delegert lytter, så den
     dekker alle sider (inkl. blogg) uten per-side-kode.
     ============================================================ */
  function initContactTracking() {
    document.addEventListener('click', function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href^="tel:"],a[href^="mailto:"]') : null;
      if (!a) return;
      var kind = a.getAttribute('href').indexOf('tel:') === 0 ? 'telefon' : 'epost';
      track('Contact', { content_name: kind, content_ids: [productId()], currency: 'NOK' });
    }, true);
  }

  /* ============================================================
     Offentlig API
     ============================================================ */
  window.RoverkMeta = {
    hasConsent: function () { return getConsent() === 'granted'; },

    // Trekk tilbake / endre samtykke: nullstill og vis banneret igjen.
    resetConsent: function () { try { localStorage.removeItem(CONSENT_KEY); } catch (e) {} location.reload(); },

    // Kalles når bestillingsmodalen åpnes.
    initiateCheckout: function (o) {
      o = o || {};
      track('InitiateCheckout', {
        content_ids: [productId()],
        content_type: 'product',
        content_name: o.content_name || (product() ? product().name : null),
        value: num(o.value) || num(product() && product().value),
        currency: 'NOK'
      });
    },

    // Konfigurator på /orden ferdigstilt (størrelse + pris valgt).
    customizeProduct: function (o) {
      o = o || {};
      track('CustomizeProduct', {
        content_ids: [productId()],
        content_type: 'product',
        content_name: o.content_name || (product() ? product().name : null),
        value: num(o.value) || num(product() && product().value),
        currency: 'NOK'
      });
    },

    // Kalles i submitOrder()/submitShareEmail(). Returnerer feltene som legges på
    // payloaden slik at serveren (CAPI) kan speile samme hendelse med samme event_id.
    orderCtx: function () {
      if (ready()) { loadPixel(); ensureFbcCookie(); }
      return {
        event_id: uuid(),
        fbp: cookie('_fbp'),
        fbc: cookie('_fbc'),
        consent: getConsent() === 'granted',
        event_source_url: location.href
      };
    },

    // HOVEDKONVERTERING. Kalles i suksess-callbacken (etter 200 fra backend),
    // ikke på knappeklikk – ellers telles avbrutte skjemaer som konverteringer.
    // eventId MÅ være samme som i orderCtx() for at CAPI-dedup skal virke.
    lead: function (o) {
      o = o || {};
      if (!ready()) return Promise.resolve();
      loadPixel();
      return applyMatching(o.user).then(function () {
        track('Lead', {
          content_ids: [productId()],
          content_type: 'product',
          content_name: o.content_name || (product() ? product().name : null),
          value: num(o.value) || num(product() && product().value),
          currency: 'NOK'
        }, o.eventId);
      });
    },

    // Myk lead: brukeren ba om å få konfigurasjonen sin på e-post. Lavere intensjon
    // enn en bestilling, så den holdes utenfor `Lead` for å ikke forurense
    // optimaliseringssignalet kampanjene styrer på.
    completeRegistration: function (o) {
      o = o || {};
      if (!ready()) return Promise.resolve();
      loadPixel();
      return applyMatching(o.user).then(function () {
        track('CompleteRegistration', {
          content_ids: [productId()],
          content_type: 'product',
          content_name: o.content_name || (product() ? product().name : null),
          value: num(o.value) || num(product() && product().value),
          currency: 'NOK'
        }, o.eventId);
      });
    }
  };

  /* ============================================================
     Samtykkebanner
     ============================================================ */
  function removeBanner() {
    var el = document.getElementById('roverk-consent');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // Kringkast valget så andre samtykkestyrte tagger (lib/google.js) kan reagere
  // uten at denne fila trenger å kjenne dem.
  function broadcast(v) {
    try { document.dispatchEvent(new CustomEvent('roverk:consent', { detail: v })); } catch (e) {}
  }
  function grant() { setConsent('granted'); removeBanner(); activate(); broadcast('granted'); }
  function deny() { setConsent('denied'); removeBanner(); broadcast('denied'); }

  function showBanner() {
    if (document.getElementById('roverk-consent')) return;

    var wrap = document.createElement('div');
    wrap.id = 'roverk-consent';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-live', 'polite');
    wrap.setAttribute('aria-label', 'Samtykke til statistikk-informasjonskapsler');
    wrap.style.cssText = [
      'position:fixed', 'left:16px', 'right:16px', 'bottom:16px', 'z-index:2147483000',
      'max-width:560px', 'margin:0 auto',
      'background:#FBFAF7', 'color:#141310',
      'border:1px solid #E4DFD5', 'border-radius:16px',
      'box-shadow:0 12px 40px rgba(20,19,16,.18)',
      'padding:18px 20px',
      "font-family:'Hanken Grotesk',system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
      'font-size:14px', 'line-height:1.55'
    ].join(';');

    var txt = document.createElement('div');
    txt.style.cssText = 'margin-bottom:14px';
    txt.innerHTML =
      '<div style="font-family:\'Archivo\',system-ui,sans-serif;font-weight:800;font-size:15.5px;margin-bottom:5px">Informasjonskapsler for markedsføring</div>' +
      'Vi bruker Meta-pixel og Google-tag for å måle effekten av annonsene våre og vise relevante annonser. ' +
      'Dette setter informasjonskapsler og deler data med Meta og Google. ' +
      'Nødvendig, anonym statistikk kjører uansett. ' +
      '<a href="/personvern" style="color:#8A6A2E;text-decoration:underline">Les mer</a>.';

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap';

    var accept = document.createElement('button');
    accept.type = 'button';
    accept.textContent = 'Godta';
    accept.style.cssText = 'flex:1;min-width:120px;padding:12px 18px;border:none;border-radius:999px;cursor:pointer;background:#17150F;color:#fff;font-weight:700;font-size:14.5px;font-family:inherit';

    var decline = document.createElement('button');
    decline.type = 'button';
    decline.textContent = 'Kun nødvendig';
    decline.style.cssText = 'flex:1;min-width:120px;padding:12px 18px;border:1.5px solid #E4DFD5;border-radius:999px;cursor:pointer;background:transparent;color:#141310;font-weight:700;font-size:14.5px;font-family:inherit';

    accept.addEventListener('click', grant);
    decline.addEventListener('click', deny);

    row.appendChild(accept);
    row.appendChild(decline);
    wrap.appendChild(txt);
    wrap.appendChild(row);

    (document.body || document.documentElement).appendChild(wrap);
  }

  /* ============================================================
     Oppstart
     ============================================================ */
  if (!allowedEnv()) return; // no-op utenfor produksjon; RoverkMeta-API-et er allerede trygt guardet

  captureFbclid();
  initContactTracking();

  var c = getConsent();
  if (c === 'granted') { activate(); }
  else if (c === 'denied') { /* respekter avslag: last ingenting */ }
  else {
    if (document.body) showBanner();
    else document.addEventListener('DOMContentLoaded', showBanner);
  }
})();
