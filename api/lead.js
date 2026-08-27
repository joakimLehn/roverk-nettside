import { validateLead } from './_lib/validate.js';
import { handleLead } from './_lib/lead-service.js';
import { insertLead } from './_lib/db.js';
import { sendLeadEmail } from './_lib/email.js';
import { postLeadSlack } from './_lib/slack.js';
import { sendCapiRegistration } from './_lib/meta-capi.js';

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

    // «Ring meg opp» speiles ikke server-side. Pixelen sender Contact, og det er
    // med vilje et svakt signal: en telefonforespørsel skal ikke kunne forveksles
    // med en bestilling i tallene kampanjene optimaliserer mot.
    if (v.data.kind === 'callback') {
      res.status(200).json({ ok: true });
      return;
    }

    // Conversions API. NB: `consent` i payloaden er samtykke til markedsførings-
    // oppfølging, ikke til sporing – tracking-samtykket kommer separat som
    // `meta_consent` fra RoverkMeta.orderCtx(). Ikke bland dem.
    // Meta-felter leses fra rå-body fordi validateLead stripper alt utenfor whitelisten.
    const metaCtx = {
      event_id: str(body.event_id),
      fbp: str(body.fbp),
      fbc: str(body.fbc),
      consent: body.meta_consent === true,
      event_source_url: str(body.event_source_url)
    };
    try {
      await sendCapiRegistration(v.data, metaCtx, req);
    } catch (capiErr) {
      console.error('CAPI-feil (ignorert):', capiErr);
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('lead-feil (' + v.data.kind + '):', e);
    res.status(500).json({
      ok: false,
      error: v.data.kind === 'callback' ? 'kunne ikke registrere forespørselen' : 'kunne ikke sende e-post'
    });
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
function str(v) { return typeof v === 'string' ? v.trim() : ''; }
