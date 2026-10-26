'use strict';

/**
 * Bank logo resolution for every bank in the directory.
 * 1) Known domain → Clearbit logo
 * 2) Else → generated branded avatar from bank name (covers ALL banks)
 * Country flags via flagcdn.
 */

const BANK_DOMAINS = {
  // Nigeria
  GTB: 'gtbank.com', ACCESS: 'accessbankplc.com', ZENITH: 'zenithbank.com',
  FIRSTBANK: 'firstbanknigeria.com', UBA: 'ubagroup.com', FCMB: 'fcmb.com',
  STANBIC: 'stanbicibtcbank.com', UNION: 'unionbankng.com', FIDELITY: 'fidelitybank.ng',
  STERLING: 'sterling.ng', WEMA: 'wemabank.com', POLARIS: 'polarisbanklimited.com',
  KEYSTONE: 'keystonebankng.com', UNITY: 'unitybankng.com', PROVIDUS: 'providusbank.com',
  JAIZ: 'jaizbankplc.com', SUNTRUST: 'suntrustng.com', CITI_NG: 'citigroup.com',
  HSBC_NG: 'hsbc.com', KUDA: 'kuda.com', OPAY: 'opayweb.com', PALMPAY: 'palmpay.com',
  MONIEPOINT: 'moniepoint.com',
  // Ghana
  GCB: 'gcbbank.com.gh', EBG: 'ecobank.com', STANBIC_GH: 'stanbic.com.gh',
  ABSA_GH: 'absa.com.gh', CAL: 'calbank.net', FIDELITY_GH: 'fidelitybank.com.gh',
  UMB: 'umbcapital.com', ADB: 'agricbank.com', NIB: 'nib-ghana.com',
  ZENITH_GH: 'zenithbank.com.gh', ACCESS_GH: 'ghana.accessbankplc.com', GTB_GH: 'gtbghana.com',
  // Kenya
  KCB: 'kcbgroup.com', EQUITY: 'equitybankgroup.com', COOP_KE: 'co-opbank.co.ke',
  ABSA_KE: 'absa.co.ke', STANBIC_KE: 'stanbicbank.co.ke', NCBA: 'ncbagroup.com',
  DTB: 'dtbafrica.com', I_M: 'imbank.com', SCB_KE: 'sc.com', FAMILY: 'familybank.co.ke',
  MPESA: 'safaricom.co.ke',
  // South Africa
  FNB: 'fnb.co.za', ABSA_ZA: 'absa.co.za', STD_ZA: 'standardbank.co.za',
  NEDBANK: 'nedbank.co.za', CAPITEC: 'capitecbank.co.za', INVESTEC: 'investec.com',
  TYME: 'tymebank.co.za', DISCOVERY: 'discovery.co.za',
  // Egypt
  NBE: 'nbe.com.eg', BANQUE_MISR: 'banquemisr.com', CIB: 'cibeg.com',
  QNB_EG: 'qnbalahli.com', ADIB: 'adib.eg', HSBC_EG: 'hsbc.com.eg',
  // UK
  BARCLAYS: 'barclays.co.uk', HSBC_UK: 'hsbc.co.uk', LLOYDS: 'lloydsbank.com',
  NATWEST: 'natwest.com', SANTANDER_UK: 'santander.co.uk', RBS: 'rbs.co.uk',
  HALIFAX: 'halifax.co.uk', MONZO: 'monzo.com', STARLING: 'starlingbank.com',
  REVOLUT_UK: 'revolut.com', CHASE_UK: 'chase.co.uk',
  // US
  CHASE: 'chase.com', BOA: 'bankofamerica.com', WELLS: 'wellsfargo.com',
  CITI: 'citi.com', USBANK: 'usbank.com', PNC: 'pnc.com', TD_US: 'td.com',
  CAPITAL_ONE: 'capitalone.com', SCHWAB: 'schwab.com', ALLY: 'ally.com',
  // Canada
  RBC: 'rbcroyalbank.com', TD_CA: 'td.com', SCOTIABANK: 'scotiabank.com',
  BMO: 'bmo.com', CIBC: 'cibc.com', NATIONAL_CA: 'nbc.ca', TANGERINE: 'tangerine.ca',
  // UAE / SA
  ENBD: 'emiratesnbd.com', FAB: 'bankfab.com', ADCB: 'adcb.com', DIB: 'dib.ae',
  MASHREQ: 'mashreqbank.com', HSBC_UAE: 'hsbc.ae', SCB_UAE: 'sc.com',
  ALRAJHI: 'alrajhibank.com.sa', SNB: 'alahli.com', RIYAD: 'riyadbank.com',
  SABB: 'sabb.com', ALINMA: 'alinma.com', ANB: 'anb.com.sa',
  // India
  SBI: 'sbi.co.in', HDFC: 'hdfcbank.com', ICICI: 'icicibank.com', AXIS: 'axisbank.com',
  KOTAK: 'kotak.com', PNB_IN: 'pnbindia.in', BOB: 'bankofbaroda.in',
  // France / Germany / NL / IE
  BNP: 'bnpparibas.com', SG: 'societegenerale.com', CA_FR: 'credit-agricole.com',
  BPCE: 'bpce.fr', LCL: 'lcl.fr', BOURSORAMA: 'boursorama.com',
  DB: 'db.com', COMMERZBANK: 'commerzbank.com', DKB: 'dkb.de', N26: 'n26.com',
  SPARKASSE: 'sparkasse.de', VOLKSBANK: 'volksbank.de',
  ING_NL: 'ing.nl', RABOBANK: 'rabobank.nl', ABN: 'abnamro.nl', SNS: 'snsbank.nl', BUNQ: 'bunq.com',
  AIB: 'aib.ie', BOI: 'bankofireland.com', ULSTER: 'ulsterbank.com', PTSB: 'permanenttsb.ie',
  REVOLUT_IE: 'revolut.com',
  // Australia / Brazil / Mexico
  CBA: 'commbank.com.au', WESTPAC: 'westpac.com.au', NAB: 'nab.com.au', ANZ: 'anz.com',
  MACQUARIE: 'macquarie.com', BENDIGO: 'bendigobank.com.au',
  ITAU: 'itau.com.br', BRADESCO: 'bradesco.com.br', BB: 'bb.com.br',
  SANTANDER_BR: 'santander.com.br', NUBANK: 'nubank.com.br', CAIXA: 'caixa.gov.br',
  BBVA_MX: 'bbva.mx', BANORTE: 'banorte.com', SANTANDER_MX: 'santander.com.mx',
  HSBC_MX: 'hsbc.com.mx', BANAMEX: 'banamex.com', AZTECA: 'bancoazteca.com.mx',
  // China / Japan / Singapore / Korea
  ICBC: 'icbc.com.cn', CCB: 'ccb.com', ABC: 'abchina.com', BOC: 'boc.cn', BOCOM: 'bankcomm.com',
  MUFG: 'mufg.jp', SMBC: 'smbc.co.jp', MIZUHO: 'mizuhobank.com', JAPAN_POST: 'jp-bank.japanpost.jp',
  RAKUTEN: 'rakuten-bank.co.jp',
  DBS: 'dbs.com', OCBC: 'ocbc.com', UOB: 'uob.com.sg', SCB_SG: 'sc.com', CITI_SG: 'citibank.com.sg',
  KB: 'kbfg.com', SHINHAN: 'shinhan.com', WOORI: 'wooribank.com', HANA: 'kebhana.com', NH: 'nonghyup.com',
  // Pakistan / Bangladesh / others common
  HBL: 'hbl.com', UBL: 'ubldirect.com', MCB: 'mcb.com.pk', ABL: 'abl.com',
  BAFL: 'bankalfalah.com', MEEZAN: 'meezanbank.com',
  DBBL: 'dutchbanglabank.com', BRAC: 'bracbank.com', CITY_BD: 'citybankplc.com',
  ISLAMI: 'islamibankbd.com', EBL: 'ebl.com.bd',
  // East Africa / West Africa regional
  CRDB: 'crdbbank.co.tz', NMB: 'nmbbank.co.tz', EQUITY_TZ: 'equitybank.co.tz',
  STANBIC_TZ: 'stanbicbank.co.tz', NBC: 'nbctz.com', TPB: 'tpbbank.co.tz',
  STANBIC_UG: 'stanbicbank.co.ug', CENTENARY: 'centenarybank.co.ug', DFCU: 'dfcugroup.com',
  ABSA_UG: 'absa.co.ug', EQUITY_UG: 'equitybank.co.ug', KCB_UG: 'kcbgroup.com',
  BK: 'bk.rw', EQUITY_RW: 'equitybank.co.rw', GT_RW: 'gtbank.com', I_M_RW: 'imbank.com',
  COGEBANQUE: 'cogebanque.co.rw',
  ECOBANK_CM: 'ecobank.com', ECOBANK_CI: 'ecobank.com', ECOBANK_SN: 'ecobank.com',
  ECOBANK_GH: 'ecobank.com', BOA_CI: 'bankofafrica.ci', BOA_SN: 'bankofafrica.sn',
  // Europe majors
  SANTANDER_ES: 'santander.com', BBVA_ES: 'bbva.com', CAIXABANK: 'caixabank.com',
  SABADELL: 'bancsabadell.com', BANKINTER: 'bankinter.com',
  INTESA: 'intesasanpaolo.com', UNICREDIT_IT: 'unicredit.it', MPS: 'mps.it',
  PKO: 'pkobp.pl', PEKAO: 'pekao.com.pl', MBANK: 'mbank.pl', ING_PL: 'ing.pl',
  DANSKE: 'danskebank.com', NORDEA_DK: 'nordea.com', DNB: 'dnb.no',
  SWEDBANK_SE: 'swedbank.se', SEB_SE: 'seb.se', HANDELSBANKEN: 'handelsbanken.com',
  UBS: 'ubs.com', CS: 'credit-suisse.com', RAIFFEISEN_CH: 'raiffeisen.ch',
  // Turkey / others
  ZIRAAT: 'ziraatbank.com.tr', ISBANK: 'isbank.com.tr', GARANTI: 'garantibbva.com.tr',
  AKBANK: 'akbank.com', YAPI_KREDI: 'yapikredi.com.tr', HALKBANK: 'halkbank.com.tr',
  // Generic fallbacks still get avatars
  LOCAL_BANK: null, INTERNATIONAL: null, FINTECH: null
};

