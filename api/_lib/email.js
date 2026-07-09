import { Resend } from 'resend';
import { ownerEmail, customerEmail } from './templates.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.ORDER_FROM_EMAIL;         // f.eks. "Roverk <ordre@roverk.no>"
const NOTIFY = process.env.NOTIFY_EMAIL;

export async function sendOwnerEmail(order) {
  const m = ownerEmail(order);
  const { error } = await resend.emails.send({
    from: FROM, to: NOTIFY, replyTo: order.email, subject: m.subject, html: m.html
  });
  if (error) throw new Error(error.message || 'resend-feil (owner)');
}

export async function sendCustomerEmail(order) {
  const m = customerEmail(order);
  const { error } = await resend.emails.send({
    from: FROM, to: order.email, replyTo: NOTIFY, subject: m.subject, html: m.html
  });
  if (error) throw new Error(error.message || 'resend-feil (customer)');
}
