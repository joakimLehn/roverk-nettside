/* Roverk – Meta Pixel + Conversions API (samtykkestyrt)
 *
 * Laster INGENTING fra Meta før brukeren aktivt har samtykket.
 * - Ingen samtykke valgt  -> vis banner, ikke fyr noe
 * - «Godta»               -> last pixel, fyr PageView + ViewContent (hvis produktside)
 * - «Avslå»               -> ingenting lastes, ingen cookies fra Meta
 *
 * Purchase fyres fra bestillingssidenes suksess-callback via RoverkMeta.purchase(),
 * og speiles server-side (Conversions API) med samme event_id for deduplisering.
 */
(function () {
  'use strict';

  var PIXEL_ID = '2847699825597498';
  var CONSENT_KEY = 'roverk_meta_consent'; // 'granted' | 'denied'
  var inited = false;

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

  // --- Last pixel-bootstrap (kjører først etter samtykke) ---
  function loadPixel() {
    if (inited || window.fbq) { inited = true; return; }
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
    inited = true;
  }

  function fireViewContent() {
    var p = window.__ROVERK_META_PRODUCT;
    if (!window.fbq || !p) return;
    var data = {
      content_ids: [p.id],
      content_type: 'product',
      content_name: p.name,
      content_category: p.category || 'Storage',
      currency: 'NOK'
    };
    if (typeof p.value === 'number') data.value = p.value;
    window.fbq('track', 'ViewContent', data);
  }

  function activate() { loadPixel(); fireViewContent(); }

  // --- Offentlig API brukt av bestillingssidene ---
  window.RoverkMeta = {
    hasConsent: function () { return getConsent() === 'granted'; },

    // Trekk tilbake / endre samtykke: nullstill og vis banneret igjen.
    resetConsent: function () { try { localStorage.removeItem(CONSENT_KEY); } catch (e) {} location.reload(); },

    // Kalles i submitOrder(). Returnerer felter som legges på ordre-payloaden
    // slik at serveren (CAPI) kan speile samme Purchase med samme event_id.
    orderCtx: function () {
      return {
        event_id: uuid(),
        fbp: cookie('_fbp'),
        fbc: cookie('_fbc'),
        consent: getConsent() === 'granted',
        event_source_url: location.href
      };
    },

    // Kalles i suksess-callbacken. eventId MÅ være samme som i orderCtx().
    purchase: function (o) {
      if (!window.fbq || !o) return;
      var d = { value: o.value, currency: 'NOK', content_type: 'product' };
      if (window.__ROVERK_META_PRODUCT) d.content_ids = [window.__ROVERK_META_PRODUCT.id];
      window.fbq('track', 'Purchase', d, o.eventId ? { eventID: o.eventId } : undefined);
    }
  };

  // --- Samtykkebanner ---
  function removeBanner() {
    var el = document.getElementById('roverk-consent');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function grant() { setConsent('granted'); removeBanner(); activate(); }
  function deny() { setConsent('denied'); removeBanner(); }

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
      'Vi bruker Meta-pixel for å måle effekten av annonsene våre og vise relevante annonser. ' +
      'Dette setter informasjonskapsler og deler data med Meta. ' +
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

  // --- Oppstart ---
  var c = getConsent();
  if (c === 'granted') { activate(); }
  else if (c === 'denied') { /* respekter avslag: last ingenting */ }
  else {
    if (document.body) showBanner();
    else document.addEventListener('DOMContentLoaded', showBanner);
  }
})();
