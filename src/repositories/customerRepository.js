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
        email: r.email,
        phoneE164: r.phone_e164,
        status: r.status,
        emailVerifiedAt: r.email_verified_at,
        mfaEnrolledAt: r.mfa_enrolled_at
      };
    },

    async updateProfile(userId, { firstName, lastName, middleName, countryCode, preferredLocale }) {
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
          uuidToBinary(userId)
        ]
      );
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
