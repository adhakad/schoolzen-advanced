'use strict';
const multer = require('multer');
const { ValidationError } = require('../errors');
const { removeLocal } = require('../services/media/cloudinary.service');

// Wraps a Multer `.single(field)` so its failures come out in the v2 error contract.
//
// Legacy routes hand-write a size/type/path check around every upload call (see
// routes/student.js). Here the three Multer failure shapes map to one ValidationError
// bound to the file field, so the form can show "Photo must be under 100KB" under the photo
// control instead of a generic 500.
//
// Usage (in a routes file):
//   router.post('/students', singleUpload(fileUpload.studentImage, 'photo', 'student'), CreateStudent);

// Multer instance for spreadsheets: kept in MEMORY, never on disk — the request parses the
// sheet and enqueues its rows, so there's no temp file to clean up (or leak).
const EXCEL_MIME_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream', // some browsers/OSes label .xlsx this way
]);
const excelFile = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (EXCEL_MIME_TYPES.has(file.mimetype) && /\.xlsx$/i.test(file.originalname)) return cb(null, true);
        const error = new Error('Only .xlsx files are allowed');
        error.name = 'INVALID_FILE_TYPE';
        return cb(error, false);
    },
});

const describe = (error, field) => {
    if (error.code === 'LIMIT_FILE_SIZE') return 'File is too large';
    if (error.code === 'LIMIT_UNEXPECTED_FILE') return `Unexpected file field (expected "${field}")`;
    if (error.name === 'INVALID_FILE_TYPE') return error.message;
    if (error.code === 'ENOENT') return 'Upload folder is missing on the server';
    return 'Upload failed';
};

const singleUpload = (multerInstance, field, module) => {
    const handler = multerInstance.single(field);
    return (req, res, next) => {
        handler(req, res, (error) => {
            // A disk-stored temp file must not outlive the request, whatever happens after
            // this — a later ValidationError included. The Cloudinary upload already
            // removes it on the success path; unlinking twice is harmless.
            if (req.file && req.file.path) {
                const tempPath = req.file.path;
                res.on('finish', () => removeLocal(tempPath));
            }
            if (!error) return next();
            return next(new ValidationError('Please fix the highlighted fields', {
                module,
                fields: [{ field, message: describe(error, field) }],
            }));
        });
    };
};

module.exports = { singleUpload, excelFile };
