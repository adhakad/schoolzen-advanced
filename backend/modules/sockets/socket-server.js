'use strict';
const { Server } = require('socket.io');
const { authenticateSocket } = require('../middleware/socket-auth');
const { startPunchSubscriber, stopPunchSubscriber, ROOM_PREFIX } = require('./punch-subscriber');
const logger = require('../helpers/logger');

// One room per school (`school:<adminId>`), which is the whole access-control model: a socket
// only ever sees what is emitted into the room its token put it in. See middleware/socket-auth.js.

// Blank means "*", matching the app's existing wide-open `app.use(cors())`. That is legal here
// only because the handshake carries its token in `auth`, not a cookie — no credentials means
// no credentialed-wildcard problem. Set a comma-separated list to narrow it in production.
const ALLOWED_ORIGINS = (process.env.SOCKET_CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const roomForSchool = (adminId) => `${ROOM_PREFIX}${adminId}`;

let io = null;

/**
 * Attach Socket.io to the running HTTP server and start the Redis punch subscriber.
 * NEVER throws — a failure here costs the live layer, not the API.
 *
 * @param {http.Server} httpServer the server app.js listens on
 * @returns {Server|null}
 */
const initSocketServer = (httpServer) => {
    try {
        io = new Server(httpServer, {
            cors: {
                origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : '*',
            },
            // Default transports deliberately left alone: the polling fallback is what gets a
            // connection through the proxies and filtered school networks that silently drop
            // websocket upgrades. Dropping to websocket-only would look fine in dev and fail
            // for exactly the schools this feature is for.
        });

        io.use(authenticateSocket);

        io.on('connection', (socket) => {
            const { adminId, role } = socket.data;
            const room = roomForSchool(adminId);
            socket.join(room);

            logger.info('socket.connected', { socketId: socket.id, adminId, role, room });

            socket.on('disconnect', (reason) => {
                logger.info('socket.disconnected', { socketId: socket.id, adminId, reason });
            });
        });

        startPunchSubscriber(io);

        logger.info('socket-server.started', {
            origins: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : '*',
        });
        return io;
    } catch (error) {
        logger.error('socket-server.startFailed', error);
        io = null;
        return null;
    }
};

const getIo = () => io;

/**
 * Liveness numbers for GET /v1/attendance/health. Counts only THIS process's sockets, which is
 * what the health endpoint is asking about.
 * @returns {{ connected: Number, rooms: Number }}
 */
const getSocketStats = () => {
    if (!io) return { connected: 0, rooms: 0 };
    try {
        let rooms = 0;
        for (const room of io.sockets.adapter.rooms.keys()) {
            // Socket.io gives every socket its own room named after its id — count only the
            // school rooms, or this reports the socket count twice over.
            if (String(room).startsWith(ROOM_PREFIX)) rooms += 1;
        }
        return { connected: io.sockets.sockets.size, rooms };
    } catch (error) {
        logger.error('socket-server.statsFailed', error);
        return { connected: 0, rooms: 0 };
    }
};

/**
 * Close the socket server and release the subscriber's Redis connection. Called from app.js's
 * shutdown handler.
 */
const closeSocketServer = async () => {
    await stopPunchSubscriber();
    if (!io) return;
    try {
        await new Promise((resolve) => io.close(resolve));
    } catch (error) {
        logger.error('socket-server.closeFailed', error);
    } finally {
        io = null;
    }
};

module.exports = { initSocketServer, getIo, getSocketStats, closeSocketServer, roomForSchool };
