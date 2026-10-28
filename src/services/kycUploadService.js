'use strict';

const nodePath = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
]);
const MAX_BYTES = 5 * 1024 * 1024;

function isServerlessFs() {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT ||
      process.env.KYC_STORAGE === 'db'
  );
}

function createKycUploadService({ customerRepo, logger }) {
  const cloudConfigured = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );

  return {
    validateFile(file) {
      if (!file) {
        const err = new Error('Choose a file to upload.');
        err.status = 400;
        throw err;
      }
      if (!ALLOWED_MIME.has(file.mimetype)) {
        const err = new Error('Only JPEG, PNG, WebP, or PDF files are allowed.');
        err.status = 400;
        throw err;
      }
      if (file.size > MAX_BYTES) {
        const err = new Error('File must be 5 MB or smaller.');
        err.status = 400;
        throw err;
      }
    },

    async storeInline(file) {
      const dataUrl =
        'data:' + file.mimetype + ';base64,' + file.buffer.toString('base64');
      return { provider: 'db_inline', assetId: dataUrl };
    },

    async storeLocal(file) {
      const baseDir = isServerlessFs()
        ? nodePath.join(os.tmpdir(), 'gtb-kyc')
        : nodePath.join(process.cwd(), 'storage', 'kyc');
      try {
        await fs.mkdir(baseDir, { recursive: true });
        const id = crypto.randomBytes(16).toString('hex');
        let ext = '.jpg';
        if (file.mimetype === 'application/pdf') ext = '.pdf';
        else if (file.mimetype === 'image/png') ext = '.png';
        else if (file.mimetype === 'image/webp') ext = '.webp';
        const filename = id + ext;
        await fs.writeFile(nodePath.join(baseDir, filename), file.buffer);
        return { provider: 'local_private', assetId: filename };
      } catch (err) {
        if (logger && logger.warn) {
          logger.warn({ err: err.message }, 'KYC local storage failed; using db_inline');
        }
        return this.storeInline(file);
      }
    },

    async storeCloudinary(file) {
      const { v2: cloudinary } = require('cloudinary');
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true
      });
      const resourceType = file.mimetype === 'application/pdf' ? 'raw' : 'image';
      const folder = process.env.CLOUDINARY_KYC_FOLDER || 'gtb/kyc';
      const result = await new Promise(function (resolve, reject) {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: folder,
            resource_type: resourceType,
            type: 'authenticated',
            access_mode: 'authenticated',
            overwrite: false,
            unique_filename: true
          },
          function (err, res) {
            if (err) reject(err);
            else resolve(res);
          }
        );
        stream.end(file.buffer);
      });
      return {
        provider: 'cloudinary_authenticated',
        assetId: result.public_id
      };
    },

    async submit({ userId, documentType, file }) {
      this.validateFile(file);
      const allowedTypes = [
        'passport',
        'national_id',
        'drivers_license',
        'proof_of_address',
        'atm_card_front',
        'atm_card_back',
        'other'
      ];
      if (allowedTypes.indexOf(documentType) === -1) {
        const err = new Error('Invalid document type.');
        err.status = 400;
        throw err;
      }

      let stored;
      if (cloudConfigured && process.env.KYC_STORAGE === 'cloudinary') {
        try {
          stored = await this.storeCloudinary(file);
        } catch (err) {
          if (logger && logger.error) {
            logger.error({ err: err }, 'Cloudinary KYC upload failed');
          }
          const e = new Error('Document storage is temporarily unavailable.');
          e.status = 503;
          throw e;
        }
      } else if (isServerlessFs() || process.env.KYC_STORAGE === 'db') {
        stored = await this.storeInline(file);
      } else {
        stored = await this.storeLocal(file);
      }

      const docId = await customerRepo.createKycDocument({
        userId: userId,
        documentType: documentType,
        storageProvider: stored.provider,
        storageAssetId: stored.assetId
      });
      if (logger && logger.info) {
        logger.info(
          {
            userId: userId,
            docId: docId,
            documentType: documentType,
            provider: stored.provider
          },
          'KYC document submitted'
        );
      }
      return { docId: docId };
    }
  };
}

module.exports = { createKycUploadService };