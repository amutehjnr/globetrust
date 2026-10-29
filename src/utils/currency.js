'use strict';

/**
 * Profile-country → display currency (ISO 4217 + symbol).
 * Used across dashboard, transfers, deposits, limits, etc.
 */

const COUNTRY_CURRENCY = {
  US: { code: 'USD', symbol: '$', name: 'US Dollar' },
  GB: { code: 'GBP', symbol: '£', name: 'Pound Sterling' },
  NG: { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  EU: { code: 'EUR', symbol: '€', name: 'Euro' },
  AT: { code: 'EUR', symbol: '€', name: 'Euro' },
  BE: { code: 'EUR', symbol: '€', name: 'Euro' },
  CY: { code: 'EUR', symbol: '€', name: 'Euro' },
  DE: { code: 'EUR', symbol: '€', name: 'Euro' },
  EE: { code: 'EUR', symbol: '€', name: 'Euro' },
  ES: { code: 'EUR', symbol: '€', name: 'Euro' },
  FI: { code: 'EUR', symbol: '€', name: 'Euro' },
  FR: { code: 'EUR', symbol: '€', name: 'Euro' },
  GR: { code: 'EUR', symbol: '€', name: 'Euro' },
  IE: { code: 'EUR', symbol: '€', name: 'Euro' },
  IT: { code: 'EUR', symbol: '€', name: 'Euro' },
  LT: { code: 'EUR', symbol: '€', name: 'Euro' },
  LU: { code: 'EUR', symbol: '€', name: 'Euro' },
  LV: { code: 'EUR', symbol: '€', name: 'Euro' },
  MT: { code: 'EUR', symbol: '€', name: 'Euro' },
  NL: { code: 'EUR', symbol: '€', name: 'Euro' },
  PT: { code: 'EUR', symbol: '€', name: 'Euro' },
  SI: { code: 'EUR', symbol: '€', name: 'Euro' },
  SK: { code: 'EUR', symbol: '€', name: 'Euro' },
  CA: { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  AU: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  NZ: { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  JP: { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  CN: { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  HK: { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  SG: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  IN: { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  PK: { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee' },
  BD: { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka' },
  GH: { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi' },
  KE: { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  ZA: { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  EG: { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound' },
  AE: { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  SA: { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
  QA: { code: 'QAR', symbol: '﷼', name: 'Qatari Riyal' },
  KW: { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar' },
  BH: { code: 'BHD', symbol: 'BD', name: 'Bahraini Dinar' },
  TR: { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  RU: { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
  BR: { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  MX: { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  AR: { code: 'ARS', symbol: 'AR$', name: 'Argentine Peso' },
  CL: { code: 'CLP', symbol: 'CL$', name: 'Chilean Peso' },
  CO: { code: 'COP', symbol: 'CO$', name: 'Colombian Peso' },
  PE: { code: 'PEN', symbol: 'S/', name: 'Peruvian Sol' },
  CH: { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  SE: { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  NO: { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  DK: { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  PL: { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
  CZ: { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
  HU: { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint' },
  RO: { code: 'RON', symbol: 'lei', name: 'Romanian Leu' },
  UA: { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia' },
  IL: { code: 'ILS', symbol: '₪', name: 'Israeli Shekel' },
  KR: { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  TH: { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  VN: { code: 'VND', symbol: '₫', name: 'Vietnamese Dong' },
  ID: { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  MY: { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  PH: { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  TW: { code: 'TWD', symbol: 'NT$', name: 'New Taiwan Dollar' },
  TZ: { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling' },
  UG: { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling' },
  RW: { code: 'RWF', symbol: 'FRw', name: 'Rwandan Franc' },
  ET: { code: 'ETB', symbol: 'Br', name: 'Ethiopian Birr' },
  MA: { code: 'MAD', symbol: 'MAD', name: 'Moroccan Dirham' },
  SN: { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc' },
  CI: { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc' },
  BJ: { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc' },
  TG: { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc' },
  BF: { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc' },
  ML: { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc' },
  NE: { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc' },
  CM: { code: 'XAF', symbol: 'FCFA', name: 'Central African CFA Franc' },
  GA: { code: 'XAF', symbol: 'FCFA', name: 'Central African CFA Franc' },
  CD: { code: 'CDF', symbol: 'FC', name: 'Congolese Franc' },
  ZM: { code: 'ZMW', symbol: 'ZK', name: 'Zambian Kwacha' },
  ZW: { code: 'USD', symbol: '$', name: 'US Dollar' },
  JM: { code: 'JMD', symbol: 'J$', name: 'Jamaican Dollar' },
  TT: { code: 'TTD', symbol: 'TT$', name: 'Trinidad and Tobago Dollar' },
  BB: { code: 'BBD', symbol: 'Bds$', name: 'Barbadian Dollar' }
};

const CODE_SYMBOL = {};
Object.values(COUNTRY_CURRENCY).forEach((c) => {
  if (!CODE_SYMBOL[c.code]) CODE_SYMBOL[c.code] = c.symbol;
});
// extras
CODE_SYMBOL.USD = CODE_SYMBOL.USD || '$';
CODE_SYMBOL.EUR = CODE_SYMBOL.EUR || '€';
CODE_SYMBOL.GBP = CODE_SYMBOL.GBP || '£';
CODE_SYMBOL.NGN = CODE_SYMBOL.NGN || '₦';

function currencyForCountry(countryCode) {
  const cc = String(countryCode || '').trim().toUpperCase();
  if (cc && COUNTRY_CURRENCY[cc]) return { ...COUNTRY_CURRENCY[cc] };
  return { code: 'USD', symbol: '$', name: 'US Dollar' };
}

function symbolForCurrency(code) {
  const c = String(code || '').toUpperCase();
  return CODE_SYMBOL[c] || c || '$';
}

function formatMoney(val, currencyCode, locale) {
  if (val == null || val === '') return '—';
  const s = String(val);
  if (/[$€£¥₦₹₩]/.test(s) && /[0-9]/.test(s) && s.trim().length > 1) {
    // already formatted with a symbol — leave unless pure number preferred
  }
  let num = Number(String(s).replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(num)) return s;
  const code = String(currencyCode || 'USD').toUpperCase();
  const sym = symbolForCurrency(code);
  try {
    return new Intl.NumberFormat(locale || 'en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  } catch (_) {
    return (
      sym +
      num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    );
  }
}

module.exports = {
  COUNTRY_CURRENCY,
  currencyForCountry,
  symbolForCurrency,
  formatMoney
};