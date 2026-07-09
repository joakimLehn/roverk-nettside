const SITES = new Set(['orden', 'orden-v2', 'skjul', 'ved']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(v) { return typeof v === 'string' ? v.trim() : ''; }
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

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
      address: str(b.address),
      price_nok,
      utm: obj(b.utm)
    }
  };
}
