function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function addrLine(order) {
  const m = order.address_meta || {};
  const post = [m.postnummer, m.poststed].filter(Boolean).join(' ');
  return (order.address || '—') + (post ? ', ' + post : '');
}
function addrUnverified(order) {
  const m = order.address_meta;
  // Uverifisert kun når adresse finnes og address_meta ble satt (lookup forsøkt),
  // men adressen ikke ble valgt fra Kartverket. Mangler address_meta helt
  // (eldre ordre uten lookup) gir ingen advarsel.
  return !!(order.address && m && m.verified !== true);
}

const SITE_NAVN = { 'orden': 'Orden', 'orden-v2': 'Orden', 'skjul': 'Skjul', 'ved': 'Ved' };

function rows(order) {
  const r = [
    ['Produkt', order.product],
    ['Navn', order.name],
    ['Telefon', order.phone],
    ['E-post', order.email],
    ['Adresse', addrLine(order) + (addrUnverified(order) ? '  ⚠️ uverifisert' : '')],
    ['Ønsket dato', order.preferred_date || '—'],
    ['Pris', order.price_nok != null ? order.price_nok + ' kr' : '—']
  ];
  return r.map(([k, v]) =>
    `<tr><td style="padding:6px 12px;color:#666">${esc(k)}</td><td style="padding:6px 12px;font-weight:600">${esc(v)}</td></tr>`
  ).join('');
}

export function ownerEmail(order) {
  const navn = SITE_NAVN[order.site] || order.site;
  const config = esc(JSON.stringify(order.config || {}, null, 2));
  const utm = esc(JSON.stringify(order.utm || {}, null, 2));
  return {
    subject: `Ny ordre — Roverk ${navn}: ${order.product || ''}`.trim(),
    html: `<h2>Ny ordre (${esc(navn)})</h2>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${rows(order)}</table>
<p><a href="mailto:${esc(order.email)}">Svar kunden</a> · <a href="tel:${esc(order.phone)}">Ring</a></p>
<h3>Konfig</h3><pre style="background:#f5f5f5;padding:12px;border-radius:8px">${config}</pre>
<h3>UTM</h3><pre style="background:#f5f5f5;padding:12px;border-radius:8px">${utm}</pre>`
  };
}

export function customerEmail(order) {
  return {
    subject: 'Takk for bestillingen — Roverk AS',
    html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.5;max-width:520px">
<h2>Takk for bestillingen, ${esc(order.name.split(' ')[0])}!</h2>
<p>Vi har mottatt bestillingen din${order.product ? ` av <strong>${esc(order.product)}</strong>` : ''}.
Vi tar kontakt for å bekrefte detaljer og monteringsdato.</p>
<p><strong>Du betaler først når alt er levert og ferdig montert.</strong></p>
<p style="color:#666;font-size:13px">Har du spørsmål? Bare svar på denne e-posten.</p>
<p style="color:#666;font-size:13px">— Roverk AS</p></div>`
  };
}

export function slackMessage(order, notify) {
  const navn = SITE_NAVN[order.site] || order.site;
  const lines = [
    `:package: *Ny ordre — Roverk ${navn}* (${order.site})`,
    `*Produkt:* ${order.product || '—'}`,
    `*Kunde:* ${order.name} · ${order.phone} · ${order.email}`,
    `*Adresse:* ${addrLine(order)}${addrUnverified(order) ? '  ⚠️ uverifisert' : ''}`,
    `*Ønsket dato:* ${order.preferred_date || '—'}`,
    `*Pris:* ${order.price_nok != null ? order.price_nok + ' kr' : '—'}`
  ];
  const warns = [];
  if (notify.email_owner && notify.email_owner !== 'ok') warns.push(`eier-e-post (${notify.email_owner})`);
  if (notify.email_customer && notify.email_customer !== 'ok') warns.push(`kunde-e-post (${notify.email_customer})`);
  if (warns.length) lines.push(`⚠️ E-post feilet: ${warns.join(', ')}`);
  return { text: lines.join('\n') };
}
