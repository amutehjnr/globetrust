'use strict';

/**
 * Live mid-market FX via Frankfurter (ECB reference rates).
 * Server-side only — no API key required.
 */

const TOP_QUOTES = ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY', 'INR', 'SGD'];

function formatRate(value, quote) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  // JPY-style currencies: fewer decimals
  if (['JPY', 'KRW', 'INR'].includes(quote)) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function pctChange(today, yesterday) {
  const t = Number(today);
  const y = Number(yesterday);
  if (!Number.isFinite(t) || !Number.isFinite(y) || y === 0) return '0.0%';
  const pct = ((t - y) / y) * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error(`FX HTTP ${res.status}`);
  return res.json();
}

/**
 * @returns {Promise<{ rates: Array<{pair, mid, change, base, quote}>, asOf: string|null, source: string }>}
 */
async function getTopMarketRates() {
  const base = 'USD';
  const to = TOP_QUOTES.join(',');

  const latest = await fetchJson(
    `https://api.frankfurter.app/latest?from=${base}&to=${to}`
  );

  // Previous ECB business day for change %
  let previous = null;
  try {
    const d = new Date(latest.date || Date.now());
    d.setUTCDate(d.getUTCDate() - 1);
    // walk back up to 4 days to skip weekends
    for (let i = 0; i < 4; i += 1) {
      const iso = d.toISOString().slice(0, 10);
      try {
        previous = await fetchJson(
          `https://api.frankfurter.app/${iso}?from=${base}&to=${to}`
        );
        if (previous?.rates) break;
      } catch (_) {
        /* try earlier day */
      }
      d.setUTCDate(d.getUTCDate() - 1);
    }
  } catch (_) {
    previous = null;
  }

  const rates = TOP_QUOTES.map((quote) => {
    const mid = latest.rates?.[quote];
    const prev = previous?.rates?.[quote];
    return {
      pair: `${base} / ${quote}`,
      base,
      quote,
      mid: formatRate(mid, quote),
      change: pctChange(mid, prev),
      raw: mid
    };
  }).filter((r) => r.raw != null);

  // Also add EUR/GBP and EUR/USD inverted style majors
  const eur = latest.rates?.EUR;
  const gbp = latest.rates?.GBP;
  if (eur && gbp) {
    const eurGbp = gbp / eur;
    const prevEur = previous?.rates?.EUR;
    const prevGbp = previous?.rates?.GBP;
    const prevEurGbp = prevEur && prevGbp ? prevGbp / prevEur : null;
    rates.unshift({
      pair: 'EUR / GBP',
      base: 'EUR',
      quote: 'GBP',
      mid: formatRate(eurGbp, 'GBP'),
      change: pctChange(eurGbp, prevEurGbp),
      raw: eurGbp
    });
    rates.unshift({
      pair: 'EUR / USD',
      base: 'EUR',
      quote: 'USD',
      mid: formatRate(1 / eur, 'USD'),
      change: pctChange(1 / eur, prevEur ? 1 / prevEur : null),
      raw: 1 / eur
    });
  }
  if (gbp) {
    rates.splice(2, 0, {
      pair: 'GBP / USD',
      base: 'GBP',
      quote: 'USD',
      mid: formatRate(1 / gbp, 'USD'),
      change: pctChange(1 / gbp, previous?.rates?.GBP ? 1 / previous.rates.GBP : null),
      raw: 1 / gbp
    });
  }

  return {
    rates,
    asOf: latest.date || null,
    source: 'European Central Bank (Frankfurter)'
  };
}

module.exports = { getTopMarketRates, TOP_QUOTES };