'use strict';
const { getWdmsToken, clearWdmsToken } = require('./wdms-token');

// One retry on a 401, shared by every WDMS call site.
//
// services/wdms-token.js caches a dynamic token for 23h, but WDMS can revoke one well before
// that — a password change, an admin session reset, a WDMS restart. Every call then fails with
// a 401 until the cache expires, which in practice meant restarting the backend by hand.
//
// The request is passed in as a FUNCTION OF THE TOKEN rather than a ready-made axios call, so
// the retry re-signs with the fresh token instead of replaying the dead header. Callers keep
// their own try/catch: this wrapper only decides whether to try a second time, never how to
// report a failure.

/**
 * Run a WDMS request, re-authenticating and retrying once on a 401.
 *
 * @param {(token: String) => Promise<any>} run receives the token, returns the axios promise
 * @returns {Promise<any>} whatever `run` resolves to
 */
const withWdmsAuthRetry = async (run) => {
    const token = await getWdmsToken();
    try {
        return await run(token);
    } catch (error) {
        // Anything that is not an expired/invalid token is the caller's problem, not ours —
        // a 404, a 400 on a bad payload, a network error all pass straight through.
        if (!error || !error.response || error.response.status !== 401) throw error;

        clearWdmsToken();
        const freshToken = await getWdmsToken();
        // A second 401 propagates. Retrying again would just be a slower way to fail: the
        // credentials themselves are wrong, not the cached token.
        return await run(freshToken);
    }
};

module.exports = { withWdmsAuthRetry };
