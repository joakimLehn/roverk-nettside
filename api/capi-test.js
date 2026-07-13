import { sendCapiPurchase } from './_lib/meta-capi.js';

// MIDLERTIDIG diagnostikk-rute for å verifisere Conversions API server-side.
// Krever ?code=<test_event_code fra Events Manager → Test-hendelser>, slik at
// eventet KUN havner i Test-hendelser og ikke forurenser live-data.
// Fjernes så snart CAPI er bekreftet.
export default async function handler(req, res) {
  const code = typeof req.query?.code === 'string' ? req.query.code.trim() : '';
  if (!code) {
    res.status(400).json({ ok: false, error: 'mangler ?code=<test_event_code>' });
    return;
  }

  const testOrder = {
    site: 'orden',
    email: 'capi-test@roverk.no',
    phone: '90000000',
    price_nok: 3190
  };
  const ctx = {
    consent: true,
    event_id: 'capi-test-' + Date.now(),
    fbp: null,
    fbc: null,
    event_source_url: 'https://www.roverk.no/orden'
  };

  try {
    const result = await sendCapiPurchase(testOrder, ctx, req, { testCode: code });
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}
