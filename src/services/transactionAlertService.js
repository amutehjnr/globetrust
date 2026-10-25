'use strict';

/**
 * Credit / debit transaction alerts (email) — Globe Trust Bank branding.
 * Visual structure inspired by traditional bank alerts; colours from GTB site tokens.
 */

function formatMoney(amount, currency = 'NGN') {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${amount} (${currency})`;
  try {
    return (
      new Intl.NumberFormat('en-NG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(n) + ` (${currency})`
    );
  } catch {
    return `${n.toFixed(2)} (${currency})`;
  }
}

function formatDateTime(value) {
  const d = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(d.getTime())) return String(value || '');
  const pad = (x) => String(x).padStart(2, '0');
  return `${pad(d.getDate())}-${d.toLocaleString('en', { month: 'short' })}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function maskAccount(ref) {
  const s = String(ref || '');
  if (s.length <= 4) return s ? `XXXX${s}` : 'XXXXXXXX';
  return `XXXXXX${s.slice(-4)}`;
}

function buildTransactionAlertHtml(payload) {
  const {
    customerName = 'Valued Customer',
    direction = 'debit', // 'debit' | 'credit'
    dateTime,
    accountNumber,
    description,
    amount,
    currency = 'NGN',
    currentBalance,
    pendingDebit = 0,
    pendingCredit = 0,
    availableBalance,
    supportEmail = 'security@globetrust.bank'
  } = payload;

  const isDebit = String(direction).toLowerCase() !== 'credit';
  const typeLabel = isDebit ? 'Debit' : 'Credit';
  const typeColor = isDebit ? '#8B2942' : '#1B6B4A';
  const bal =
    availableBalance != null
      ? availableBalance
      : currentBalance != null
        ? currentBalance
        : null;

  const rows = [
    ['Date/time:', formatDateTime(dateTime)],
    ['Account Number:', maskAccount(accountNumber)],
    ['Description:', description || (isDebit ? 'TRANSFER' : 'CREDIT')],
    ['Amount:', formatMoney(amount, currency)],
    ['Credit/Debit:', typeLabel],
    [
      'Current Balance:',
      currentBalance != null ? formatMoney(currentBalance, currency) : '—'
    ],
    ['Pending Debit:', formatMoney(pendingDebit, currency)],
    ['Pending Credit:', formatMoney(pendingCredit, currency)]
  ];

  const rowHtml = rows
    .map(
      ([label, value], i) => `
      <tr>
        <td style="padding:10px 14px;font-weight:600;color:#102238;background:${i % 2 ? '#f5f0e7' : '#efe6d4'};border:1px solid #e0d2b5;width:38%;font-size:13px;">${label}</td>
        <td style="padding:10px 14px;color:#17283b;background:${i % 2 ? '#fffdf9' : '#faf6ef'};border:1px solid #e0d2b5;font-size:13px;">${escapeHtml(String(value))}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Transaction alert · Globe Trust Bank</title>
</head>
<body style="margin:0;padding:0;background:#ebe4d6;font-family:Arial,Helvetica,sans-serif;color:#17283b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ebe4d6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fffdf9;border-radius:4px;overflow:hidden;box-shadow:0 8px 28px rgba(16,34,56,.12);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#102238 0%,#1a3550 55%,#8f6122 100%);padding:28px 28px 24px;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="display:inline-block;background:#b8873b;color:#fffdf8;font-weight:700;font-size:14px;letter-spacing:.06em;padding:8px 12px;border-radius:6px;">GTB</div>
                  </td>
                  <td align="right" style="color:#e8c982;font-size:12px;letter-spacing:.08em;text-transform:uppercase;">Transaction alert</td>
                </tr>
              </table>
              <h1 style="margin:18px 0 6px;font-family:Georgia,serif;font-weight:500;font-size:26px;line-height:1.25;color:#fffdf9;">
                Banking with confidence
              </h1>
              <p style="margin:0;color:#e8c982;font-size:13px;">A clear record of movement on your account</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 28px 8px;">
              <p style="margin:0 0 12px;font-size:15px;color:#17283b;">Dear ${escapeHtml(customerName)},</p>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#3a4550;">
                This is a summary of a <strong style="color:${typeColor};">${typeLabel.toLowerCase()}</strong>
                transaction that has occurred on your account.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 8px;">
                ${rowHtml}
                <tr>
                  <td style="padding:12px 14px;font-weight:700;color:#fffdf9;background:#102238;border:1px solid #102238;font-size:13px;">Available Balance:</td>
                  <td style="padding:12px 14px;font-weight:700;color:#fffdf9;background:#102238;border:1px solid #102238;font-size:14px;">
                    ${bal != null ? escapeHtml(formatMoney(bal, currency)) : '—'}
                  </td>
                </tr>
              </table>

              <p style="margin:16px 0 4px;font-size:11px;color:#69717a;line-height:1.5;">
                * Pending Debit means Liens (Loan Repayment, Account Maintenance Fee, SMS Charges etc).<br>
                * Pending Credit means Cheque(s) in Clearing.
              </p>
            </td>
          </tr>

          <!-- Security -->
          <tr>
            <td style="padding:8px 28px 24px;">
              <div style="border-left:3px solid #b8873b;background:#f5f0e7;padding:14px 16px;">
                <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#102238;">Important Security and Privacy Information</p>
                <p style="margin:0;font-size:12px;line-height:1.55;color:#3a4550;">
                  Your Globe Trust Bank user ID and password, security answers, card numbers and PIN are private
                  and should never be disclosed to anyone.
                  <strong>Globe Trust Bank will never ask you for or direct you to a website that asks for these details.</strong>
                  If anything looks unfamiliar, contact us immediately.
                </p>
              </div>
              <p style="margin:18px 0 0;font-size:14px;color:#17283b;">Thank you for choosing <strong style="color:#8f6122;">Globe Trust Bank</strong>.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#102238;padding:20px 28px;text-align:center;">
              <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:18px;color:#e8c982;">my bank and I</p>
              <p style="margin:0;font-size:11px;color:#9aa6b4;line-height:1.5;">
                If you have reason to suspect any unauthorised activity on your account,<br>
                please contact us at
                <a href="mailto:${escapeHtml(supportEmail)}" style="color:#e8c982;text-decoration:underline;">${escapeHtml(supportEmail)}</a>
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPlainText(payload) {
  const isDebit = String(payload.direction).toLowerCase() !== 'credit';
  return [
    `Dear ${payload.customerName || 'Valued Customer'},`,
    '',
    `This is a summary of a ${isDebit ? 'debit' : 'credit'} transaction on your account.`,
    `Date/time: ${formatDateTime(payload.dateTime)}`,
    `Account: ${maskAccount(payload.accountNumber)}`,
    `Description: ${payload.description || ''}`,
    `Amount: ${formatMoney(payload.amount, payload.currency || 'NGN')}`,
    `Type: ${isDebit ? 'Debit' : 'Credit'}`,
    payload.availableBalance != null
      ? `Available Balance: ${formatMoney(payload.availableBalance, payload.currency || 'NGN')}`
      : '',
    '',
    'Globe Trust Bank will never ask for your password or PIN.',
    'Thank you for choosing Globe Trust Bank.'
  ]
    .filter(Boolean)
    .join('\n');
}

function createTransactionAlertService({ emailService, userRepo, logger } = {}) {
  async function sendAlert(payload) {
    const html = buildTransactionAlertHtml(payload);
    const text = buildPlainText(payload);
    const isDebit = String(payload.direction).toLowerCase() !== 'credit';
    const subject = `${isDebit ? 'Debit' : 'Credit'} alert: ${formatMoney(
      payload.amount,
      payload.currency || 'NGN'
    )} · Globe Trust Bank`;

    return emailService.send({
      to: payload.toEmail,
      subject,
      html,
      text
    });
  }

  /**
   * Convenience: after a transfer request succeeds, notify the account holder.
   */
  async function notifyTransferSuccess({
    userId,
    amount,
    currency,
    narrative,
    accountRef,
    direction = 'debit',
    balanceAfter
  }) {
    if (!emailService) {
      logger?.warn?.('emailService missing — skip alert');
      return { skipped: true };
    }

    let toEmail = null;
    let customerName = 'Valued Customer';
    try {
      if (userRepo?.findById) {
        const user = await userRepo.findById(userId);
        toEmail = user?.email;
        if (user?.firstName || user?.lastName) {
          customerName = [user.firstName, user.lastName].filter(Boolean).join(' ');
        } else if (user?.email) {
          customerName = String(user.email).split('@')[0];
        }
      }
    } catch (err) {
      logger?.error?.({ err, userId }, 'Failed loading user for alert');
    }

    if (!toEmail) {
      logger?.warn?.({ userId }, 'No email for transaction alert');
      return { skipped: true, reason: 'no_email' };
    }

    try {
      return await sendAlert({
        toEmail,
        customerName,
        direction,
        dateTime: new Date(),
        accountNumber: accountRef,
        description: narrative || (direction === 'credit' ? 'CREDIT' : 'TRANSFER'),
        amount,
        currency: currency || 'NGN',
        currentBalance: balanceAfter,
        availableBalance: balanceAfter,
        pendingDebit: 0,
        pendingCredit: 0
      });
    } catch (err) {
      // Alerts must not break the transfer path
      logger?.error?.({ err, userId }, 'Transaction alert failed');
      console.error('[GLOBE_EMAIL] alert failed', err?.message);
      return { skipped: true, reason: 'send_failed', error: err.message };
    }
  }

  return {
    sendAlert,
    notifyTransferSuccess,
    buildTransactionAlertHtml
  };
}

module.exports = {
  createTransactionAlertService,
  buildTransactionAlertHtml,
  formatMoney,
  formatDateTime,
  maskAccount
};