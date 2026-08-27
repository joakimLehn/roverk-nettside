async function tryStep(fn) {
  try { await fn(); return 'ok'; }
  catch (e) { return 'feil: ' + (e?.message || String(e)); }
}

export async function handleLead(data, deps) {
  if (data.kind === 'callback') return handleCallback(data, deps);

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

// «Ring meg opp»: kunden har bare lagt igjen navn og nummer. Det finnes ingen
// konfigurasjon å sende dem, så kunde-e-posten faller bort — og dermed er lagring
// og Slack de eneste stedene nummeret havner. Vi kjører begge, og kaster bare hvis
// ingen av dem gikk gjennom: da er nummeret tapt, og kunden må få vite det med en
// gang i stedet for å sitte og vente på en telefon som aldri kommer.
async function handleCallback(data, deps) {
  const notify = {
    lead_saved: await tryStep(() => deps.insertLead(data)),
    slack: await tryStep(() => deps.postLeadSlack(data))
  };

  if (notify.lead_saved !== 'ok' && notify.slack !== 'ok') {
    throw new Error('callback gikk tapt — ' + notify.lead_saved + ' / ' + notify.slack);
  }

  return { ok: true, notify };
}
