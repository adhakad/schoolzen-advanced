'use strict';
const adminTokenService = require('../services/admin-token');
const teacherTokenService = require('../services/teacher-token');
const logger = require('../helpers/logger');

// Handshake auth for the Socket.io layer — the same job admin-auth.js does for HTTP, in the
// shape io.use() wants (a (socket, next) middleware rather than (req, res, next)).
//
// WHY THIS IS STRICTER THAN THE REST OF THE ATTENDANCE MODULE
// Every route in routes/attendance.js is unauthenticated and reads adminId straight off
// req.query. A room cannot work that way. A REST caller who guesses another school's id gets
// one response; a socket that joins another school's room gets that school's entire live punch
// stream for as long as it stays connected. So the room is derived from the VERIFIED TOKEN and
// the client is never asked which school it belongs to — see socket-server.js's connection
// handler, which reads socket.data.adminId and nothing off the handshake query.

/**
 * Verify a token without ever letting a rejection escape into io.use().
 *
 * services/admin-token.js's verifyAccessToken calls `reject(err)` WITHOUT returning and then
 * still evaluates `decode.payload`, which throws a TypeError on the failure path. That file is
 * on every admin HTTP request and is not this phase's to change, so it is called defensively
 * instead: an invalid token is a `null` here, never a throw and never an unhandled rejection.
 *
 * @returns {Promise<Object|null>} the decoded payload, or null if the token is not valid.
 */
const safeVerify = async (verifyAccessToken, token) => {
    try {
        const payload = await verifyAccessToken(token);
        return payload && typeof payload === 'object' ? payload : null;
    } catch (error) {
        return null;
    }
};

/**
 * io.use() middleware. Resolves the connecting user's school and stashes it on socket.data.
 */
const authenticateSocket = async (socket, next) => {
    try {
        const token = socket.handshake && socket.handshake.auth && socket.handshake.auth.token;
        if (!token) return next(new Error('Token unavailable'));

        // Admin first, then teacher — both roles open the attendance pages, and the two token
        // families are signed with different secrets, so a failed admin verify is a normal,
        // expected outcome for a teacher's token rather than an error worth logging.
        let payload = await safeVerify(adminTokenService.verifyAccessToken, token);
        let role = 'admin';

        if (!payload) {
            payload = await safeVerify(teacherTokenService.verifyAccessToken, token);
            role = 'teacher';
        }
        if (!payload) return next(new Error('Not authorized'));

        // An admin token's payload is { id, mobile } where id IS the school; a teacher's is
        // { id, adminId, email, name } where id is the teacher and adminId is the school. The
        // two never collide, so this single expression resolves the tenant for both.
        const adminId = String(payload.adminId || payload.id || '');
        if (!adminId) return next(new Error('Not authorized'));

        socket.data.adminId = adminId;
        socket.data.role = role;
        return next();
    } catch (error) {
        // A throw here would take down the connection attempt with no explanation and, on some
        // paths, the process with it. Log and refuse politely instead.
        logger.error('socket-auth.failed', error);
        return next(new Error('Not authorized'));
    }
};

module.exports = { authenticateSocket };
