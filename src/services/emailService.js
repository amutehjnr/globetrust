'use strict';

/**
 * Globe Trust Bank — all outbound email via Resend API.
 *
 * Env:
 *   RESEND_API_KEY   required to actually send
 *   EMAIL_FROM       e.g. "Globe Trust Bank <alerts@yourdomain.com>"
 *   EMAIL_REPLY_TO   optional
 *   APP_BASE_URL     e.g. https://globetrust.vercel.app (links in emails)
 *   EMAIL_SUPPORT    security / support address shown in footers
 */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function baseUrl() {
  return (process.env.APP_BASE_URL || process.env.PUBLIC_URL || 'http://localhost:3000').replace(
    /\/$/,
    ''
  );
}

function supportEmail() {
  return process.env.EMAIL_SUPPORT || process.env.EMAIL_REPLY_TO || 'security@globetrust.bank';
}

/** Shared GTB branded shell (navy / gold / ivory) */
function wrapBrandedEmail({ preheader, title, bodyHtml }) {
  const support = escapeHtml(supportEmail());
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Globe Trust Bank</title>
</head>
<body style="margin:0;padding:0;background:#ebe4d6;font-family:Arial,Helvetica,sans-serif;color:#17283b;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader || title)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ebe4d6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fffdf9;border-radius:4px;overflow:hidden;box-shadow:0 8px 28px rgba(16,34,56,.12);">
          <tr>
            <td style="background:linear-gradient(135deg,#102238 0%,#1a3550 55%,#8f6122 100%);padding:28px 28px 24px;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="display:inline-block;background:#b8873b;color:#fffdf8;font-weight:700;font-size:14px;letter-spacing:.06em;padding:8px 12px;border-radius:6px;">GTB</div>
                  </td>
                  <td align="right" style="color:#e8c982;font-size:12px;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(title)}</td>
                </tr>
              </table>
              <h1 style="margin:18px 0 6px;font-family:Georgia,serif;font-weight:500;font-size:24px;line-height:1.25;color:#fffdf9;">Globe Trust Bank</h1>
              <p style="margin:0;color:#e8c982;font-size:13px;">Banking with confidence</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="background:#102238;padding:20px 28px;text-align:center;">
              <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:18px;color:#e8c982;">my bank and I</p>
              <p style="margin:0;font-size:11px;color:#9aa6b4;line-height:1.5;">
                Questions? Write to
                <a href="mailto:${support}" style="color:#e8c982;text-decoration:underline;">${support}</a><br>
                Globe Trust Bank will never ask for your password or PIN by email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function createEmailService({ logger } = {}) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from =
    process.env.EMAIL_FROM || 'Globe Trust Bank <onboarding@resend.dev>';
  const replyTo = process.env.EMAIL_REPLY_TO || undefined;

  async function send({ to, subject, html, text, tags }) {
    const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
    if (!recipients.length) {
      logger?.warn?.({ subject }, 'Email skipped — no recipients');
      return { id: null, skipped: true, reason: 'no_recipients' };
    }

    if (!apiKey) {
      logger?.warn?.({ to: recipients, subject }, 'RESEND_API_KEY missing — email not sent');
      console.log('[GLOBE_EMAIL] skipped (no RESEND_API_KEY)', { to: recipients, subject });
      return { id: null, skipped: true, reason: 'missing_api_key' };
    }

    const body = { from, to: recipients, subject, html };
    if (text) body.text = text;
    if (replyTo) body.reply_to = replyTo;
    if (tags) body.tags = tags;

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
      logger?.error?.({ err, to: recipients, subject, data }, 'Resend send failed');
      console.error('[GLOBE_EMAIL] failed', JSON.stringify({ status: res.status, data, to: recipients, subject }));
      throw err;
    }

    logger?.info?.({ id: data.id, to: recipients, subject }, 'Email sent via Resend');
    console.log('[GLOBE_EMAIL] sent', JSON.stringify({ id: data.id, to: recipients, subject }));
    return { id: data.id, skipped: false };
  }

  async function sendPasswordReset({ to, customerName, rawToken }) {
    const link = `${baseUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const name = customerName || 'Valued Customer';
    const html = wrapBrandedEmail({
      title: 'Password reset',
      preheader: 'Reset your Globe Trust Bank password',
      bodyHtml: `
        <p style="margin:0 0 12px;font-size:15px;">Dear ${escapeHtml(name)},</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.55;color:#3a4550;">
          We received a request to reset the password for your Globe Trust Bank account.
          This link expires in <strong>30 minutes</strong>. If you did not request this, you can ignore this email.
        </p>
        <p style="margin:0 0 22px;text-align:center;">
          <a href="${escapeHtml(link)}" style="display:inline-block;background:linear-gradient(135deg,#c99b50,#a9762d);color:#fffdf8;text-decoration:none;font-weight:600;font-size:14px;padding:14px 28px;border-radius:8px;">
            Reset password
          </a>
        </p>
        <p style="margin:0;font-size:12px;color:#69717a;line-height:1.5;word-break:break-all;">
          Or paste this link into your browser:<br>
          <a href="${escapeHtml(link)}" style="color:#8f6122;">${escapeHtml(link)}</a>
        </p>`
    });
    const text = `Dear ${name},\n\nReset your password (expires in 30 minutes):\n${link}\n\nIf you did not request this, ignore this email.\n— Globe Trust Bank`;
    return send({
      to,
      subject: 'Reset your Globe Trust Bank password',
      html,
      text,
      tags: [{ name: 'category', value: 'password_reset' }]
    });
  }

  async function sendWelcome({ to, customerName }) {
    const name = customerName || 'Valued Customer';
    const signIn = `${baseUrl()}/sign-in`;
    const html = wrapBrandedEmail({
      title: 'Welcome',
      preheader: 'Your Globe Trust Bank account is ready',
      bodyHtml: `
        <p style="margin:0 0 12px;font-size:15px;">Dear ${escapeHtml(name)},</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.55;color:#3a4550;">
          Welcome to Globe Trust Bank. Your account has been created. Sign in to complete identity verification,
          link accounts, and manage your banking with confidence.
        </p>
        <p style="margin:0 0 22px;text-align:center;">
          <a href="${escapeHtml(signIn)}" style="display:inline-block;background:linear-gradient(135deg,#c99b50,#a9762d);color:#fffdf8;text-decoration:none;font-weight:600;font-size:14px;padding:14px 28px;border-radius:8px;">
            Sign in
          </a>
        </p>
        <p style="margin:0;font-size:12px;color:#69717a;">Never share your password or one-time codes with anyone.</p>`
    });
    const text = `Dear ${name},\n\nWelcome to Globe Trust Bank. Sign in: ${signIn}\n\n— Globe Trust Bank`;
    return send({
      to,
      subject: 'Welcome to Globe Trust Bank',
      html,
      text,
      tags: [{ name: 'category', value: 'welcome' }]
    });
  }

  async function sendEmailVerification({ to, customerName, rawToken }) {
    const link = `${baseUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;
    const name = customerName || 'Valued Customer';
    const html = wrapBrandedEmail({
      title: 'Verify email',
      preheader: 'Confirm your email address',
      bodyHtml: `
        <p style="margin:0 0 12px;font-size:15px;">Dear ${escapeHtml(name)},</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.55;color:#3a4550;">
          Please confirm this email address for your Globe Trust Bank account. This link expires in 24 hours.
        </p>
        <p style="margin:0 0 22px;text-align:center;">
          <a href="${escapeHtml(link)}" style="display:inline-block;background:linear-gradient(135deg,#c99b50,#a9762d);color:#fffdf8;text-decoration:none;font-weight:600;font-size:14px;padding:14px 28px;border-radius:8px;">
            Verify email
          </a>
        </p>
        <p style="margin:0;font-size:12px;color:#69717a;word-break:break-all;">
          Or open: <a href="${escapeHtml(link)}" style="color:#8f6122;">${escapeHtml(link)}</a>
        </p>`
    });
    const text = `Dear ${name},\n\nVerify your email:\n${link}\n\n— Globe Trust Bank`;
    return send({
      to,
      subject: 'Verify your Globe Trust Bank email',
      html,
      text,
      tags: [{ name: 'category', value: 'email_verification' }]
    });
  }

  async function sendGeneric({ to, subject, heading, paragraphs = [], ctaLabel, ctaUrl }) {
    const paras = paragraphs
      .map(
        (p) =>
          `<p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:#3a4550;">${escapeHtml(p)}</p>`
      )
      .join('');
    const cta =
      ctaLabel && ctaUrl
        ? `<p style="margin:18px 0;text-align:center;">
            <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:linear-gradient(135deg,#c99b50,#a9762d);color:#fffdf8;text-decoration:none;font-weight:600;font-size:14px;padding:14px 28px;border-radius:8px;">${escapeHtml(ctaLabel)}</a>
          </p>`
        : '';
    const html = wrapBrandedEmail({
      title: heading || subject,
      preheader: subject,
      bodyHtml: `${paras}${cta}`
    });
    const text = [heading, '', ...paragraphs, ctaUrl || ''].filter(Boolean).join('\n');
    return send({ to, subject, html, text });
  }

  return {
    send,
    sendPasswordReset,
    sendWelcome,
    sendEmailVerification,
    sendGeneric,
    from,
    baseUrl: baseUrl()
  };
}

module.exports = { createEmailService };