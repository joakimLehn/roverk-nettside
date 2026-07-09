async function tryStep(fn) {
  try { await fn(); return 'ok'; }
  catch (e) { return 'feil: ' + (e?.message || String(e)); }
}

export async function handleOrder(data, deps) {
  // 1. Lagre — MÅ lykkes. Kaster videre hvis DB feiler.
  const id = await deps.insertOrder(data);

  // 2. E-post — feil fanges, stopper ikke flyten.
  const notify = {};
  notify.email_owner = await tryStep(() => deps.sendOwnerEmail(data));
  notify.email_customer = await tryStep(() => deps.sendCustomerEmail(data));

  // 3. Slack — kjøres UANSETT, får e-poststatus med seg.
  notify.slack = await tryStep(() => deps.postSlack(data, notify));

  // 4. Lagre notify-status tilbake på raden (best effort).
  try { await deps.updateNotify(id, notify); } catch (_) { /* logges av kaller */ }

  return { ok: true, id, notify };
}
