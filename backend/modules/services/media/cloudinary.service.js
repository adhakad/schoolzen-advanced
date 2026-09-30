'use strict';
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const logger = require('../../helpers/logger');

// Cloudinary for v2 modules — a capability service, named for what it does rather than for
// a module (frontend-backend-folder-structure.md). Same account and env vars the legacy
// controllers use (including the legacy CLOUDINARY_CLOUD_NAMAE spelling, which is what the
// deployed .env actually holds).
//
// Uploads go straight from the in-memory buffer (multer.memoryStorage) to Cloudinary via
// upload_stream — no local temp file, so no local folder that has to exist on the server
// (student-fix3.md). Cloudinary creates the remote folder itself on first upload:
// schoolzen/{adminId}/<kind>/ keeps a school's assets grouped, so closing a school is one
// folder operation (additional-technical-considerations.md, File storage).
const { CLOUDINARY_CLOUD_NAMAE, CLOUDINARY_CLOUD_NAME, CLOUDINARY_CLOUD_API_KEY, CLOUDINARY_CLOUD_API_SECRET } = process.env;

cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAMAE,
    api_key: CLOUDINARY_CLOUD_API_KEY,
    api_secret: CLOUDINARY_CLOUD_API_SECRET,
    timeout: 60000,
    secure: true,
});

// The largest size any screen shows a student photo at (the profile view's header).
const PROFILE_PHOTO_WIDTH = 300;

/**
 * An optimized delivery URL: f_auto (WebP/AVIF where the browser supports it) + q_auto
 * (perceptually-tuned compression), resized to `width` — the size the consumer actually
 * renders, never a big image shrunk with CSS. A local computation, no network call.
 */
const imageUrl = (publicId, width = PROFILE_PHOTO_WIDTH) => cloudinary.url(publicId, {
    secure: true,
    fetch_format: 'auto',
    quality: 'auto',
    width,
    crop: 'limit',
});

// What the bytes ARE, not what the extension or the browser-sent mime type claims — a
// renamed file never reaches Cloudinary as an "image".
const sniffImageType = (buffer) => {
    if (!buffer || buffer.length < 4) return null;
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    return null;
};

/**
 * Upload an in-memory image buffer.
 * @returns {Promise<{ url: String, publicId: String }>} url is the optimized profile-size URL
 */
const uploadImageBuffer = (buffer, adminId, kind) => new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
        { folder: `schoolzen/${adminId}/${kind}`, resource_type: 'image' },
        (error, result) => (error ? reject(error) : resolve({ url: imageUrl(result.public_id), publicId: result.public_id }))
    );
    stream.end(buffer);
});

/** Kept for disk-stored uploads elsewhere; memory-stored uploads have no temp file. */
const removeLocal = (localPath) => {
    if (!localPath) return;
    fs.promises.unlink(localPath).catch(() => { /* already gone */ });
};

/** Best-effort: a leftover image is a storage cost, never a reason to fail the caller. */
const destroyImages = async (publicIds) => {
    const ids = (publicIds || []).filter(Boolean);
    await Promise.all(ids.map((publicId) => cloudinary.uploader.destroy(publicId).catch((error) => {
        logger.warn('cloudinary.destroyFailed', { publicId, reason: error.message });
    })));
};

module.exports = { uploadImageBuffer, imageUrl, sniffImageType, destroyImages, removeLocal, PROFILE_PHOTO_WIDTH };
