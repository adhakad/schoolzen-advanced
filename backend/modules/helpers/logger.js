'use strict';

// Minimal structured logger. The attendance pipeline runs in a worker process with nobody
// watching a UI, so a swallowed error is an invisible error — every catch in this module
// logs through here even when the HTTP response still follows the repo's `catch -> 500`
// convention. Deliberately console-based (no winston/pino): the rest of the codebase logs
// with console, and adding a logging stack is not this phase's job.

const line = (level, event, data) => {
    const payload = { ts: new Date().toISOString(), level, event };
    if (data instanceof Error) {
        payload.error = data.message;
        payload.stack = data.stack;
    } else if (data !== undefined) {
        payload.data = data;
    }
    return payload;
};

const info = (event, data) => console.log(JSON.stringify(line('info', event, data)));
const warn = (event, data) => console.warn(JSON.stringify(line('warn', event, data)));
const error = (event, data) => console.error(JSON.stringify(line('error', event, data)));

module.exports = { info, warn, error };
