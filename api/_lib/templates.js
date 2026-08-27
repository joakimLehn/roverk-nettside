function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function addrLine(order) {
  // order.address inneholder nå hele adressen inkl. postnr/poststed (fra
  // Kartverket-valg), eller fritekst. address_meta har de strukturerte feltene.
  return order.address || '—';
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

function fmtNok(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

// E-post til kunden med deres egen konfig-lenke (myk lead / «send til deg selv»).
export function leadEmail(lead) {
  // /skjul har ingen konfigurator — der ber kunden om en prisoversikt. Tallene
  // kommer fra siden selv (samme GRUNN/DIMS/MONT som størrelseskortene rendres
  // fra), så e-posten aldri kan drive fra det kunden nettopp så.
  if (Array.isArray(lead.config?.storrelser) && lead.config.storrelser.length) return oversiktEmail(lead);

  const navn = SITE_NAVN[lead.site] || lead.site;
  const url = lead.share_url || 'https://www.roverk.no/orden';
  const prod = lead.product ? esc(lead.product) : ('Roverk ' + esc(navn));
  const price = lead.price_nok != null ? fmtNok(lead.price_nok) + ' kr' : null;
  return {
    subject: 'Din Roverk-konfigurasjon',
    html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.5;max-width:520px">
<h2>Her er racket du satte sammen</h2>
<p><strong>${prod}</strong>${price ? ` — <strong>${esc(price)}</strong> (introduksjonspris, inkl. kasser, levering og montering)` : ''}.</p>
<p><a href="${esc(url)}" style="display:inline-block;background:#17150F;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700">Åpne konfigurasjonen din →</a></p>
<p style="color:#666;font-size:13px">Lenken åpner racket akkurat slik du satte det opp, så du kan justere det eller reservere plassen din når du er klar. Helt uforpliktende — du betaler først når alt er levert og ferdig montert.</p>
<p style="color:#666;font-size:13px">— Roverk AS</p></div>`
  };
}

// Tallene er kundens egne — de kommer fra siden de nettopp så på, og går kun til
// deres egen innboks. Derfor holder det å rense dem, ikke å gjenskape dem her.
function kr(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? fmtNok(Math.round(n)) + ' kr' : '—';
}

function oversiktEmail(lead) {
  const cell = 'padding:10px 12px;border-bottom:1px solid #E4DFD5;font-size:14px';
  const rows = lead.config.storrelser.map((s) => `
<tr>
  <td style="${cell}"><strong>${esc(s.dunker)} dunker</strong><br>
    <span style="color:#6E685E;font-size:12.5px">Standard ${esc(s.mal)}<br>XL ${esc(s.mal_xl)}</span></td>
  <td style="${cell};text-align:right;white-space:nowrap">${esc(kr(s.levert))}</td>
  <td style="${cell};text-align:right;white-space:nowrap"><strong>${esc(kr(s.montert))}</strong></td>
</tr>`).join('');

  const frist = lead.config.intro_aktiv && lead.config.intro_til
    ? `<p style="background:#E9DBC1;border-radius:10px;padding:12px 14px;font-size:14px;margin:18px 0">
Prisene over er introduksjonspris og gjelder til <strong>${esc(lead.config.intro_til)}</strong>. Bestiller du innen fristen, låser vi dem for deg.</p>`
    : '';

  return {
    subject: 'Mål og priser — Roverk Skjul',
    html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.5;max-width:560px;color:#141310">
<h2 style="margin:0 0 6px">Mål og priser på søppelkasseskur</h2>
<p style="color:#6E685E;margin:0 0 18px">Her er hele oversikten, så kan du måle opp i fred.</p>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #E4DFD5">
<tr>
  <th style="${cell};text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6E685E">Størrelse (B×D×H)</th>
  <th style="${cell};text-align:right;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6E685E">Levert</th>
  <th style="${cell};text-align:right;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6E685E">Ferdig montert</th>
</tr>
${rows}
</table>
<p style="color:#6E685E;font-size:13px;margin:14px 0 0">Prisene er for impregnert treverk. Royalimpregnert koster mer og velges i bestillingen. Standard passer 140 L og 240 L dunker, XL tar opptil 370 L. Forankring prises etter underlag — spør oss.</p>
${frist}
<p><a href="https://www.roverk.no/skjul#storrelser" style="display:inline-block;background:#17150F;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700">Se skurene og bestill →</a></p>
<p style="color:#6E685E;font-size:13px">Usikker på hvilken størrelse som passer? Ring oss på 901 86 693, så regner vi det ut sammen. Du betaler først når skuret står ferdig.</p>
<p style="color:#6E685E;font-size:13px">— Roverk AS</p></div>`
  };
}

const CALLBACK_TEKST = { nar: 'når som helst', dag: 'på dagtid', kveld: 'etter kl. 16' };

export function leadSlackMessage(lead) {
  const navn = SITE_NAVN[lead.site] || lead.site;

  // «Ring meg opp» — nummeret er hele poenget, så det skal stå først og alene.
  if (lead.kind === 'callback') {
    const lines = [
      `:telephone_receiver: *Ring meg opp — Roverk ${navn}* (${lead.site})`,
      `*${lead.name}* · *${lead.phone}*`,
      `*Passer:* ${CALLBACK_TEKST[lead.callback_time] || 'når som helst'}`,
      `*Så på:* ${lead.product || '—'}`
    ];
    if (lead.email) lines.push(`*E-post:* ${lead.email}`);
    return { text: lines.join('\n') };
  }

  const price = lead.price_nok != null ? fmtNok(lead.price_nok) + ' kr' : '—';
  const lines = [
    `:bookmark_tabs: *Ny lead (delt konfig) — Roverk ${navn}* (${lead.site})`,
    `*E-post:* ${lead.email}`,
    `*Produkt:* ${lead.product || '—'} · *Pris:* ${price}`,
    `*Konfig:* ${JSON.stringify(lead.config || {})}`,
    `*Samtykke til oppfølging:* ${lead.consent ? 'ja ✅' : 'nei'}`
  ];
  if (lead.share_url) lines.push(`*Lenke:* ${lead.share_url}`);
  return { text: lines.join('\n') };
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
