'use strict';
const fs = require('fs');
const path = require('path');

// Legacy disk-storage uploads (helpers/file-upload.js) write into ./public/<folder>/, and
// multer's diskStorage never creates a destination it's handed as a function — a missing
// folder turns every legacy upload into an ENOENT 500. v2 uploads go through memory storage
// + Cloudinary and don't need these; this only keeps the untouched legacy routes working.
const LEGACY_UPLOAD_DIRS = ['school-logo', 'student-image', 'banner-image', 'subject-image', 'ads-image', 'topper-image', 'testimonial-image'];

const ensureUploadDirs = () => {
    LEGACY_UPLOAD_DIRS.forEach((dir) => fs.mkdirSync(path.join(process.cwd(), 'public', dir), { recursive: true }));
};

module.exports = { ensureUploadDirs };
