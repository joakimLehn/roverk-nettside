const SITES = new Set(['orden', 'orden-v2', 'skjul', 'ved']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Når kunden vil bli ringt. Holdes som korte koder så teksten kan endres på
// nettsiden uten at lagrede leads blir uleselige.
const CALLBACK_TIMES = new Set(['nar', 'dag', 'kveld']);

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

// Myke leads — to slag, samme tabell og samme endepunkt:
//
//   config_share  bruker vil ha konfigurasjonen sin på e-post. E-post påkrevd,
//                 resten er valgfri kontekst, og `consent` styrer oppfølging.
//   callback      bruker vil bli ringt opp. Navn + telefon påkrevd, e-post
//                 valgfri. Ingen konfigurasjon å sende, så ingen kunde-e-post.
export function validateLead(input) {
  const b = input && typeof input === 'object' ? input : {};

  // Honeypot — samme som ordre.
  if (str(b.hp) !== '') return { ok: false, spam: true, error: 'spam' };

  const site = str(b.site);
  if (!SITES.has(site)) return { ok: false, error: 'ugyldig site' };

  if (str(b.kind) === 'callback') return validateCallback(b, site);

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
      name: null,
      phone: null,
      email,
      callback_time: null,
      config: obj(b.config),
      product: str(b.product) || null,
      price_nok,
      share_url: share_url || null,
      consent: b.consent === true,
      utm: obj(b.utm)
    }
  };
}

function validateCallback(b, site) {
  const name = str(b.name);
  if (!name) return { ok: false, error: 'navn påkrevd' };

  const phone = str(b.phone);
  if (phone.replace(/\D/g, '').length < 8) return { ok: false, error: 'gyldig telefonnummer påkrevd' };

  // E-post er hyggelig å ha, men aldri et krav — hele poenget er ett felt mindre.
  const email = str(b.email);

  return {
    ok: true,
    data: {
      site,
      kind: 'callback',
      name,
      phone,
      email: email && EMAIL_RE.test(email) ? email : null,
      callback_time: CALLBACK_TIMES.has(str(b.callback_time)) ? str(b.callback_time) : 'nar',
      config: obj(b.config),
      product: str(b.product) || null,
      price_nok: null,
      share_url: null,
      // Forespørselen ER samtykket: de har selv bedt om å bli ringt. Feltet styrer
      // om leadet lagres og varsles, og for en callback må begge deler skje.
      consent: true,
      utm: obj(b.utm)
    }
  };
}
