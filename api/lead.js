import { validateLead } from './_lib/validate.js';
import { handleLead } from './_lib/lead-service.js';
import { insertLead } from './_lib/db.js';
import { sendLeadEmail } from './_lib/email.js';
import { postLeadSlack } from './_lib/slack.js';

// Myk lead: kunden vil ha konfigurasjonen sin på e-post (og evt. bli kontaktet).
// Samme Node-funksjon-mønster som api/order.js.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});

  const v = validateLead(body);
  if (!v.ok) {
    // Honeypot-treff: svar 200 så boten ikke lærer, men gjør ingenting.
    if (v.spam) { res.status(200).json({ ok: true }); return; }
    res.status(400).json({ ok: false, error: v.error });
    return;
  }

  try {
    await handleLead(v.data, { sendLeadEmail, insertLead, postLeadSlack });
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('lead-feil (e-post):', e);
    res.status(500).json({ ok: false, error: 'kunne ikke sende e-post' });
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
