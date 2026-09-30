'use strict';
const multer = require('multer');
const { ValidationError } = require('../errors');
const { removeLocal, sniffImageType } = require('../services/media/cloudinary.service');

// The ONE upload layer for v2 modules (additional-technical-considerations.md, "File upload
// handling": one shared upload service app-wide, never a one-off per module).
//
// Every v2 upload is MEMORY-stored: the bytes go from the request straight to their
// destination (Cloudinary via upload_stream, or the Excel parser) with no local temp file —
// so there is no server folder that must exist, and nothing to clean up or leak
// (student-fix3.md). Legacy routes keep their own disk-stored configs in
// helpers/file-upload.js, untouched.
//
// singleUpload() wraps Multer so its failures come out in the v2 error contract: one
// ValidationError bound to the file field, so the form shows "Image must be under 2MB"
// under the photo control instead of a generic 500.
//
// Usage (in a routes file):
//   router.post('/students', singleUpload(imageFile, 'photo', 'student'), CreateStudent);

const MB = 1024 * 1024;

// Photos: JPG/PNG up to 2MB (student/errors.md, studentImage). The declared mime type is
// only a first filter — imageContentGuard() below checks the actual bytes.
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const imageFile = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * MB, files: 1 },
    fileFilter: (req, file, cb) => {
        if (IMAGE_MIME_TYPES.has(file.mimetype)) return cb(null, true);
        const error = new Error('Only JPG/PNG images are allowed.');
        error.name = 'INVALID_FILE_TYPE';
        return cb(error, false);
    },
});

// Spreadsheets: parsed in the request, rows enqueued — never written to disk.
const EXCEL_MIME_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream', // some browsers/OSes label .xlsx this way
]);
const excelFile = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * MB, files: 1 },
    fileFilter: (req, file, cb) => {
        if (EXCEL_MIME_TYPES.has(file.mimetype) && /\.xlsx$/i.test(file.originalname)) return cb(null, true);
        const error = new Error('Only .xlsx files are allowed');
        error.name = 'INVALID_FILE_TYPE';
        return cb(error, false);
    },
});

const SIZE_MESSAGES = { photo: 'Image must be under 2MB.' };

const describe = (error, field) => {
    if (error.code === 'LIMIT_FILE_SIZE') return SIZE_MESSAGES[field] || 'File is too large';
    if (error.code === 'LIMIT_UNEXPECTED_FILE') return `Unexpected file field (expected "${field}")`;
    if (error.name === 'INVALID_FILE_TYPE') return error.message;
    return 'Upload failed';
};

const codeFor = (error) => {
    if (error.code === 'LIMIT_FILE_SIZE') return 'FILE_TOO_LARGE';
    if (error.name === 'INVALID_FILE_TYPE') return 'FILE_TYPE_INVALID';
    return 'UPLOAD_FAILED';
};

const singleUpload = (multerInstance, field, module) => {
    const handler = multerInstance.single(field);
    return (req, res, next) => {
        handler(req, res, (error) => {
            // Only a disk-stored file has a path; memory uploads leave nothing behind.
            if (req.file && req.file.path) {
                const tempPath = req.file.path;
                res.on('finish', () => removeLocal(tempPath));
            }
            if (!error) return next();
            const code = codeFor(error);
            return next(new ValidationError('Please fix the highlighted fields', {
                module,
                code,
                fields: [{ field, code, message: describe(error, field) }],
            }));
        });
    };
};

/**
 * After an image upload: reject a file whose BYTES aren't a JPG/PNG, whatever its name or
 * declared type said (student/errors.md: "re-validated server-side (mime sniff, not just
 * extension)"). A request without a file passes straight through — the photo is optional.
 */
const imageContentGuard = (field, module) => (req, res, next) => {
    if (!req.file) return next();
    if (sniffImageType(req.file.buffer)) return next();
    return next(new ValidationError('Please fix the highlighted fields', {
        module,
        code: 'FILE_TYPE_INVALID',
        fields: [{ field, code: 'FILE_TYPE_INVALID', message: 'Only JPG/PNG images are allowed.' }],
    }));
};

// Beyond this the file is refused outright (a decompression-bomb guard as much as a size
// rule); below it, anything bigger than the box is scaled down before upload.
const MAX_INPUT_PIXELS = 40 * 1000 * 1000;   // 40 MP
const MAX_STORED_EDGE = 1200;                // px — profile photos render at ≤300px

/**
 * After imageContentGuard: re-encode the photo IN MEMORY before it goes anywhere
 * (student/errors.md, "File upload needs more than a mime-type check"; student-fix4.md F):
 *   - above 40 MP → rejected (IMAGE_RESOLUTION_TOO_LARGE);
 *   - EXIF orientation applied first, THEN every metadata block (EXIF/GPS/XMP/ICC) dropped —
 *     stripping without rotating would leave phone portraits sideways;
 *   - scaled to fit 1200×1200, never enlarged; JPG stays JPG, PNG stays PNG.
 * req.file.buffer is replaced, so Cloudinary only ever receives the sanitized bytes.
 */
const imageSanitize = (field, module) => async (req, res, next) => {
    if (!req.file) return next();
    const fail = (code, message) => next(new ValidationError('Please fix the highlighted fields', {
        module, code, fields: [{ field, code, message }],
    }));
    try {
        // Lazy: only image-upload routes pay for loading the native module.
        const sharp = require('sharp');
        // Header only (no pixels decoded), so the size check can give its own clear message;
        // the decode below then runs under sharp's pixel limit as a backstop.
        const meta = await sharp(req.file.buffer, { limitInputPixels: false }).metadata();
        if (!meta.width || !meta.height) return fail('FILE_TYPE_INVALID', 'Only JPG/PNG images are allowed.');
        if (meta.width * meta.height > MAX_INPUT_PIXELS) {
            return fail('IMAGE_RESOLUTION_TOO_LARGE', "That photo's resolution is too high (over 40 megapixels) — please use a smaller photo.");
        }
        let pipeline = sharp(req.file.buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).rotate().resize({ width: MAX_STORED_EDGE, height: MAX_STORED_EDGE, fit: 'inside', withoutEnlargement: true });
        pipeline = meta.format === 'png' ? pipeline.png({ compressionLevel: 9 }) : pipeline.jpeg({ quality: 88, mozjpeg: true });
        // No .withMetadata()/.keepMetadata(): sharp writes none of the input's metadata.
        req.file.buffer = await pipeline.toBuffer();
        req.file.size = req.file.buffer.length;
        return next();
    } catch (error) {
        // Bytes that sniffed as JPG/PNG but don't decode — truncated or crafted files.
        return fail('FILE_TYPE_INVALID', 'That image could not be read — please try a different JPG/PNG.');
    }
};

module.exports = { singleUpload, imageFile, excelFile, imageContentGuard, imageSanitize, MAX_INPUT_PIXELS, MAX_STORED_EDGE };
