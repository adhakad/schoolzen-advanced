'use strict';
const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');

// `Server-Timing` on every response (attendance-fix3.md C): the server-side time, measured on
// the API process itself, so a slow page can be split into "server" vs "network" (the dev
// machine's ~80 ms round trip to the remote cluster inflates every browser number).
//   total;dur=…   the whole handler, request in → headers out
//   db;desc="N"   how many MongoDB round trips the request made (counted via mongoose debug)
//   <name>;dur=…  stages a handler marks with res.locals.timing.mark('<name>')
// Timing-Allow-Origin lets the frontend (another origin) read it from the Performance API.

const store = new AsyncLocalStorage();
mongoose.set('debug', () => {
    const timing = store.getStore();
    if (timing) timing.db += 1;
});

module.exports = (req, res, next) => {
    const start = process.hrtime.bigint();
    const ms = () => Number(process.hrtime.bigint() - start) / 1e6;
    const timing = { db: 0, marks: [], mark: (name) => timing.marks.push(`${name};dur=${ms().toFixed(1)}`) };
    res.locals.timing = timing;

    const writeHead = res.writeHead;
    res.writeHead = function (...args) {
        if (!res.headersSent) {
            res.setHeader('Server-Timing', [`total;dur=${ms().toFixed(1)}`, `db;desc="${timing.db}"`, ...timing.marks].join(', '));
            res.setHeader('Timing-Allow-Origin', '*');
        }
        return writeHead.apply(this, args);
    };
    store.run(timing, next);
};
