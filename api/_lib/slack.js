import { slackMessage } from './templates.js';

export async function postSlack(order, notify) {
  const url = process.env.SLACK_WEBHOOK_URL;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(slackMessage(order, notify))
  });
  if (!res.ok) throw new Error('slack ' + res.status);
}
