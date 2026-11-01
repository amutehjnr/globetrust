'use strict';

/**
 * Upload support-chat attachments to Cloudinary (same env as KYC).
 * Env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 */

const ALLOWED = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

const MAX_BYTES = 5 * 1024 * 1024;

function createSupportUploadService({ logger } = {}) {
  const cloudConfigured = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );

  async function storeCloudinary(file) {
    const { v2: cloudinary } = require('cloudinary');
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true
    });

    const isImage = String(file.mimetype || '').startsWith('image/');
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: process.env.SUPPORT_CLOUDINARY_FOLDER || 'globetrust/support',
          resource_type: isImage ? 'image' : 'auto'
          // do not set access_mode — can break on some Cloudinary plans
        },
        (err, res) => (err ? reject(err) : resolve(res))
      );
      stream.end(file.buffer);
    });

    const url = result.secure_url || result.url;
    if (!url) {
      throw new Error('Cloudinary did not return a URL.');
    }

    return {
      url,
      publicId: result.public_id,
      mime: file.mimetype,
      originalName: file.originalname || 'attachment',
      bytes: result.bytes || file.size
    };
  }

  return {
    maxBytes: MAX_BYTES,
    allowedMime: ALLOWED,

    async upload(file) {
      if (!file || !file.buffer) {
        const err = new Error('Choose a file to upload.');
        err.status = 400;
        throw err;
      }
      if (file.size > MAX_BYTES) {
        const err = new Error('File is too large (max 5 MB).');
        err.status = 400;
        throw err;
      }
      let mime = String(file.mimetype || '').toLowerCase();
      // Some browsers send empty mime for WhatsApp forwards — infer from name
      if (!mime || mime === 'application/octet-stream') {
        const n = String(file.originalname || '').toLowerCase();
        if (/\.jpe?g$/.test(n)) mime = 'image/jpeg';
        else if (/\.png$/.test(n)) mime = 'image/png';
        else if (/\.webp$/.test(n)) mime = 'image/webp';
        else if (/\.gif$/.test(n)) mime = 'image/gif';
        else if (/\.pdf$/.test(n)) mime = 'application/pdf';
        file.mimetype = mime;
      }
      if (!ALLOWED.has(mime)) {
        const err = new Error(
          'File type not allowed. Use JPEG, PNG, WebP, GIF, PDF, TXT, or Word documents.'
        );
        err.status = 400;
        throw err;
      }
      if (!cloudConfigured) {
        const err = new Error(
          'File storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.'
        );
        err.status = 503;
        throw err;
      }
      try {
        return await storeCloudinary(file);
      } catch (err) {
        logger?.error?.({ err }, 'Support attachment upload failed');
        const e = new Error('Could not upload file. Try again shortly.');
        e.status = 503;
        throw e;
      }
    }
  };
}

module.exports = { createSupportUploadService };