'use strict';

const { COUNTRIES, countryName } = require('./countries');

/**
 * Specific major banks by ISO country code.
 * Every country in COUNTRIES is covered: known lists below, others get
 * country-named commercial options so none are excluded from the directory.
 */
const SPECIFIC_BANKS = {
  AF: [
    { code: 'AIB_AF', name: 'Afghanistan International Bank' },
    { code: 'AZIZI', name: 'Azizi Bank' },
    { code: 'NBA', name: 'New Kabul Bank' }
  ],
  AL: [
    { code: 'RAIFFEISEN_AL', name: 'Raiffeisen Bank Albania' },
    { code: 'BKT', name: 'Banka Kombëtare Tregtare' },
    { code: 'CREDINS', name: 'Credins Bank' }
  ],
  DZ: [
    { code: 'BEA', name: 'Banque Extérieure d\'Algérie' },
    { code: 'BNA', name: 'Banque Nationale d\'Algérie' },
    { code: 'CPA', name: 'Crédit Populaire d\'Algérie' },
    { code: 'BDL', name: 'Banque de Développement Local' }
  ],
  AD: [
    { code: 'ANDA', name: 'Andbank' },
    { code: 'CREDIT_AND', name: 'Crédit Andorrà' },
    { code: 'MORA', name: 'MoraBanc' }
  ],
  AO: [
    { code: 'BFA', name: 'Banco de Fomento Angola' },
    { code: 'BAI', name: 'Banco Angolano de Investimentos' },
    { code: 'BPC', name: 'Banco de Poupança e Crédito' },
    { code: 'ATLANTICO', name: 'Banco Atlântico' }
  ],
  AG: [
    { code: 'ECAB', name: 'Eastern Caribbean Amalgamated Bank' },
    { code: 'CIBC_FCIB', name: 'CIBC FirstCaribbean' },
    { code: 'RBC_AG', name: 'RBC Royal Bank' }
  ],
  AR: [
    { code: 'NACION', name: 'Banco Nación' },
    { code: 'GALICIA', name: 'Banco Galicia' },
    { code: 'SANTANDER_AR', name: 'Santander Río' },
    { code: 'BBVA_AR', name: 'BBVA Argentina' },
    { code: 'MACRO', name: 'Banco Macro' },
    { code: 'HSBC_AR', name: 'HSBC Argentina' }
  ],
  AM: [
    { code: 'AMERIABANK', name: 'Ameriabank' },
    { code: 'ACBA', name: 'ACBA Bank' },
    { code: 'INECOBANK', name: 'Inecobank' },
    { code: 'ARDSHIN', name: 'Ardshinbank' }
  ],
  AU: [
    { code: 'CBA', name: 'Commonwealth Bank' },
    { code: 'WESTPAC', name: 'Westpac' },
    { code: 'NAB', name: 'NAB' },
    { code: 'ANZ', name: 'ANZ' },
    { code: 'MACQUARIE', name: 'Macquarie Bank' },
    { code: 'BENDIGO', name: 'Bendigo Bank' }
  ],
  AT: [
    { code: 'ERSTE_AT', name: 'Erste Bank' },
    { code: 'RAIFFEISEN_AT', name: 'Raiffeisen Bank Austria' },
    { code: 'BAWAG', name: 'BAWAG P.S.K.' },
    { code: 'UNICREDIT_AT', name: 'UniCredit Bank Austria' }
  ],
  AZ: [
    { code: 'KAPITAL', name: 'Kapital Bank' },
    { code: 'PASHA', name: 'Pasha Bank' },
    { code: 'ABB', name: 'ABB (International Bank of Azerbaijan)' }
  ],
  BS: [
    { code: 'CIBC_BS', name: 'CIBC FirstCaribbean Bahamas' },
    { code: 'RBC_BS', name: 'RBC Royal Bank Bahamas' },
    { code: 'SCOTIABANK_BS', name: 'Scotiabank Bahamas' }
  ],
  BH: [
    { code: 'NBB', name: 'National Bank of Bahrain' },
    { code: 'AUB', name: 'Ahli United Bank' },
    { code: 'BBK', name: 'Bank of Bahrain and Kuwait' },
    { code: 'AL_SALAM', name: 'Al Salam Bank' }
  ],
  BD: [
    { code: 'DBBL', name: 'Dutch-Bangla Bank' },
    { code: 'BRAC', name: 'BRAC Bank' },
    { code: 'CITY_BD', name: 'City Bank' },
    { code: 'ISLAMI', name: 'Islami Bank Bangladesh' },
    { code: 'EBL', name: 'Eastern Bank' }
  ],
  BB: [
    { code: 'RBC_BB', name: 'RBC Royal Bank Barbados' },
    { code: 'CIBC_BB', name: 'CIBC FirstCaribbean Barbados' },
    { code: 'REPUBLIC_BB', name: 'Republic Bank Barbados' }
  ],
  BY: [
    { code: 'BELARUSBANK', name: 'Belarusbank' },
    { code: 'BELAGRO', name: 'Belagroprombank' },
    { code: 'PRIORBANK', name: 'Priorbank' }
  ],
  BE: [
    { code: 'KBC', name: 'KBC Bank' },
    { code: 'BNP_BE', name: 'BNP Paribas Fortis' },
    { code: 'BELFUS', name: 'Belfius' },
    { code: 'ING_BE', name: 'ING Belgium' },
    { code: 'ARGENTA', name: 'Argenta' }
  ],
  BZ: [
    { code: 'BELIZE_BANK', name: 'Belize Bank' },
    { code: 'ATLANTIC_BZ', name: 'Atlantic Bank Belize' },
    { code: 'SCOTIABANK_BZ', name: 'Scotiabank Belize' }
  ],
  BJ: [
    { code: 'BOA_BJ', name: 'Bank of Africa Benin' },
    { code: 'ECOBANK_BJ', name: 'Ecobank Benin' },
    { code: 'ORABANK_BJ', name: 'Orabank Benin' }
  ],
  BT: [
    { code: 'BOB_BT', name: 'Bank of Bhutan' },
    { code: 'BNB', name: 'Bhutan National Bank' },
    { code: 'DRUK', name: 'Druk PNB Bank' }
  ],
  BO: [
    { code: 'BCP_BO', name: 'Banco de Crédito de Bolivia' },
    { code: 'BISA', name: 'Banco BISA' },
    { code: 'MERCANTIL_BO', name: 'Banco Mercantil Santa Cruz' },
    { code: 'UNION_BO', name: 'Banco Unión' }
  ],
  BA: [
    { code: 'RAIFFEISEN_BA', name: 'Raiffeisen Bank Bosnia' },
    { code: 'UNICREDIT_BA', name: 'UniCredit Bank Bosnia' },
    { code: 'SPARKASSE_BA', name: 'Sparkasse Bank' }
  ],
  BW: [
    { code: 'FNBB', name: 'First National Bank Botswana' },
    { code: 'STANBIC_BW', name: 'Stanbic Bank Botswana' },
    { code: 'ABSA_BW', name: 'Absa Bank Botswana' },
    { code: 'BARCLAYS_BW', name: 'Barclays Bank Botswana' }
  ],
  BR: [
    { code: 'ITAU', name: 'Itaú Unibanco' },
    { code: 'BRADESCO', name: 'Bradesco' },
    { code: 'BB', name: 'Banco do Brasil' },
    { code: 'SANTANDER_BR', name: 'Santander Brasil' },
    { code: 'NUBANK', name: 'Nubank' },
    { code: 'CAIXA', name: 'Caixa Econômica Federal' }
  ],
  BN: [
    { code: 'BIBD', name: 'Bank Islam Brunei Darussalam' },
    { code: 'BAIDURI', name: 'Baiduri Bank' },
    { code: 'SCB_BN', name: 'Standard Chartered Brunei' }
  ],
  BG: [
    { code: 'DSK', name: 'DSK Bank' },
    { code: 'UNICREDIT_BG', name: 'UniCredit Bulbank' },
    { code: 'UBB', name: 'United Bulgarian Bank' },
    { code: 'FIBANK', name: 'First Investment Bank' }
  ],
  BF: [
    { code: 'CORIS', name: 'Coris Bank International' },
    { code: 'BOA_BF', name: 'Bank of Africa Burkina Faso' },
    { code: 'ECOBANK_BF', name: 'Ecobank Burkina Faso' }
  ],
  BI: [
    { code: 'BANCOBU', name: 'Bancobu' },
    { code: 'BBCI', name: 'Banque Burundaise pour le Commerce' },
    { code: 'ECOBANK_BI', name: 'Ecobank Burundi' }
  ],
  CV: [
    { code: 'BCA', name: 'Banco Comercial do Atlântico' },
    { code: 'BIA', name: 'Banco Interatlântico' },
    { code: 'CECV', name: 'Caixa Económica de Cabo Verde' }
  ],
  KH: [
    { code: 'ABA', name: 'ABA Bank' },
    { code: 'ACLEDA', name: 'ACLEDA Bank' },
    { code: 'CANADIA', name: 'Canadia Bank' },
    { code: 'WING', name: 'Wing Bank' }
  ],
  CM: [
    { code: 'AFRILAND', name: 'Afriland First Bank' },
    { code: 'ECOBANK_CM', name: 'Ecobank Cameroon' },
    { code: 'SGBC', name: 'Société Générale Cameroun' },
    { code: 'UBA_CM', name: 'UBA Cameroon' }
  ],
  CA: [
    { code: 'RBC', name: 'RBC Royal Bank' },
    { code: 'TD_CA', name: 'TD Canada Trust' },
    { code: 'SCOTIABANK', name: 'Scotiabank' },
    { code: 'BMO', name: 'BMO Bank of Montreal' },
    { code: 'CIBC', name: 'CIBC' },
    { code: 'NATIONAL_CA', name: 'National Bank of Canada' },
    { code: 'TANGERINE', name: 'Tangerine' }
  ],
  CF: [
    { code: 'ECOBANK_CF', name: 'Ecobank Central African Republic' },
    { code: 'CBCA', name: 'Commercial Bank Centrafrique' }
  ],
  TD: [
    { code: 'ECOBANK_TD', name: 'Ecobank Chad' },
    { code: 'CBT', name: 'Commercial Bank Tchad' },
    { code: 'ORABANK_TD', name: 'Orabank Chad' }
  ],
  CL: [
    { code: 'CHILE', name: 'Banco de Chile' },
    { code: 'SANTANDER_CL', name: 'Santander Chile' },
    { code: 'BCI', name: 'Banco de Crédito e Inversiones' },
    { code: 'ESTADO', name: 'BancoEstado' },
    { code: 'ITAU_CL', name: 'Itaú Chile' }
  ],
  CN: [
    { code: 'ICBC', name: 'ICBC' },
    { code: 'CCB', name: 'China Construction Bank' },
    { code: 'ABC', name: 'Agricultural Bank of China' },
    { code: 'BOC', name: 'Bank of China' },
    { code: 'BOCOM', name: 'Bank of Communications' }
  ],
  CO: [
    { code: 'BANCOLOMBIA', name: 'Bancolombia' },
    { code: 'DAVIVIENDA', name: 'Davivienda' },
    { code: 'BBVA_CO', name: 'BBVA Colombia' },
    { code: 'BOGOTA', name: 'Banco de Bogotá' },
    { code: 'OCCIDENTE', name: 'Banco de Occidente' }
  ],
  KM: [
    { code: 'BIC', name: 'Banque pour l\'Industrie et le Commerce' },
    { code: 'SNPSF', name: 'SNPSF' }
  ],
  CG: [
    { code: 'BGFI_CG', name: 'BGFIBank Congo' },
    { code: 'ECOBANK_CG', name: 'Ecobank Congo' },
    { code: 'UCB', name: 'Union Congolaise de Banques' }
  ],
  CD: [
    { code: 'RAWBANK', name: 'Rawbank' },
    { code: 'EQUITY_CD', name: 'Equity BCDC' },
    { code: 'TMB', name: 'Trust Merchant Bank' },
    { code: 'SOFIBANQUE', name: 'Sofibanque' }
  ],
  CR: [
    { code: 'BNCR', name: 'Banco Nacional de Costa Rica' },
    { code: 'BCR', name: 'Banco de Costa Rica' },
    { code: 'BAC_CR', name: 'BAC Credomatic' },
    { code: 'SCOTIABANK_CR', name: 'Scotiabank Costa Rica' }
  ],
  CI: [
    { code: 'NSIA', name: 'NSIA Banque' },
    { code: 'SGBCI', name: 'Société Générale Côte d\'Ivoire' },
    { code: 'ECOBANK_CI', name: 'Ecobank Côte d\'Ivoire' },
    { code: 'BOA_CI', name: 'Bank of Africa Côte d\'Ivoire' },
    { code: 'BICICI', name: 'BICICI' }
  ],
  HR: [
    { code: 'ZABA', name: 'Zagrebačka banka' },
    { code: 'PBZ', name: 'Privredna banka Zagreb' },
    { code: 'ERSTE_HR', name: 'Erste Bank Croatia' },
    { code: 'RBA_HR', name: 'Raiffeisen Bank Croatia' }
  ],
  CU: [
    { code: 'BANMET', name: 'Banco Metropolitano' },
    { code: 'BPA', name: 'Banco Popular de Ahorro' },
    { code: 'BANDES', name: 'Banco de Desarrollo Económico' }
  ],
  CY: [
    { code: 'BOC_CY', name: 'Bank of Cyprus' },
    { code: 'HELLENIC', name: 'Hellenic Bank' },
    { code: 'EUROBANK_CY', name: 'Eurobank Cyprus' }
  ],
  CZ: [
    { code: 'CSAS', name: 'Česká spořitelna' },
    { code: 'CSOB', name: 'ČSOB' },
    { code: 'KB', name: 'Komerční banka' },
    { code: 'MONETA', name: 'Moneta Money Bank' }
  ],
  DK: [
    { code: 'DANSKE', name: 'Danske Bank' },
    { code: 'NORDEA_DK', name: 'Nordea Denmark' },
    { code: 'JYSK', name: 'Jyske Bank' },
    { code: 'SYDBANK', name: 'Sydbank' }
  ],
  DJ: [
    { code: 'BCIMR', name: 'Banque pour le Commerce et l\'Industrie' },
    { code: 'CAC', name: 'CAC International Bank' },
    { code: 'SABA', name: 'Salaam African Bank' }
  ],
  DM: [
    { code: 'NBD', name: 'National Bank of Dominica' },
    { code: 'CIBC_DM', name: 'CIBC FirstCaribbean Dominica' }
  ],
  DO: [
    { code: 'POPULAR_DO', name: 'Banco Popular Dominicano' },
    { code: 'RESERVAS', name: 'Banreservas' },
    { code: 'BHD', name: 'Banco BHD' },
    { code: 'SCOTIABANK_DO', name: 'Scotiabank República Dominicana' }
  ],
  EC: [
    { code: 'PICHINCHA', name: 'Banco Pichincha' },
    { code: 'GUAYAQUIL', name: 'Banco de Guayaquil' },
    { code: 'PACIFICO', name: 'Banco del Pacífico' },
    { code: 'PRODUBANCO', name: 'Produbanco' }
  ],
  EG: [
    { code: 'NBE', name: 'National Bank of Egypt' },
    { code: 'BANQUE_MISR', name: 'Banque Misr' },
    { code: 'CIB', name: 'Commercial International Bank' },
    { code: 'QNB_EG', name: 'QNB Alahli' },
    { code: 'ADIB', name: 'Abu Dhabi Islamic Bank Egypt' },
    { code: 'HSBC_EG', name: 'HSBC Egypt' }
  ],
  SV: [
    { code: 'AGRICOLA', name: 'Banco Agrícola' },
    { code: 'CUSCATLAN', name: 'Banco Cuscatlán' },
    { code: 'DAVIVIENDA_SV', name: 'Davivienda El Salvador' },
    { code: 'BAC_SV', name: 'BAC Credomatic El Salvador' }
  ],
  GQ: [
    { code: 'BGBGE', name: 'BGFIBank Guinée Équatoriale' },
    { code: 'CCEI', name: 'CCEI Bank' }
  ],
  ER: [
    { code: 'HCB', name: 'Housing and Commerce Bank of Eritrea' },
    { code: 'CBE_ER', name: 'Commercial Bank of Eritrea' }
  ],
  EE: [
    { code: 'SWEDBANK_EE', name: 'Swedbank Estonia' },
    { code: 'SEB_EE', name: 'SEB Estonia' },
    { code: 'LHV', name: 'LHV Pank' },
    { code: 'LUMINOR_EE', name: 'Luminor Estonia' }
  ],
  SZ: [
    { code: 'FNB_SZ', name: 'First National Bank Eswatini' },
    { code: 'NEDBANK_SZ', name: 'Nedbank Eswatini' },
    { code: 'STANDARD_SZ', name: 'Standard Bank Eswatini' }
  ],
  ET: [
    { code: 'CBE', name: 'Commercial Bank of Ethiopia' },
    { code: 'AWASH', name: 'Awash Bank' },
    { code: 'DASHEN', name: 'Dashen Bank' },
    { code: 'ABYSSINIA', name: 'Bank of Abyssinia' },
    { code: 'COOP_ET', name: 'Cooperative Bank of Oromia' }
  ],
  FJ: [
    { code: 'ANZ_FJ', name: 'ANZ Fiji' },
    { code: 'BSP_FJ', name: 'Bank of South Pacific Fiji' },
    { code: 'HFC_FJ', name: 'HFC Bank Fiji' }
  ],
  FI: [
    { code: 'NORDEA_FI', name: 'Nordea Finland' },
    { code: 'OP', name: 'OP Financial Group' },
    { code: 'DANSKE_FI', name: 'Danske Bank Finland' },
    { code: 'S_PANKKI', name: 'S-Pankki' }
  ],
  FR: [
    { code: 'BNP', name: 'BNP Paribas' },
    { code: 'SG', name: 'Société Générale' },
    { code: 'CA_FR', name: 'Crédit Agricole' },
    { code: 'BPCE', name: 'Banque Populaire / BPCE' },
    { code: 'LCL', name: 'LCL' },
    { code: 'BOURSORAMA', name: 'Boursorama' }
  ],
  GA: [
    { code: 'BGFI_GA', name: 'BGFIBank Gabon' },
    { code: 'UGBA', name: 'Union Gabonaise de Banque' },
    { code: 'ECOBANK_GA', name: 'Ecobank Gabon' }
  ],
  GM: [
    { code: 'TRUST_GM', name: 'Trust Bank Gambia' },
    { code: 'GTBANK_GM', name: 'Guaranty Trust Bank Gambia' },
    { code: 'ECOBANK_GM', name: 'Ecobank Gambia' }
  ],
  GE: [
    { code: 'TBC', name: 'TBC Bank' },
    { code: 'BOG', name: 'Bank of Georgia' },
    { code: 'LIBERTY', name: 'Liberty Bank' }
  ],
  DE: [
    { code: 'DB', name: 'Deutsche Bank' },
    { code: 'COMMERZBANK', name: 'Commerzbank' },
    { code: 'DKB', name: 'DKB' },
    { code: 'N26', name: 'N26' },
    { code: 'SPARKASSE', name: 'Sparkasse' },
    { code: 'VOLKSBANK', name: 'Volksbank' }
  ],
  GH: [
    { code: 'GCB', name: 'GCB Bank' },
    { code: 'EBG', name: 'Ecobank Ghana' },
    { code: 'STANBIC_GH', name: 'Stanbic Bank Ghana' },
    { code: 'ABSA_GH', name: 'Absa Bank Ghana' },
    { code: 'CAL', name: 'CalBank' },
    { code: 'FIDELITY_GH', name: 'Fidelity Bank Ghana' },
    { code: 'UMB', name: 'Universal Merchant Bank' },
    { code: 'ADB', name: 'Agricultural Development Bank' },
    { code: 'ZENITH_GH', name: 'Zenith Bank Ghana' },
    { code: 'ACCESS_GH', name: 'Access Bank Ghana' },
    { code: 'GTB_GH', name: 'Guaranty Trust Bank Ghana' }
  ],
  GR: [
    { code: 'NBG', name: 'National Bank of Greece' },
    { code: 'EUROBANK', name: 'Eurobank' },
    { code: 'ALPHA', name: 'Alpha Bank' },
    { code: 'PIRAEUS', name: 'Piraeus Bank' }
  ],
  GD: [
    { code: 'RBC_GD', name: 'RBC Royal Bank Grenada' },
    { code: 'CIBC_GD', name: 'CIBC FirstCaribbean Grenada' },
    { code: 'REPUBLIC_GD', name: 'Republic Bank Grenada' }
  ],
  GT: [
    { code: 'INDUSTRIAL', name: 'Banco Industrial' },
    { code: 'GYT', name: 'Banco G&T Continental' },
    { code: 'BAM', name: 'Banco Agromercantil' },
    { code: 'BANRURAL', name: 'Banrural' }
  ],
  GN: [
    { code: 'BICIGUI', name: 'BICIGUI' },
    { code: 'ECOBANK_GN', name: 'Ecobank Guinea' },
    { code: 'UBA_GN', name: 'UBA Guinea' }
  ],
  GW: [
    { code: 'BAO', name: 'Banco da África Ocidental' },
    { code: 'ORABANK_GW', name: 'Orabank Guinea-Bissau' }
  ],
  GY: [
    { code: 'GNB', name: 'Guyana Bank for Trade and Industry' },
    { code: 'REPUBLIC_GY', name: 'Republic Bank Guyana' },
    { code: 'DEMERA', name: 'Demerara Bank' }
  ],
  HT: [
    { code: 'Sogebank', name: 'Sogebank' },
    { code: 'UNIBANK_HT', name: 'Unibank Haiti' },
    { code: 'BNC', name: 'Banque Nationale de Crédit' }
  ],
  HN: [
    { code: 'ATLANTIDA', name: 'Banco Atlántida' },
    { code: 'FICOHSA', name: 'Banco Ficohsa' },
    { code: 'BAC_HN', name: 'BAC Credomatic Honduras' },
    { code: 'BANPAIS', name: 'Banpaís' }
  ],
  HU: [
    { code: 'OTP', name: 'OTP Bank' },
    { code: 'ERSTE_HU', name: 'Erste Bank Hungary' },
    { code: 'K_H', name: 'K&H Bank' },
    { code: 'RAIFFEISEN_HU', name: 'Raiffeisen Bank Hungary' }
  ],
  IS: [
    { code: 'LANDSBANKINN', name: 'Landsbankinn' },
    { code: 'ISLANDSBANKI', name: 'Íslandsbanki' },
    { code: 'ARION', name: 'Arion Bank' }
  ],
  IN: [
    { code: 'SBI', name: 'State Bank of India' },
    { code: 'HDFC', name: 'HDFC Bank' },
    { code: 'ICICI', name: 'ICICI Bank' },
    { code: 'AXIS', name: 'Axis Bank' },
    { code: 'KOTAK', name: 'Kotak Mahindra Bank' },
    { code: 'PNB_IN', name: 'Punjab National Bank' },
    { code: 'BOB', name: 'Bank of Baroda' }
  ],
  ID: [
    { code: 'BCA_ID', name: 'Bank Central Asia' },
    { code: 'MANDIRI', name: 'Bank Mandiri' },
    { code: 'BRI', name: 'Bank Rakyat Indonesia' },
    { code: 'BNI', name: 'Bank Negara Indonesia' },
    { code: 'CIMB_ID', name: 'CIMB Niaga' }
  ],
  IR: [
    { code: 'MELLI', name: 'Bank Melli Iran' },
    { code: 'MELLAT', name: 'Bank Mellat' },
    { code: 'SADERAT', name: 'Bank Saderat Iran' },
    { code: 'TEJARAT', name: 'Bank Tejarat' }
  ],
  IQ: [
    { code: 'Rafidain', name: 'Rafidain Bank' },
    { code: 'Rasheed', name: 'Rasheed Bank' },
    { code: 'TBI', name: 'Trade Bank of Iraq' },
    { code: 'NBI', name: 'National Bank of Iraq' }
  ],
  IE: [
    { code: 'AIB', name: 'AIB' },
    { code: 'BOI', name: 'Bank of Ireland' },
    { code: 'ULSTER', name: 'Ulster Bank' },
    { code: 'PTSB', name: 'Permanent TSB' },
    { code: 'REVOLUT_IE', name: 'Revolut' }
  ],
  IL: [
    { code: 'HAPOALIM', name: 'Bank Hapoalim' },
    { code: 'LEUMI', name: 'Bank Leumi' },
    { code: 'DISCOUNT', name: 'Israel Discount Bank' },
    { code: 'MIZRAHI', name: 'Mizrahi Tefahot Bank' }
  ],
  IT: [
    { code: 'INTESA', name: 'Intesa Sanpaolo' },
    { code: 'UNICREDIT_IT', name: 'UniCredit' },
    { code: 'MPS', name: 'Monte dei Paschi di Siena' },
    { code: 'BPM', name: 'Banco BPM' },
    { code: 'BPER', name: 'BPER Banca' }
  ],
  JM: [
    { code: 'NCB', name: 'NCB Jamaica' },
    { code: 'SCOTIABANK_JM', name: 'Scotiabank Jamaica' },
    { code: 'SAGICOR', name: 'Sagicor Bank' },
    { code: 'JN', name: 'JN Bank' }
  ],
  JP: [
    { code: 'MUFG', name: 'MUFG Bank' },
    { code: 'SMBC', name: 'Sumitomo Mitsui Banking' },
    { code: 'MIZUHO', name: 'Mizuho Bank' },
    { code: 'JAPAN_POST', name: 'Japan Post Bank' },
    { code: 'RAKUTEN', name: 'Rakuten Bank' }
  ],
  JO: [
    { code: 'ARAB_BANK', name: 'Arab Bank' },
    { code: 'HOUSING_JO', name: 'Housing Bank' },
    { code: 'JORDAN_ISLAMIC', name: 'Jordan Islamic Bank' },
    { code: 'CAB', name: 'Cairo Amman Bank' }
  ],
  KZ: [
    { code: 'HALYK', name: 'Halyk Bank' },
    { code: 'KASPI', name: 'Kaspi Bank' },
    { code: 'FORTE', name: 'ForteBank' },
    { code: 'BCC', name: 'Bank CenterCredit' }
  ],
  KE: [
    { code: 'KCB', name: 'KCB Bank' },
    { code: 'EQUITY', name: 'Equity Bank' },
    { code: 'COOP_KE', name: 'Co-operative Bank of Kenya' },
    { code: 'ABSA_KE', name: 'Absa Bank Kenya' },
    { code: 'STANBIC_KE', name: 'Stanbic Bank Kenya' },
    { code: 'NCBA', name: 'NCBA Bank' },
    { code: 'DTB', name: 'Diamond Trust Bank' },
    { code: 'I_M', name: 'I&M Bank' },
    { code: 'SCB_KE', name: 'Standard Chartered Kenya' },
    { code: 'FAMILY', name: 'Family Bank' },
    { code: 'MPESA', name: 'M-Pesa (Safaricom)' }
  ],
  KI: [
    { code: 'ANZ_KI', name: 'ANZ Kiribati' },
    { code: 'BOK', name: 'Bank of Kiribati' }
  ],
  KW: [
    { code: 'NBK', name: 'National Bank of Kuwait' },
    { code: 'KFH', name: 'Kuwait Finance House' },
    { code: 'GBK', name: 'Gulf Bank' },
    { code: 'CBK', name: 'Commercial Bank of Kuwait' }
  ],
  KG: [
    { code: 'DEMIR', name: 'Demir Bank' },
    { code: 'OPTIMA', name: 'Optima Bank' },
    { code: 'AIYL', name: 'Aiyl Bank' }
  ],
  LA: [
    { code: 'BCEL', name: 'Banque pour le Commerce Extérieur Lao' },
    { code: 'LDB', name: 'Lao Development Bank' },
    { code: 'APB', name: 'Agricultural Promotion Bank' }
  ],
  LV: [
    { code: 'SWEDBANK_LV', name: 'Swedbank Latvia' },
    { code: 'SEB_LV', name: 'SEB Latvia' },
    { code: 'LUMINOR_LV', name: 'Luminor Latvia' },
    { code: 'CITADELE', name: 'Citadele Bank' }
  ],
  LB: [
    { code: 'BLOM', name: 'BLOM Bank' },
    { code: 'AUDI', name: 'Bank Audi' },
    { code: 'BYBLOS', name: 'Byblos Bank' },
    { code: 'FRANSABANK', name: 'Fransabank' }
  ],
  LS: [
    { code: 'STANDARD_LS', name: 'Standard Lesotho Bank' },
    { code: 'NEDBANK_LS', name: 'Nedbank Lesotho' },
    { code: 'FNB_LS', name: 'First National Bank Lesotho' }
  ],
  LR: [
    { code: 'LBDI', name: 'Liberia Bank for Development and Investment' },
    { code: 'ECOBANK_LR', name: 'Ecobank Liberia' },
    { code: 'GTBANK_LR', name: 'Guaranty Trust Bank Liberia' }
  ],
  LY: [
    { code: 'NCB_LY', name: 'National Commercial Bank Libya' },
    { code: 'JUMHOURIA', name: 'Jumhouria Bank' },
    { code: 'WAHDA', name: 'Wahda Bank' }
  ],
  LI: [
    { code: 'LLB', name: 'Liechtensteinische Landesbank' },
    { code: 'VP', name: 'VP Bank' },
    { code: 'LGT', name: 'LGT Bank' }
  ],
  LT: [
    { code: 'SWEDBANK_LT', name: 'Swedbank Lithuania' },
    { code: 'SEB_LT', name: 'SEB Lithuania' },
    { code: 'LUMINOR_LT', name: 'Luminor Lithuania' },
    { code: 'SIAULIU', name: 'Šiaulių bankas' }
  ],
  LU: [
    { code: 'BCEE', name: 'Banque et Caisse d\'Épargne de l\'État' },
    { code: 'BIL', name: 'Banque Internationale à Luxembourg' },
    { code: 'BGL', name: 'BGL BNP Paribas' },
    { code: 'ING_LU', name: 'ING Luxembourg' }
  ],
  MG: [
    { code: 'BFV', name: 'Bank of Africa Madagascar' },
    { code: 'BNI_MG', name: 'BNI Madagascar' },
    { code: 'BOA_MG', name: 'BOA Madagascar' }
  ],
  MW: [
    { code: 'NBM', name: 'National Bank of Malawi' },
    { code: 'STANDARD_MW', name: 'Standard Bank Malawi' },
    { code: 'FDH', name: 'FDH Bank' },
    { code: 'NBS', name: 'NBS Bank' }
  ],
  MY: [
    { code: 'MAYBANK', name: 'Maybank' },
    { code: 'CIMB_MY', name: 'CIMB Bank' },
    { code: 'PUBLIC', name: 'Public Bank' },
    { code: 'RHB', name: 'RHB Bank' },
    { code: 'HONG_LEONG', name: 'Hong Leong Bank' }
  ],
  MV: [
    { code: 'BML', name: 'Bank of Maldives' },
    { code: 'MIB', name: 'Maldives Islamic Bank' },
    { code: 'HBL_MV', name: 'Habib Bank Maldives' }
  ],
  ML: [
    { code: 'BIM', name: 'Banque Internationale pour le Mali' },
    { code: 'BOA_ML', name: 'Bank of Africa Mali' },
    { code: 'ECOBANK_ML', name: 'Ecobank Mali' }
  ],
  MT: [
    { code: 'BOV', name: 'Bank of Valletta' },
    { code: 'HSBC_MT', name: 'HSBC Malta' },
    { code: 'APS', name: 'APS Bank' },
    { code: 'MEDIRECT', name: 'MeDirect Bank' }
  ],
  MH: [
    { code: 'BOMI', name: 'Bank of the Marshall Islands' },
    { code: 'BOM', name: 'Bank of Guam (Marshall Islands)' }
  ],
  MR: [
    { code: 'GBM', name: 'Générale de Banque de Mauritanie' },
    { code: 'BNM', name: 'Banque Nationale de Mauritanie' },
    { code: 'BEA_MR', name: 'Banque El Amana' }
  ],
  MU: [
    { code: 'MCB_MU', name: 'Mauritius Commercial Bank' },
    { code: 'SBM', name: 'SBM Bank' },
    { code: 'ABSA_MU', name: 'Absa Bank Mauritius' },
    { code: 'HSBC_MU', name: 'HSBC Mauritius' }
  ],
  MX: [
    { code: 'BBVA_MX', name: 'BBVA México' },
    { code: 'BANORTE', name: 'Banorte' },
    { code: 'SANTANDER_MX', name: 'Santander México' },
    { code: 'HSBC_MX', name: 'HSBC México' },
    { code: 'BANAMEX', name: 'Citibanamex' },
    { code: 'AZTECA', name: 'Banco Azteca' }
  ],
  FM: [
    { code: 'BOG_FM', name: 'Bank of Guam (Micronesia)' },
    { code: 'BOMI_FM', name: 'Bank of the Federated States of Micronesia' }
  ],
  MD: [
    { code: 'MAIB', name: 'Moldova Agroindbank' },
    { code: 'MICB', name: 'Moldindconbank' },
    { code: 'VICTORIABANK', name: 'Victoriabank' }
  ],
  MC: [
    { code: 'CFM', name: 'Compagnie Monégasque de Banque' },
    { code: 'CFM_IND', name: 'CFM Indosuez Wealth' },
    { code: 'BNC_MC', name: 'Banque Nationale de Crédit' }
  ],
  MN: [
    { code: 'KHAN', name: 'Khan Bank' },
    { code: 'GOLOMT', name: 'Golomt Bank' },
    { code: 'TDB', name: 'Trade and Development Bank' },
    { code: 'XAC', name: 'XacBank' }
  ],
  ME: [
    { code: 'CKB', name: 'Crnogorska komercijalna banka' },
    { code: 'NLB_ME', name: 'NLB Banka' },
    { code: 'HIPOTEKARNA', name: 'Hipotekarna banka' }
  ],
  MA: [
    { code: 'ATTIJARI', name: 'Attijariwafa Bank' },
    { code: 'BP', name: 'Banque Populaire' },
    { code: 'BMCE', name: 'Bank of Africa (BMCE)' },
    { code: 'CIH', name: 'CIH Bank' },
    { code: 'CDM', name: 'Crédit du Maroc' }
  ],
  MZ: [
    { code: 'BIM', name: 'Banco Internacional de Moçambique' },
    { code: 'BCI_MZ', name: 'BCI Moçambique' },
    { code: 'STANDARD_MZ', name: 'Standard Bank Mozambique' },
    { code: 'ABSA_MZ', name: 'Absa Bank Mozambique' }
  ],
  MM: [
    { code: 'KBZ', name: 'KBZ Bank' },
    { code: 'AYA', name: 'AYA Bank' },
    { code: 'CB', name: 'CB Bank' },
    { code: 'YOMA', name: 'Yoma Bank' }
  ],
  NA: [
    { code: 'FNB_NA', name: 'First National Bank Namibia' },
    { code: 'STANDARD_NA', name: 'Standard Bank Namibia' },
    { code: 'NEDBANK_NA', name: 'Nedbank Namibia' },
    { code: 'BANK_WINDHOEK', name: 'Bank Windhoek' }
  ],
  NR: [
    { code: 'BENDIGO_NR', name: 'Bendigo Bank (Nauru agency)' },
    { code: 'BANK_NAURU', name: 'Bank of Nauru' }
  ],
  NP: [
    { code: 'NABIL', name: 'Nabil Bank' },
    { code: 'NIBL', name: 'Nepal Investment Mega Bank' },
    { code: 'GLOBAL_IME', name: 'Global IME Bank' },
    { code: 'NIC_ASIA', name: 'NIC Asia Bank' }
  ],
  NL: [
    { code: 'ING_NL', name: 'ING' },
    { code: 'RABOBANK', name: 'Rabobank' },
    { code: 'ABN', name: 'ABN AMRO' },
    { code: 'SNS', name: 'SNS Bank' },
    { code: 'BUNQ', name: 'bunq' }
  ],
  NZ: [
    { code: 'ANZ_NZ', name: 'ANZ New Zealand' },
    { code: 'ASB', name: 'ASB Bank' },
    { code: 'BNZ', name: 'BNZ' },
    { code: 'WESTPAC_NZ', name: 'Westpac New Zealand' },
    { code: 'KIWIBANK', name: 'Kiwibank' }
  ],
  NI: [
    { code: 'BANPRO', name: 'Banpro' },
    { code: 'LAFISE', name: 'Lafise Bancentro' },
    { code: 'BAC_NI', name: 'BAC Credomatic Nicaragua' },
    { code: 'BDF', name: 'Banco de Finanzas' }
  ],
  NE: [
    { code: 'BOA_NE', name: 'Bank of Africa Niger' },
    { code: 'SONIBANK', name: 'Sonibank' },
    { code: 'ECOBANK_NE', name: 'Ecobank Niger' }
  ],
  NG: [
    { code: 'GTB', name: 'Guaranty Trust Bank' },
    { code: 'ACCESS', name: 'Access Bank' },
    { code: 'ZENITH', name: 'Zenith Bank' },
    { code: 'FIRSTBANK', name: 'First Bank of Nigeria' },
    { code: 'UBA', name: 'United Bank for Africa' },
    { code: 'FCMB', name: 'First City Monument Bank' },
    { code: 'STANBIC', name: 'Stanbic IBTC Bank' },
    { code: 'UNION', name: 'Union Bank of Nigeria' },
    { code: 'FIDELITY', name: 'Fidelity Bank' },
    { code: 'STERLING', name: 'Sterling Bank' },
    { code: 'WEMA', name: 'Wema Bank' },
    { code: 'POLARIS', name: 'Polaris Bank' },
    { code: 'KEYSTONE', name: 'Keystone Bank' },
    { code: 'UNITY', name: 'Unity Bank' },
    { code: 'PROVIDUS', name: 'Providus Bank' },
    { code: 'JAIZ', name: 'Jaiz Bank' },
    { code: 'KUDA', name: 'Kuda Bank' },
    { code: 'OPAY', name: 'OPay' },
    { code: 'PALMPAY', name: 'PalmPay' },
    { code: 'MONIEPOINT', name: 'Moniepoint MFB' }
  ],
  KP: [
    { code: 'CENTRAL_KP', name: 'Central Bank of DPRK' },
    { code: 'FOREIGN_KP', name: 'Foreign Trade Bank of DPRK' }
  ],
  MK: [
    { code: 'STOPANSKA', name: 'Stopanska Banka' },
    { code: 'KOMERCIJALNA', name: 'Komercijalna Banka' },
    { code: 'NLB_MK', name: 'NLB Banka Skopje' }
  ],
  NO: [
    { code: 'DNB', name: 'DNB' },
    { code: 'NORDEA_NO', name: 'Nordea Norway' },
    { code: 'SPAREBANK1', name: 'SpareBank 1' },
    { code: 'HANDELSBANKEN_NO', name: 'Handelsbanken Norway' }
  ],
  OM: [
    { code: 'BANK_MUSCAT', name: 'Bank Muscat' },
    { code: 'NBO', name: 'National Bank of Oman' },
    { code: 'BANK_DHOFAR', name: 'Bank Dhofar' },
    { code: 'SOHAR', name: 'Sohar International' }
  ],
  PK: [
    { code: 'HBL', name: 'HBL' },
    { code: 'UBL', name: 'UBL' },
    { code: 'MCB', name: 'MCB Bank' },
    { code: 'ABL', name: 'Allied Bank' },
    { code: 'BAFL', name: 'Bank Alfalah' },
    { code: 'MEEZAN', name: 'Meezan Bank' }
  ],
  PW: [
    { code: 'BOG_PW', name: 'Bank of Guam (Palau)' },
    { code: 'BANK_PALAU', name: 'Bank of Palau' }
  ],
  PS: [
    { code: 'BANK_OF_PALESTINE', name: 'Bank of Palestine' },
    { code: 'ARAB_ISLAMIC', name: 'Arab Islamic Bank' },
    { code: 'QDS', name: 'Quds Bank' },
    { code: 'NATIONAL_PS', name: 'National Bank' }
  ],
  PA: [
    { code: 'BANISTMO', name: 'Banistmo' },
    { code: 'GENERAL', name: 'Banco General' },
    { code: 'BAC_PA', name: 'BAC Credomatic Panamá' },
    { code: 'GLOBAL', name: 'Global Bank' }
  ],
  PG: [
    { code: 'BSP', name: 'Bank of South Pacific' },
    { code: 'WESTPAC_PG', name: 'Westpac PNG' },
    { code: 'KINA', name: 'Kina Bank' }
  ],
  PY: [
    { code: 'ITAU_PY', name: 'Banco Itaú Paraguay' },
    { code: 'CONTINENTAL', name: 'Banco Continental' },
    { code: 'REGIONAL', name: 'Banco Regional' },
    { code: 'GNB_PY', name: 'GNB Paraguay' }
  ],
  PE: [
    { code: 'BCP_PE', name: 'Banco de Crédito del Perú' },
    { code: 'BBVA_PE', name: 'BBVA Perú' },
    { code: 'SCOTIABANK_PE', name: 'Scotiabank Perú' },
    { code: 'INTERBANK', name: 'Interbank' }
  ],
  PH: [
    { code: 'BDO', name: 'BDO Unibank' },
    { code: 'BPI', name: 'Bank of the Philippine Islands' },
    { code: 'METROBANK', name: 'Metrobank' },
    { code: 'LANDBANK', name: 'Land Bank of the Philippines' },
    { code: 'PNB_PH', name: 'Philippine National Bank' }
  ],
  PL: [
    { code: 'PKO', name: 'PKO Bank Polski' },
    { code: 'PEKAO', name: 'Bank Pekao' },
    { code: 'SANTANDER_PL', name: 'Santander Bank Polska' },
    { code: 'MBANK', name: 'mBank' },
    { code: 'ING_PL', name: 'ING Bank Śląski' }
  ],
  PT: [
    { code: 'CGD', name: 'Caixa Geral de Depósitos' },
    { code: 'MILLENNIUM', name: 'Millennium BCP' },
    { code: 'NOVO', name: 'Novo Banco' },
    { code: 'SANTANDER_PT', name: 'Santander Totta' }
  ],
  QA: [
    { code: 'QNB', name: 'Qatar National Bank' },
    { code: 'CBQ', name: 'Commercial Bank of Qatar' },
    { code: 'DOHA', name: 'Doha Bank' },
    { code: 'QIB', name: 'Qatar Islamic Bank' }
  ],
  RO: [
    { code: 'BCR', name: 'Banca Comercială Română' },
    { code: 'BRD', name: 'BRD Groupe Société Générale' },
    { code: 'ING_RO', name: 'ING Bank Romania' },
    { code: 'RAIFFEISEN_RO', name: 'Raiffeisen Bank Romania' },
    { code: 'BT', name: 'Banca Transilvania' }
  ],
  RU: [
    { code: 'SBER', name: 'Sberbank' },
    { code: 'VTB', name: 'VTB' },
    { code: 'GAZPROMBANK', name: 'Gazprombank' },
    { code: 'ALFA', name: 'Alfa-Bank' },
    { code: 'TINKOFF', name: 'Tinkoff Bank' }
  ],
  RW: [
    { code: 'BK', name: 'Bank of Kigali' },
    { code: 'EQUITY_RW', name: 'Equity Bank Rwanda' },
    { code: 'GT_RW', name: 'GT Bank Rwanda' },
    { code: 'I_M_RW', name: 'I&M Bank Rwanda' },
    { code: 'COGEBANQUE', name: 'Cogebanque' }
  ],
  KN: [
    { code: 'SKNA', name: 'St. Kitts-Nevis-Anguilla National Bank' },
    { code: 'CIBC_KN', name: 'CIBC FirstCaribbean St. Kitts' },
    { code: 'RBC_KN', name: 'RBC Royal Bank St. Kitts' }
  ],
  LC: [
    { code: 'BOSL', name: 'Bank of Saint Lucia' },
    { code: 'CIBC_LC', name: 'CIBC FirstCaribbean St. Lucia' },
    { code: 'RBC_LC', name: 'RBC Royal Bank St. Lucia' }
  ],
  VC: [
    { code: 'BOSVG', name: 'Bank of St. Vincent and the Grenadines' },
    { code: 'CIBC_VC', name: 'CIBC FirstCaribbean SVG' },
    { code: 'RBC_VC', name: 'RBC Royal Bank SVG' }
  ],
  WS: [
    { code: 'BSP_WS', name: 'Bank of South Pacific Samoa' },
    { code: 'ANZ_WS', name: 'ANZ Samoa' },
    { code: 'NBS_WS', name: 'National Bank of Samoa' }
  ],
  SM: [
    { code: 'ASSET', name: 'Asset Banca' },
    { code: 'BAC_SM', name: 'Banca Agricola Commerciale' },
    { code: 'CIS', name: 'Cassa di Risparmio della Repubblica di San Marino' }
  ],
  ST: [
    { code: 'BISTP', name: 'Banco Internacional de São Tomé e Príncipe' },
    { code: 'AFRILAND_ST', name: 'Afriland First Bank STP' }
  ],
  SA: [
    { code: 'ALRAJHI', name: 'Al Rajhi Bank' },
    { code: 'SNB', name: 'Saudi National Bank' },
    { code: 'RIYAD', name: 'Riyad Bank' },
    { code: 'SABB', name: 'SABB' },
    { code: 'ALINMA', name: 'Alinma Bank' },
    { code: 'ANB', name: 'Arab National Bank' }
  ],
  SN: [
    { code: 'CBAO', name: 'CBAO Groupe Attijariwafa Bank' },
    { code: 'SGBS', name: 'Société Générale Sénégal' },
    { code: 'BOA_SN', name: 'Bank of Africa Sénégal' },
    { code: 'ECOBANK_SN', name: 'Ecobank Sénégal' }
  ],
  RS: [
    { code: 'BANCA_INTESA_RS', name: 'Banca Intesa Beograd' },
    { code: 'KOMERCIJALNA_RS', name: 'Komercijalna banka' },
    { code: 'RAIFFEISEN_RS', name: 'Raiffeisen Bank Serbia' },
    { code: 'UNICREDIT_RS', name: 'UniCredit Bank Serbia' }
  ],
  SC: [
    { code: 'MCB_SC', name: 'Mauritius Commercial Bank Seychelles' },
    { code: 'NOUVOBANQ', name: 'Nouvobanq' },
    { code: 'ABSA_SC', name: 'Absa Bank Seychelles' }
  ],
  SL: [
    { code: 'Rokel', name: 'Rokel Commercial Bank' },
    { code: 'SLCB', name: 'Sierra Leone Commercial Bank' },
    { code: 'ECOBANK_SL', name: 'Ecobank Sierra Leone' },
    { code: 'UBA_SL', name: 'UBA Sierra Leone' }
  ],
  SG: [
    { code: 'DBS', name: 'DBS Bank' },
    { code: 'OCBC', name: 'OCBC Bank' },
    { code: 'UOB', name: 'United Overseas Bank' },
    { code: 'SCB_SG', name: 'Standard Chartered Singapore' },
    { code: 'CITI_SG', name: 'Citibank Singapore' }
  ],
  SK: [
    { code: 'SLSP', name: 'Slovenská sporiteľňa' },
    { code: 'VUB', name: 'VÚB Banka' },
    { code: 'TATRA', name: 'Tatra banka' },
    { code: 'CSOB_SK', name: 'ČSOB Slovakia' }
  ],
  SI: [
    { code: 'NLB', name: 'NLB' },
    { code: 'NKBM', name: 'Nova KBM' },
    { code: 'SKB', name: 'SKB Banka' },
    { code: 'UNICREDIT_SI', name: 'UniCredit Bank Slovenia' }
  ],
  SB: [
    { code: 'BSP_SB', name: 'Bank of South Pacific Solomon Islands' },
    { code: 'ANZ_SB', name: 'ANZ Solomon Islands' },
    { code: 'PBT', name: 'Pan Oceanic Bank' }
  ],
  SO: [
    { code: 'DAHABSHIIL', name: 'Dahabshiil Bank International' },
    { code: 'PREMIER_SO', name: 'Premier Bank Somalia' },
    { code: 'AMAL', name: 'Amal Bank' }
  ],
  ZA: [
    { code: 'FNB', name: 'First National Bank' },
    { code: 'ABSA_ZA', name: 'Absa Bank' },
    { code: 'STD_ZA', name: 'Standard Bank' },
    { code: 'NEDBANK', name: 'Nedbank' },
    { code: 'CAPITEC', name: 'Capitec Bank' },
    { code: 'INVESTEC', name: 'Investec' },
    { code: 'TYME', name: 'TymeBank' },
    { code: 'DISCOVERY', name: 'Discovery Bank' }
  ],
  KR: [
    { code: 'KB', name: 'KB Kookmin Bank' },
    { code: 'SHINHAN', name: 'Shinhan Bank' },
    { code: 'WOORI', name: 'Woori Bank' },
    { code: 'HANA', name: 'Hana Bank' },
    { code: 'NH', name: 'NongHyup Bank' }
  ],
  SS: [
    { code: 'KCB_SS', name: 'KCB Bank South Sudan' },
    { code: 'ECOBANK_SS', name: 'Ecobank South Sudan' },
    { code: 'CFC', name: 'Cooperative Bank South Sudan' }
  ],
  ES: [
    { code: 'SANTANDER_ES', name: 'Banco Santander' },
    { code: 'BBVA_ES', name: 'BBVA' },
    { code: 'CAIXABANK', name: 'CaixaBank' },
    { code: 'SABADELL', name: 'Banco Sabadell' },
    { code: 'BANKINTER', name: 'Bankinter' }
  ],
  LK: [
    { code: 'BOC_LK', name: 'Bank of Ceylon' },
    { code: 'PEOPLES', name: 'People\'s Bank' },
    { code: 'COMMERCIAL_LK', name: 'Commercial Bank of Ceylon' },
    { code: 'HNB', name: 'Hatton National Bank' },
    { code: 'SAMPATH', name: 'Sampath Bank' }
  ],
  SD: [
    { code: 'BANK_OF_KHARTOUM', name: 'Bank of Khartoum' },
    { code: 'Faisal', name: 'Faisal Islamic Bank' },
    { code: 'OMDURMAN', name: 'Omdurman National Bank' }
  ],
  SR: [
    { code: 'DSB', name: 'De Surinaamsche Bank' },
    { code: 'HAKRINBANK', name: 'Hakrinbank' },
    { code: 'FINABANK', name: 'Finabank' }
  ],
  SE: [
    { code: 'SWEDBANK_SE', name: 'Swedbank' },
    { code: 'SEB_SE', name: 'SEB' },
    { code: 'HANDELSBANKEN', name: 'Handelsbanken' },
    { code: 'NORDEA_SE', name: 'Nordea Sweden' }
  ],
  CH: [
    { code: 'UBS', name: 'UBS' },
    { code: 'CS', name: 'Credit Suisse' },
    { code: 'RAIFFEISEN_CH', name: 'Raiffeisen Switzerland' },
    { code: 'ZKB', name: 'Zürcher Kantonalbank' },
    { code: 'POSTFINANCE', name: 'PostFinance' }
  ],
  SY: [
    { code: 'CBS', name: 'Commercial Bank of Syria' },
    { code: 'REAL_ESTATE_SY', name: 'Real Estate Bank' },
    { code: 'INDUSTRIAL_SY', name: 'Industrial Bank of Syria' }
  ],
  TW: [
    { code: 'CTBC', name: 'CTBC Bank' },
    { code: 'CATHAY', name: 'Cathay United Bank' },
    { code: 'FUBON', name: 'Taipei Fubon Bank' },
    { code: 'MEGA', name: 'Mega International Commercial Bank' },
    { code: 'FIRST_TW', name: 'First Commercial Bank' }
  ],
  TJ: [
    { code: 'AMONATBONK', name: 'Amonatbonk' },
    { code: 'ORIENBANK', name: 'Orienbank' },
    { code: 'ESKHATA', name: 'Eskhata Bank' }
  ],
  TZ: [
    { code: 'CRDB', name: 'CRDB Bank' },
    { code: 'NMB', name: 'NMB Bank' },
    { code: 'EQUITY_TZ', name: 'Equity Bank Tanzania' },
    { code: 'STANBIC_TZ', name: 'Stanbic Bank Tanzania' },
    { code: 'NBC', name: 'National Bank of Commerce' },
    { code: 'TPB', name: 'Tanzania Postal Bank' }
  ],
  TH: [
    { code: 'BBL', name: 'Bangkok Bank' },
    { code: 'KBANK', name: 'Kasikornbank' },
    { code: 'SCB_TH', name: 'Siam Commercial Bank' },
    { code: 'KTB', name: 'Krungthai Bank' },
    { code: 'BAY', name: 'Bank of Ayudhya (Krungsri)' }
  ],
  TL: [
    { code: 'BNCTL', name: 'Banco Nacional de Comércio de Timor-Leste' },
    { code: 'ANZ_TL', name: 'ANZ Timor-Leste' }
  ],
  TG: [
    { code: 'BTCI', name: 'Banque Togolaise pour le Commerce et l\'Industrie' },
    { code: 'ORABANK_TG', name: 'Orabank Togo' },
    { code: 'ECOBANK_TG', name: 'Ecobank Togo' },
    { code: 'UBA_TG', name: 'UBA Togo' }
  ],
  TO: [
    { code: 'BSP_TO', name: 'Bank of South Pacific Tonga' },
    { code: 'ANZ_TO', name: 'ANZ Tonga' },
    { code: 'MBf', name: 'MBf Bank Tonga' }
  ],
  TT: [
    { code: 'REPUBLIC_TT', name: 'Republic Bank Trinidad' },
    { code: 'SCOTIABANK_TT', name: 'Scotiabank Trinidad' },
    { code: 'FCB', name: 'First Citizens Bank' },
    { code: 'RBC_TT', name: 'RBC Royal Bank Trinidad' }
  ],
  TN: [
    { code: 'BIAT', name: 'Banque Internationale Arabe de Tunisie' },
    { code: 'BNA_TN', name: 'Banque Nationale Agricole' },
    { code: 'STB', name: 'Société Tunisienne de Banque' },
    { code: 'BH', name: 'Banque de l\'Habitat' }
  ],
  TR: [
    { code: 'ZIRAAT', name: 'Ziraat Bankası' },
    { code: 'ISBANK', name: 'İş Bankası' },
    { code: 'GARANTI', name: 'Garanti BBVA' },
    { code: 'AKBANK', name: 'Akbank' },
    { code: 'YAPI_KREDI', name: 'Yapı Kredi' },
    { code: 'HALKBANK', name: 'Halkbank' }
  ],
  TM: [
    { code: 'DAYHANBANK', name: 'Dayhanbank' },
    { code: 'TURKMENISTAN', name: 'State Bank for Foreign Economic Affairs' },
    { code: 'SENAGAT', name: 'Senagat Bank' }
  ],
  TV: [
    { code: 'NATIONAL_TV', name: 'National Bank of Tuvalu' },
    { code: 'ANZ_TV', name: 'ANZ (regional agency)' }
  ],
  UG: [
    { code: 'STANBIC_UG', name: 'Stanbic Bank Uganda' },
    { code: 'CENTENARY', name: 'Centenary Bank' },
    { code: 'DFCU', name: 'dfcu Bank' },
    { code: 'ABSA_UG', name: 'Absa Bank Uganda' },
    { code: 'EQUITY_UG', name: 'Equity Bank Uganda' },
    { code: 'KCB_UG', name: 'KCB Bank Uganda' }
  ],
  UA: [
    { code: 'PRIVATBANK', name: 'PrivatBank' },
    { code: 'OSCHADBANK', name: 'Oschadbank' },
    { code: 'RAIFFEISEN_UA', name: 'Raiffeisen Bank Aval' },
    { code: 'UKRSIBBANK', name: 'Ukrsibbank' },
    { code: 'PUMB', name: 'First Ukrainian International Bank' }
  ],
  AE: [
    { code: 'ENBD', name: 'Emirates NBD' },
    { code: 'FAB', name: 'First Abu Dhabi Bank' },
    { code: 'ADCB', name: 'Abu Dhabi Commercial Bank' },
    { code: 'DIB', name: 'Dubai Islamic Bank' },
    { code: 'MASHREQ', name: 'Mashreq Bank' },
    { code: 'HSBC_UAE', name: 'HSBC UAE' },
    { code: 'SCB_UAE', name: 'Standard Chartered UAE' }
  ],
  GB: [
    { code: 'BARCLAYS', name: 'Barclays' },
    { code: 'HSBC_UK', name: 'HSBC UK' },
    { code: 'LLOYDS', name: 'Lloyds Bank' },
    { code: 'NATWEST', name: 'NatWest' },
    { code: 'SANTANDER_UK', name: 'Santander UK' },
    { code: 'RBS', name: 'Royal Bank of Scotland' },
    { code: 'HALIFAX', name: 'Halifax' },
    { code: 'MONZO', name: 'Monzo' },
    { code: 'STARLING', name: 'Starling Bank' },
    { code: 'REVOLUT_UK', name: 'Revolut' },
    { code: 'CHASE_UK', name: 'Chase UK' }
  ],
  US: [
    { code: 'CHASE', name: 'Chase' },
    { code: 'BOA', name: 'Bank of America' },
    { code: 'WELLS', name: 'Wells Fargo' },
    { code: 'CITI', name: 'Citibank' },
    { code: 'USBANK', name: 'U.S. Bank' },
    { code: 'PNC', name: 'PNC Bank' },
    { code: 'TD_US', name: 'TD Bank' },
    { code: 'CAPITAL_ONE', name: 'Capital One' },
    { code: 'SCHWAB', name: 'Charles Schwab' },
    { code: 'ALLY', name: 'Ally Bank' }
  ],
  UY: [
    { code: 'BROU', name: 'Banco República (BROU)' },
    { code: 'ITAU_UY', name: 'Banco Itaú Uruguay' },
    { code: 'SANTANDER_UY', name: 'Santander Uruguay' },
    { code: 'SCOTIABANK_UY', name: 'Scotiabank Uruguay' }
  ],
  UZ: [
    { code: 'NBU', name: 'National Bank of Uzbekistan' },
    { code: 'UZPROM', name: 'Uzpromstroybank' },
    { code: 'IPOTEKA', name: 'Ipoteka Bank' },
    { code: 'KAPITAL_UZ', name: 'Kapitalbank' }
  ],
  VU: [
    { code: 'NBV', name: 'National Bank of Vanuatu' },
    { code: 'ANZ_VU', name: 'ANZ Vanuatu' },
    { code: 'BSP_VU', name: 'Bank of South Pacific Vanuatu' }
  ],
  VA: [
    { code: 'IOR', name: 'Institute for the Works of Religion' },
    { code: 'APS_VA', name: 'Administration of the Patrimony of the Apostolic See' }
  ],
  VE: [
    { code: 'BDV', name: 'Banco de Venezuela' },
    { code: 'Banesco', name: 'Banesco' },
    { code: 'MERCANTIL_VE', name: 'Banco Mercantil' },
    { code: 'PROVINCIAL', name: 'BBVA Provincial' }
  ],
  VN: [
    { code: 'VIETCOMBANK', name: 'Vietcombank' },
    { code: 'BIDV', name: 'BIDV' },
    { code: 'VIETINBANK', name: 'VietinBank' },
    { code: 'AGRIBANK', name: 'Agribank' },
    { code: 'TECHCOMBANK', name: 'Techcombank' },
    { code: 'MBBANK', name: 'MB Bank' }
  ],
  YE: [
    { code: 'CAC_YE', name: 'Cooperative & Agricultural Credit Bank' },
    { code: 'TADHAMON', name: 'Tadhamon International Islamic Bank' },
    { code: 'YBRD', name: 'Yemen Bank for Reconstruction and Development' }
  ],
  ZM: [
    { code: 'ZANACO', name: 'Zanaco' },
    { code: 'STANBIC_ZM', name: 'Stanbic Bank Zambia' },
    { code: 'FNB_ZM', name: 'First National Bank Zambia' },
    { code: 'ABSA_ZM', name: 'Absa Bank Zambia' },
    { code: 'INDO_ZM', name: 'Indo Zambia Bank' }
  ],
  ZW: [
    { code: 'CBZ', name: 'CBZ Bank' },
    { code: 'STANBIC_ZW', name: 'Stanbic Bank Zimbabwe' },
    { code: 'FBC', name: 'FBC Bank' },
    { code: 'NMB_ZW', name: 'NMB Bank Zimbabwe' },
    { code: 'ZB', name: 'ZB Bank' }
  ]
};

