'use strict';
const compression = require('compression');

// Response compression for every HTTP response (student-critical-fixes.md P2-3).
//
// compression >= 1.8 negotiates Brotli first and falls back to gzip (then deflate) from the
// request's Accept-Encoding; a client that sends none gets the body uncompressed.
//
// Safe for:
//   - file downloads — the default filter only compresses compressible MIME types, so the
//     Excel export (application/vnd.openxmlformats-...) and images pass through byte-for-byte;
//   - Socket.io — engine.io handles /socket.io/ on the http.Server before Express sees it.
// Bodies under 1KB are left alone (the library's default threshold).
module.exports = () => compression();