const AVATAR_COLORS = [
  '102238', '1B3A5C', '0F3D2E', '3D2A1A', '2C1F4A',
  '1A4A6B', '4A2C0F', '0F4A4A', '3A1F3A', '2A3A1F'
];

function hashString(str) {
  let h = 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function initialsFromName(name, code) {
  const src = String(name || code || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  }
  return src.slice(0, 2).toUpperCase();
}

function avatarUrl(name, code) {
  const label = initialsFromName(name, code);
  const bg = AVATAR_COLORS[hashString(code || name) % AVATAR_COLORS.length];
  const q = new URLSearchParams({
    name: label,
    background: bg,
    color: 'F5E6C8',
    size: '128',
    bold: 'true',
    format: 'png',
    rounded: 'false'
  });
  return `https://ui-avatars.com/api/?${q.toString()}`;
}

function logoUrlForBank(code, name) {
  const key = String(code || '').toUpperCase();
  const domain = BANK_DOMAINS[key];
  if (domain) {
    return `https://logo.clearbit.com/${domain}`;
  }
  // Every unmapped bank still gets a stable branded logo
  return avatarUrl(name || key, key);
}

/** Prefer Clearbit; client falls back to avatar on error via data-avatar-url */
function primaryAndFallbackLogo(code, name) {
  const key = String(code || '').toUpperCase();
  const domain = BANK_DOMAINS[key];
  const fallback = avatarUrl(name || key, key);
  if (domain) {
    return {
      logoUrl: `https://logo.clearbit.com/${domain}`,
      avatarUrl: fallback
    };
  }
  return { logoUrl: fallback, avatarUrl: fallback };
}

function flagUrlForCountry(countryCode, size = 40) {
  const cc = String(countryCode || '').toLowerCase();
  if (!/^[a-z]{2}$/.test(cc)) return null;
  return `https://flagcdn.com/w${size}/${cc}.png`;
}

function enrichBanks(banks, countryCode) {
  const list = Array.isArray(banks) ? banks : [];
  const flag = flagUrlForCountry(countryCode, 80);
  return list.map((b) => {
    const logos = primaryAndFallbackLogo(b.code, b.name);
    return {
      code: b.code,
      name: b.name,
      logoUrl: logos.logoUrl,
      avatarUrl: logos.avatarUrl,
      flagUrl: flag,
      initials: initialsFromName(b.name, b.code)
    };
  });
}

module.exports = {
  BANK_DOMAINS,
  logoUrlForBank,
  flagUrlForCountry,
  enrichBanks,
  avatarUrl,
  primaryAndFallbackLogo
};