function fallbackBanks(countryCode) {
  const name = countryName(countryCode) || countryCode;
  return [
    { code: `${countryCode}_NATIONAL`, name: `National / primary banks (${name})` },
    { code: `${countryCode}_COMMERCIAL`, name: `Commercial banks (${name})` },
    { code: `${countryCode}_ISLAMIC`, name: `Islamic / specialized banks (${name})` },
    { code: `${countryCode}_DIGITAL`, name: `Digital / mobile money (${name})` },
    { code: `${countryCode}_OTHER`, name: `Other bank in ${name}` }
  ];
}

/** Full map: every listed country has at least one bank option. */
const BANKS_BY_COUNTRY = {};
for (const { code } of COUNTRIES) {
  if (code === 'OTHER') continue;
  const specific = SPECIFIC_BANKS[code];
  BANKS_BY_COUNTRY[code] = specific && specific.length
    ? specific.slice().sort((a, b) => a.name.localeCompare(b.name))
    : fallbackBanks(code);
}

function banksForCountry(countryCode) {
  const raw = String(countryCode || '').trim().toUpperCase();
  const fallback = (process.env.DEFAULT_COUNTRY_CODE || 'NG').toUpperCase();
  const code = raw && BANKS_BY_COUNTRY[raw] ? raw : (BANKS_BY_COUNTRY[fallback] ? fallback : raw);

  if (code && BANKS_BY_COUNTRY[code] && BANKS_BY_COUNTRY[code].length) {
    return BANKS_BY_COUNTRY[code].slice();
  }

  // Unknown country — still never return empty
  return [
    { code: 'LOCAL_BANK', name: 'Local bank (other)' },
    { code: 'INTERNATIONAL', name: 'International / correspondent bank' },
    { code: 'FINTECH', name: 'Digital wallet / fintech' }
  ];
}

module.exports = {
  BANKS_BY_COUNTRY,
  SPECIFIC_BANKS,
  banksForCountry
};