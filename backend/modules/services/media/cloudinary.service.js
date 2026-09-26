'use strict';
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const logger = require('../../helpers/logger');

// Cloudinary for v2 modules — a capability service, named for what it does rather than for
// a module (frontend-backend-folder-structure.md). Same account and env vars the legacy
// controllers use (including the legacy CLOUDINARY_CLOUD_NAMAE spelling, which is what the
// deployed .env actually holds).
//
// Assets go under schoolzen/{adminId}/<kind>/ so a school's files stay grouped and closing
// a school is one folder operation (additional-technical-considerations.md, File storage).
const { CLOUDINARY_CLOUD_NAMAE, CLOUDINARY_CLOUD_NAME, CLOUDINARY_CLOUD_API_KEY, CLOUDINARY_CLOUD_API_SECRET } = process.env;

cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAMAE,
    api_key: CLOUDINARY_CLOUD_API_KEY,
    api_secret: CLOUDINARY_CLOUD_API_SECRET,
    timeout: 60000,
});

const removeLocal = (localPath) => {
    if (!localPath) return;
    fs.promises.unlink(localPath).catch(() => { /* already gone */ });
};

/**
 * Upload a Multer temp file and always delete the temp copy, success or not.
 * @returns {Promise<{ url: String, publicId: String }>}
 */
const uploadImage = async (localPath, adminId, kind) => {
    try {
        const result = await cloudinary.uploader.upload(localPath, {
            folder: `schoolzen/${adminId}/${kind}`,
        });
        return { url: result.secure_url, publicId: result.public_id };
    } finally {
        removeLocal(localPath);
    }
};

/** Best-effort: a leftover image is a storage cost, never a reason to fail the caller. */
const destroyImages = async (publicIds) => {
    const ids = (publicIds || []).filter(Boolean);
    await Promise.all(ids.map((publicId) => cloudinary.uploader.destroy(publicId).catch((error) => {
        logger.warn('cloudinary.destroyFailed', { publicId, reason: error.message });
    })));
};

module.exports = { uploadImage, destroyImages, removeLocal };
