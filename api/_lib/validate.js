const SITES = new Set(['orden', 'orden-v2', 'skjul', 'ved']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(v) { return typeof v === 'string' ? v.trim() : ''; }
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

function normAddressMeta(v) {
  const m = obj(v);
  const lat = Number(m.lat), lon = Number(m.lon);
  return {
    postnummer: str(m.postnummer) || null,
    poststed: str(m.poststed) || null,
    kommunenummer: str(m.kommunenummer) || null,
    kommunenavn: str(m.kommunenavn) || null,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    verified: m.verified === true
  };
}

export function validateOrder(input) {
  const b = input && typeof input === 'object' ? input : {};

  // Honeypot: skjult felt skal alltid være tomt. Utfylt => bot.
  if (str(b.hp) !== '') return { ok: false, spam: true, error: 'spam' };

  const site = str(b.site);
  if (!SITES.has(site)) return { ok: false, error: 'ugyldig site' };

  const name = str(b.name);
  const phone = str(b.phone);
  const email = str(b.email);
  if (!name) return { ok: false, error: 'navn påkrevd' };
  if (!phone) return { ok: false, error: 'telefon påkrevd' };
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: 'gyldig e-post påkrevd' };

  const address = str(b.address);
  if (!address) return { ok: false, error: 'adresse påkrevd' };

  const pd = str(b.preferred_date);
  const preferred_date = ISO_DATE_RE.test(pd) ? pd : null;

  const priceRaw = Number(b.price_nok);
  const price_nok = Number.isFinite(priceRaw) && priceRaw >= 0 ? Math.round(priceRaw) : null;

  return {
    ok: true,
    data: {
      site,
      product: str(b.product) || null,
      config: obj(b.config),
      preferred_date,
      name, phone, email,
      address,
      address_meta: normAddressMeta(b.address_meta),
      price_nok,
      utm: obj(b.utm)
    }
  };
}

// Myk lead: bruker vil ha konfigurasjonen sin på e-post (og evt. bli kontaktet).
// Kun e-post er påkrevd — resten er valgfri kontekst.
export function validateLead(input) {
  const b = input && typeof input === 'object' ? input : {};

  // Honeypot — samme som ordre.
  if (str(b.hp) !== '') return { ok: false, spam: true, error: 'spam' };

  const site = str(b.site);
  if (!SITES.has(site)) return { ok: false, error: 'ugyldig site' };

  const email = str(b.email);
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: 'gyldig e-post påkrevd' };

  const priceRaw = Number(b.price_nok);
  const price_nok = Number.isFinite(priceRaw) && priceRaw >= 0 ? Math.round(priceRaw) : null;

  const share_url = str(b.share_url);

  return {
    ok: true,
    data: {
      site,
      kind: 'config_share',
      email,
      config: obj(b.config),
      product: str(b.product) || null,
      price_nok,
      share_url: share_url || null,
      consent: b.consent === true,
      utm: obj(b.utm)
    }
  };
}
