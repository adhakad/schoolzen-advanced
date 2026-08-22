'use strict';
const axios = require('axios').default;
const { WDMS_BASE_URL, WDMS_TOKEN, WDMS_USERNAME, WDMS_PASSWORD } = process.env;

// Token-based auth only (per architecture doc §3.1) — no Basic-Auth client.
// Simple in-memory cache with expiry, NOT Redis — Redis is reserved for BullMQ + the
// optional live-status cache (architecture doc §3.4).
let cachedToken = null;
let cachedTokenExpiresAt = 0; // epoch ms
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000; // 23h — refreshed just under WDMS's ~24h token expiry

const fetchDynamicToken = async () => {
    const response = await axios.post(`${WDMS_BASE_URL}/api/jwt-api-token-auth/`, {
        username: WDMS_USERNAME,
        password: WDMS_PASSWORD,
    });
    return response.data.access;
};

// Static WDMS_TOKEN env var wins when set; otherwise fetch+cache a dynamic token.
const getWdmsToken = async () => {
    try {
        if (WDMS_TOKEN) {
            return WDMS_TOKEN;
        }
        const now = Date.now();
        if (cachedToken && now < cachedTokenExpiresAt) {
            return cachedToken;
        }
        const token = await fetchDynamicToken();
        cachedToken = token;
        cachedTokenExpiresAt = now + TOKEN_TTL_MS;
        return cachedToken;
    } catch (error) {
        console.error('WDMS Token Error:', error.response?.data || error.message);
        throw new Error('Unable to obtain WDMS auth token');
    }
};

// Drop the cached token so the next getWdmsToken() re-authenticates.
//
// WDMS can revoke a token long before the 23h TTL above expires — a password change, an admin
// session reset, a WDMS restart. Without this the cache keeps serving the dead token until the
// TTL runs out, which in practice meant restarting the backend by hand. services/wdms-request.js
// calls this on a 401 and retries once.
//
// No-op in effect when WDMS_TOKEN is set: getWdmsToken() returns that static value before it
// ever looks at the cache, so a retry there replays the same token. That is the operator's
// choice and deliberately not worked around.
const clearWdmsToken = () => {
    cachedToken = null;
    cachedTokenExpiresAt = 0;
};

module.exports = {
    getWdmsToken,
    clearWdmsToken,
};
