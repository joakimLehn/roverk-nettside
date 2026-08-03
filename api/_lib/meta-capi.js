import crypto from 'node:crypto';

// Conversions API – server-side speiling av nettleserhendelsene.
// Samme event_name + event_id som pixelen sender, slik at Meta dedupliserer
// (dedup-vindu: 48 timer). Server-side er den pålitelige kanalen: browser-pixelens
// kall til facebook.com/tr blokkeres av annonseblokkere og sporingsvern.
//
// Krever miljøvariablene:
//   META_CAPI_TOKEN     – hemmelig tilgangstoken (settes i Vercel, aldri i koden)
//   META_PIXEL_ID       – (valgfritt) pixel-ID; faller tilbake på den offentlige ID-en
//   META_CAPI_TEST_CODE – (valgfritt) ruter events til Events Manager → Test-hendelser
//
// Uten token, eller uten samtykke fra brukeren, sendes ingenting.

const GRAPH_VERSION = 'v21.0';
const DEFAULT_PIXEL_ID = '2847699825597498';
const MAX_ATTEMPTS = 2;
const ATTEMPT_TIMEOUT_MS = 2000;
const RETRY_BACKOFF_MS = 300;

function sha256(v) { return crypto.createHash('sha256').update(v).digest('hex'); }

// Normaliseringen MÅ være identisk med lib/meta.js, ellers matcher ikke
// nettleser- og server-hendelsen samme person.
function normEmail(e) { return String(e || '').trim().toLowerCase(); }

// Norsk telefonnummer -> kun siffer, med landkode. Metas match krever E.164 uten '+'.
function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 8) d = '47' + d;          // åtte siffer = norsk nr uten landkode
  else if (d.startsWith('0047')) d = '47' + d.slice(4);
  return d;
}

function normName(v) { return String(v || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function normZip(v) { return String(v || '').replace(/\D/g, ''); }
function normCity(v) { return String(v || '').trim().toLowerCase(); }

function splitName(full) {
  const parts = normName(full).split(' ').filter(Boolean);
  if (!parts.length) return { fn: '', ln: '' };
  return { fn: parts[0], ln: parts.length > 1 ? parts[parts.length - 1] : '' };
}

// Bygger user_data med hashede match-keys. Aldri PII i klartekst til Meta.
function buildUserData(data, ctx, req) {
  const user_data = {};
  const meta = data.address_meta || {};
  const { fn, ln } = splitName(data.name);

  const hashed = {
    em: normEmail(data.email),
    ph: normPhone(data.phone),
    fn,
    ln,
    ct: normCity(meta.poststed),
    zp: normZip(meta.postnummer),
    country: 'no'
  };
  for (const [k, v] of Object.entries(hashed)) {
    if (v) user_data[k] = [sha256(v)];
  }

  // Stabil ekstern ID gjør at Meta kan knytte flere hendelser til samme person
  // (f.eks. en senere Purchase mot den opprinnelige Lead-en).
  if (hashed.em) user_data.external_id = [sha256('roverk:' + hashed.em)];

  if (ctx.fbp) user_data.fbp = ctx.fbp;
  if (ctx.fbc) user_data.fbc = ctx.fbc;

  const fwd = req?.headers?.['x-forwarded-for'];
  const ip = (typeof fwd === 'string' ? fwd.split(',')[0].trim() : '') || undefined;
  if (ip) user_data.client_ip_address = ip;
  const ua = req?.headers?.['user-agent'];
  if (ua) user_data.client_user_agent = ua;

  return user_data;
}

async function postEvents(url, payload) {
  let last = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok) return { ok: true, events_received: json.events_received };

      const error = json?.error ?? json;
      last = { ok: false, status: resp.status, error, fbtrace_id: error?.fbtrace_id };
      // 4xx er vår feil (ugyldig payload/token) – retry hjelper ikke.
      if (resp.status < 500) return last;
    } catch (e) {
      last = { ok: false, error: e?.message || String(e) };
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * attempt));
    }
  }
  return last;
}

/**
 * Sender én hendelse til Conversions API.
 *
 * @param {string} eventName  Metas hendelsesnavn, f.eks. 'Lead'
 * @param {object} data       Ordre-/lead-data (name, phone, email, address_meta, price_nok, site)
 * @param {object} ctx        { event_id, fbp, fbc, consent, event_source_url }
 * @param {object} req        Vercel request – for IP og user-agent
 * @param {object} [opts]     { testCode, actionSource, value }
 */
export async function sendCapiEvent(eventName, data, ctx, req, opts = {}) {
  const token = process.env.META_CAPI_TOKEN;
  const pixelId = process.env.META_PIXEL_ID || DEFAULT_PIXEL_ID;
  // Test-kode: rutes til Events Manager → Test-hendelser i stedet for live-data.
  const testCode = opts.testCode || process.env.META_CAPI_TEST_CODE || null;

  if (!token) return { skipped: 'no-token' };
  if (!ctx || ctx.consent !== true) return { skipped: 'no-consent' };

  const custom_data = {
    currency: 'NOK',
    content_type: 'product',
    content_ids: [data.site]
  };
  if (data.product) custom_data.content_name = data.product;
  const value = typeof opts.value === 'number' ? opts.value : data.price_nok;
  // value: 0 gjør at Meta ikke kan verdioptimalisere – utelat heller feltet.
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    custom_data.value = Math.round(value);
  }

  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: opts.actionSource || 'website',
    event_source_url: ctx.event_source_url || req?.headers?.referer || undefined,
    event_id: ctx.event_id || undefined,
    user_data: buildUserData(data, ctx, req),
    custom_data
  };

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;

  const payload = { data: [event] };
  if (testCode) payload.test_event_code = testCode;

  const result = await postEvents(url, payload);
  if (!result?.ok) {
    // fbtrace_id er det Meta ber om ved feilsøking – logg det alltid.
    console.error('CAPI', eventName, 'feilet:', JSON.stringify(result));
  }
  return result;
}

/**
 * Hovedkonverteringen: innsendt bestilling/forespørsel.
 * Roverk tar ikke betalt på nett, så dette – ikke Purchase – er konverteringen
 * kampanjene skal optimalisere mot.
 */
export function sendCapiLead(order, ctx, req, opts = {}) {
  return sendCapiEvent('Lead', order, ctx, req, opts);
}

/** Myk lead: kunden ba om å få konfigurasjonen sin tilsendt. */
export function sendCapiRegistration(lead, ctx, req, opts = {}) {
  return sendCapiEvent('CompleteRegistration', lead, ctx, req, opts);
}

/**
 * Reell Purchase – sendes når oppdraget er bekreftet/montert, ikke fra nettleseren.
 * action_source: 'other' fordi konverteringen skjer utenfor nettsiden (telefon/montering).
 * Ikke koblet til noen rute ennå: det finnes ingen flyt som setter orders.status
 * til fullført. Se docs/meta-sporing.md.
 */
export function sendCapiPurchase(order, ctx, req, opts = {}) {
  return sendCapiEvent('Purchase', order, ctx, req, { actionSource: 'other', ...opts });
}
