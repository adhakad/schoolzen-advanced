'use strict'
require('dotenv').config()
const constant = "./config/config.js";
global.global_config = require(constant);

const express = require('express');
const app = express();
const http = require('http');
const { DbConnect } = require('./modules/helpers/database');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require("cookie-parser");
const path = require('path');
require('./cron-job');

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());
app.use(cors());
DbConnect();
// app.use(function (req, res, next) {
//   res.header("Access-Control-Allow-Origin", "*");
//   res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");
//   next();
// });
app.use('/public', express.static('public'));
// app.use(express.static(path.join(__dirname, './dist/zoclass')));
// app.use('/',express.static(path.join(__dirname,'./dist/zoclass')));

require('./routes')(app);

// app.get('/*',(req,res) => {
//   res.sendFile(path.join(__dirname ,'./dist/zoclass/index.html'));
// })




// An explicit http.Server instead of app.listen(), because Socket.io has to attach to the
// same server object — sharing the API's port rather than opening a second one.
let port = Number(global.global_config.server.port);
let server = http.createServer(app);

// Phase 7's live layer. initSocketServer never throws: an unconfigured or unreachable Redis
// costs the live nudge and nothing else, and every REST endpoint above keeps working.
const { initSocketServer, closeSocketServer } = require('./modules/sockets/socket-server');
initSocketServer(server);

server.listen(port, function () {
    console.log('server listening on port ' + server.address().port);
});

// --- Graceful shutdown ---------------------------------------------------------------
// New in Phase 7: this process now holds a long-lived Redis SUBSCRIBE connection and a set of
// open websockets, neither of which existed when app.js could just be killed. Mirrors the
// shutdown handler worker.js already has.
let shuttingDown = false;

const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('server shutting down on ' + signal);

    try {
        // Closes io and, with it, the punch subscriber's duplicated Redis connection.
        await closeSocketServer();

        // The SHARED ioredis instance is separate, and this process opens it too — cron
        // enqueues through it and the health endpoint reads queue depth from it. Without this
        // the event loop stays alive on that socket and the process never exits on its own.
        // Required lazily and guarded: queues/connection.js throws when Redis is unconfigured,
        // and a shutdown must not fail just because there was nothing to close.
        try {
            const { connection } = require('./modules/queues/connection');
            await connection.quit();
        } catch (redisError) {
            console.error('redis shutdown skipped', redisError.message);
        }

        // io.close() already closed the HTTP server when a socket server exists; this covers
        // the case where it never started (Redis down, socket init failed).
        server.close(() => process.exit(0));
        // Don't hang forever on a client that refuses to close its keep-alive connection.
        setTimeout(() => process.exit(0), 10000).unref();
    } catch (error) {
        console.error('server shutdown failed', error);
        process.exit(1);
    }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));