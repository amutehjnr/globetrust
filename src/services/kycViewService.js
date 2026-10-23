
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

function createKycViewService({ logger }) {
  return {
    /**
     * Returns a stream or redirect URL for authorized reviewers only.
     * Callers must enforce RBAC before invoking.
     */
    async openDocument(doc) {
      if (!doc || doc.deletedAt) {
        const err = new Error('Document not found.');
        err.status = 404;
        throw err;
      }

      if (doc.storageProvider === 'local_private') {
        const base = path.join(process.cwd(), 'storage', 'kyc');
        const full = path.join(base, path.basename(doc.storageAssetId));
        if (!full.startsWith(base)) {
          const err = new Error('Invalid storage path.');
          err.status = 400;
          throw err;
        }
        try {
          await fsp.access(full, fs.constants.R_OK);
        } catch {
          const err = new Error('Document file missing.');
          err.status = 404;
          throw err;
        }
        const ext = path.extname(full).toLowerCase();
        const contentType =
          ext === '.pdf'
            ? 'application/pdf'
            : ext === '.png'
              ? 'image/png'
              : 'image/jpeg';
        return {
          mode: 'stream',
          contentType,
          stream: fs.createReadStream(full),
          filename: path.basename(full)
        };
      }

      if (doc.storageProvider === 'cloudinary_authenticated') {
        const { v2: cloudinary } = require('cloudinary');
        cloudinary.config({
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
          api_key: process.env.CLOUDINARY_API_KEY,
          api_secret: process.env.CLOUDINARY_API_SECRET,
          secure: true
        });
        const isPdf = String(doc.storageAssetId).toLowerCase().endsWith('.pdf') ||
          doc.documentType === 'other';
        const url = cloudinary.url(doc.storageAssetId, {
          type: 'authenticated',
          sign_url: true,
          secure: true,
          resource_type: isPdf ? 'raw' : 'image',
          expires_at: Math.floor(Date.now() / 1000) + 60 // 60s
        });
        return { mode: 'redirect', url };
      }

      const err = new Error('Unsupported storage provider.');
      err.status = 400;
      throw err;
    }
  };
}

module.exports = { createKycViewService };
