import { neon } from '@neondatabase/serverless';

// Lazy init: neon() kaster hvis DATABASE_URL mangler. Å utsette kallet til
// første bruk gjør at modulen kan importeres (syntaks-/CI-sjekk) uten env satt.
let _sql = null;
function sql(strings, ...values) {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql(strings, ...values);
}

export async function insertOrder(o) {
  const rows = await sql`
    insert into orders (site, product, config, preferred_date, name, phone, email, address, address_meta, price_nok, utm)
    values (${o.site}, ${o.product}, ${JSON.stringify(o.config)}, ${o.preferred_date},
            ${o.name}, ${o.phone}, ${o.email}, ${o.address}, ${JSON.stringify(o.address_meta || {})},
            ${o.price_nok}, ${JSON.stringify(o.utm)})
    returning id`;
  return rows[0].id;
}

export async function updateNotify(id, notify) {
  await sql`update orders set notify = ${JSON.stringify(notify)} where id = ${id}`;
}

export async function insertLead(l) {
  const rows = await sql`
    insert into leads (site, kind, email, config, product, price_nok, share_url, consent, utm)
    values (${l.site}, ${l.kind}, ${l.email}, ${JSON.stringify(l.config)}, ${l.product},
            ${l.price_nok}, ${l.share_url}, ${l.consent}, ${JSON.stringify(l.utm)})
    returning id`;
  return rows[0].id;
}
