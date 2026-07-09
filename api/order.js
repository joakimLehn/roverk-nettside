import { validateOrder } from './_lib/validate.js';
import { handleOrder } from './_lib/order-service.js';
import { insertOrder, updateNotify } from './_lib/db.js';
import { sendOwnerEmail, sendCustomerEmail } from './_lib/email.js';
import { postSlack } from './_lib/slack.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  // Vercel Node-funksjoner parser JSON-body automatisk ved application/json.
  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});

  const v = validateOrder(body);
  if (!v.ok) {
    // Honeypot-treff: svar 200 så boten ikke lærer, men lagre ingenting.
    if (v.spam) { res.status(200).json({ ok: true }); return; }
    res.status(400).json({ ok: false, error: v.error });
    return;
  }

  try {
    const result = await handleOrder(v.data, {
      insertOrder, updateNotify, sendOwnerEmail, sendCustomerEmail, postSlack
    });
    res.status(200).json({ ok: true, id: result.id });
  } catch (e) {
    console.error('ordre-feil (DB):', e);
    res.status(500).json({ ok: false, error: 'kunne ikke lagre ordre' });
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
