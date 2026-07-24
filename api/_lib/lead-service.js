async function tryStep(fn) {
  try { await fn(); return 'ok'; }
  catch (e) { return 'feil: ' + (e?.message || String(e)); }
}

export async function handleLead(data, deps) {
  // 1. Send kunden konfig-lenken — hovedhandlingen. Kaster videre hvis e-post feiler,
  //    så kalleren kan svare bruker med feil (de ba jo om å få den tilsendt).
  await deps.sendLeadEmail(data);

  const notify = { email_lead: 'ok' };

  // 2. Kun ved samtykke: lagre lead + varsle Slack (best effort — velter aldri svaret).
  if (data.consent) {
    notify.lead_saved = await tryStep(() => deps.insertLead(data));
    notify.slack = await tryStep(() => deps.postLeadSlack(data));
  }

  return { ok: true, notify };
}
