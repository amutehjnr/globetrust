'use strict';

/**
 * Thin Resend HTTP client (no SDK required).
 * Env:
 *   RESEND_API_KEY   – required to send
 *   EMAIL_FROM       – e.g. "Globe Trust Bank <alerts@yourdomain.com>"
 *   EMAIL_REPLY_TO   – optional
 */

function createEmailService({ logger } = {}) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from =
    process.env.EMAIL_FROM ||
    'Globe Trust Bank <onboarding@resend.dev>';
  const replyTo = process.env.EMAIL_REPLY_TO || undefined;

  async function send({ to, subject, html, text }) {
    if (!apiKey) {
      logger?.warn?.(
        { to, subject },
        'RESEND_API_KEY not set — email not sent (logged only)'
      );
      console.log('[GLOBE_EMAIL] skipped (no RESEND_API_KEY)', { to, subject });
      return { id: null, skipped: true, reason: 'missing_api_key' };
    }

    const recipients = Array.isArray(to) ? to : [to];
    const body = {
      from,
      to: recipients,
      subject,
      html
    };
    if (text) body.text = text;
    if (replyTo) body.reply_to = replyTo;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.message || `Resend error ${res.status}`);
      err.status = res.status;
      err.payload = data;
      logger?.error?.({ err, to, subject, data }, 'Resend send failed');
      console.error('[GLOBE_EMAIL] failed', JSON.stringify({ status: res.status, data, to, subject }));
      throw err;
    }

    logger?.info?.({ id: data.id, to, subject }, 'Email sent via Resend');
    console.log('[GLOBE_EMAIL] sent', JSON.stringify({ id: data.id, to, subject }));
    return { id: data.id, skipped: false };
  }

  return { send, from };
}

module.exports = { createEmailService };