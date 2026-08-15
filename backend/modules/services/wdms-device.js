'use strict';
const axios = require('axios').default;
const { getWdmsToken } = require('./wdms-token');
const { WDMS_BASE_URL } = process.env;

// Paginated GET /iclock/api/terminals/ — follows the DRF-style `next` link until
// exhausted. Field names in the response are mapped defensively in the controller
// (`sn`/`serial_number`, etc.) since the exact WDMS terminal serializer wasn't verified
// against a live instance during implementation.
const fetchAllWdmsTerminals = async () => {
    try {
        const token = await getWdmsToken();
        let terminals = [];
        let url = `${WDMS_BASE_URL}/iclock/api/terminals/`;
        while (url) {
            const response = await axios.get(url, { headers: { Authorization: `JWT ${token}` } });
            const page = response.data.data || response.data.results || [];
            terminals = terminals.concat(page);
            url = response.data.next || null;
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
