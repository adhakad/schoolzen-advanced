'use strict';
const axios = require('axios').default;
const { withWdmsAuthRetry } = require('./wdms-request');
const logger = require('../helpers/logger');
const { WDMS_BASE_URL } = process.env;

// Same guard wdms-transaction.js carries: a malformed or self-referential `next` would
// otherwise spin this loop forever. A fleet large enough to hit 500 pages does not exist.
const MAX_PAGES = 500;

// Paginated GET /iclock/api/terminals/ — follows the DRF-style `next` link until
// exhausted. Field names in the response are mapped defensively in the controller
// (`sn`/`serial_number`, etc.) since the exact WDMS terminal serializer wasn't verified
// against a live instance during implementation.
const fetchAllWdmsTerminals = async () => {
    try {
        let terminals = [];
        let url = `${WDMS_BASE_URL}/iclock/api/terminals/`;
        let pages = 0;
        while (url && pages < MAX_PAGES) {
            // Per page, so a token that expires mid-fetch costs one retry rather than the
            // whole pull — see the same note in wdms-transaction.js.
            const pageUrl = url;
            const response = await withWdmsAuthRetry((token) => axios.get(pageUrl, {
                headers: { Authorization: `JWT ${token}` },
            }));
            const page = response.data.data || response.data.results || [];
            terminals = terminals.concat(page);
            url = response.data.next || null;
            pages += 1;
        }
        if (pages >= MAX_PAGES) {
            logger.warn('wdms-device.pageLimitHit', { pages });
        }
        return terminals;
    } catch (error) {
        console.error('WDMS Fetch Terminals Error:', error.response?.data || error.message);
        throw new Error('Unable to fetch WDMS terminals');
    }
};

module.exports = {
    fetchAllWdmsTerminals,
};
