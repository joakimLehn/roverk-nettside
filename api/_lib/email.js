import { Resend } from 'resend';
import { ownerEmail, customerEmail, leadEmail } from './templates.js';

// Lazy init: Resend-konstruktøren kaster hvis RESEND_API_KEY mangler. Utsatt til
// første bruk betyr at modulen kan importeres uten env, OG at en manglende nøkkel
// i prod blir en fanget e-postfeil (ordren lagres og Slack varsler) i stedet for
// en cold-start-krasj som mister ordren.
let _resend = null;
function resend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export async function sendOwnerEmail(order) {
  const m = ownerEmail(order);
  const { error } = await resend().emails.send({
    from: process.env.ORDER_FROM_EMAIL, to: process.env.NOTIFY_EMAIL,
    replyTo: order.email, subject: m.subject, html: m.html
  });
  if (error) throw new Error(error.message || 'resend-feil (owner)');
}

export async function sendCustomerEmail(order) {
  const m = customerEmail(order);
  const { error } = await resend().emails.send({
    from: process.env.ORDER_FROM_EMAIL, to: order.email,
    replyTo: process.env.NOTIFY_EMAIL, subject: m.subject, html: m.html
  });
  if (error) throw new Error(error.message || 'resend-feil (customer)');
}

// Sender kunden deres egen konfig-lenke (myk lead / «send til deg selv»).
export async function sendLeadEmail(lead) {
  const m = leadEmail(lead);
  const { error } = await resend().emails.send({
    from: process.env.ORDER_FROM_EMAIL, to: lead.email,
    replyTo: process.env.NOTIFY_EMAIL, subject: m.subject, html: m.html
  });
  if (error) throw new Error(error.message || 'resend-feil (lead)');
}
