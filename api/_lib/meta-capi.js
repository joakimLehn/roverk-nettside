import crypto from 'node:crypto';

// Conversions API (server-side speiling av Purchase).
// Sender samme event som nettleseren (Meta-pixel), med samme event_id,
// slik at Meta dedupliserer og ikke teller dobbelt.
//
// Krever miljøvariablene:
//   META_CAPI_TOKEN  – hemmelig tilgangstoken (settes i Vercel, aldri i koden)
//   META_PIXEL_ID    – (valgfritt) pixel-ID; faller tilbake på den offentlige ID-en
//
// Uten token, eller uten samtykke fra brukeren, sendes ingenting.

const GRAPH_VERSION = 'v21.0';
const DEFAULT_PIXEL_ID = '2847699825597498';

function sha256(v) { return crypto.createHash('sha256').update(v).digest('hex'); }

function normEmail(e) { return String(e || '').trim().toLowerCase(); }

// Norsk telefonnummer -> kun siffer, med landkode. Metas match krever E.164 uten '+'.
function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 8) d = '47' + d;          // åtte siffer = norsk nr uten landkode
  else if (d.startsWith('0047')) d = '47' + d.slice(4);
  return d;
}

export async function sendCapiPurchase(order, ctx, req) {
  const token = process.env.META_CAPI_TOKEN;
  const pixelId = process.env.META_PIXEL_ID || DEFAULT_PIXEL_ID;

  if (!token) return { skipped: 'no-token' };
  if (!ctx || ctx.consent !== true) return { skipped: 'no-consent' };

  const fwd = req && req.headers && req.headers['x-forwarded-for'];
  const ip = (typeof fwd === 'string' ? fwd.split(',')[0].trim() : '') || undefined;
  const ua = (req && req.headers && req.headers['user-agent']) || undefined;

  const user_data = {};
  if (order.email) user_data.em = [sha256(normEmail(order.email))];
  const ph = normPhone(order.phone);
  if (ph) user_data.ph = [sha256(ph)];
  if (ctx.fbp) user_data.fbp = ctx.fbp;
  if (ctx.fbc) user_data.fbc = ctx.fbc;
  if (ip) user_data.client_ip_address = ip;
  if (ua) user_data.client_user_agent = ua;

  const custom_data = {
    currency: 'NOK',
    content_type: 'product',
    content_ids: [order.site]
  };
  if (typeof order.price_nok === 'number') custom_data.value = order.price_nok;

  const event = {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_source_url: ctx.event_source_url || (req && req.headers && req.headers.referer) || undefined,
    event_id: ctx.event_id || undefined,
    user_data,
    custom_data
  };

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [event] })
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) return { ok: false, status: resp.status, error: json && json.error ? json.error : json };
  return { ok: true, events_received: json.events_received };
}
