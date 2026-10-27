'use strict';

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
        profilePhotoUrl: r.profile_photo_url || null,
        email: r.email,
        phoneE164: r.phone_e164,
        status: r.status,
        emailVerifiedAt: r.email_verified_at,
        mfaEnrolledAt: r.mfa_enrolled_at
      };
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

    
    async updateProfilePhoto(userId, photoUrl) {
      const uid = uuidToBinary(userId);
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
    },

    async updatePreferredLocale(userId, locale) {
      await pool.query(
        `UPDATE customer_profiles SET preferred_locale = ? WHERE user_id = ?`,
        [String(locale || 'en').slice(0, 12), uuidToBinary(userId)]
      );
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