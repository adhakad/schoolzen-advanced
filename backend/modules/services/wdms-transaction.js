'use strict';
const axios = require('axios').default;
const { getWdmsToken } = require('./wdms-token');
const logger = require('../helpers/logger');
const { WDMS_BASE_URL, WDMS_COMPANY_UUID } = process.env;

// Punch/transaction client. Same shape as wdms-device.js's fetchAllWdmsTerminals():
// token-based auth only, `Authorization: JWT <token>` (NOT Bearer — WDMS is Django REST
// Framework with SimpleJWT), and pagination followed via the absolute `next` URL until
// exhausted. Never assume a single page: a 2000-student school can push thousands of
// punches through the 8-10am window.

const PAGE_SIZE = 500;
// A very large school-day still terminates: guards against a malformed `next` that loops.
const MAX_PAGES = 500;

/**
 * All WDMS transactions in a time window, optionally narrowed to one terminal.
 * @param {Object} args
 * @param {String} args.startTime "YYYY-MM-DD HH:mm:ss"
 * @param {String} args.endTime   "YYYY-MM-DD HH:mm:ss"
 * @param {String[]} [args.terminalSns] restrict to these terminals (a school's own devices)
 * @returns {Promise<Array>} raw WDMS transaction objects
 */
const fetchWdmsTransactions = async ({ startTime, endTime, terminalSns }) => {
    const token = await getWdmsToken();

    const params = {
        page_size: PAGE_SIZE,
        start_time: startTime,
        end_time: endTime,
    };
    // Optional by design: blank means "no company filter", which is what a local or
    // single-tenant WDMS wants. Only sent when actually configured.
    if (WDMS_COMPANY_UUID) {
        params.company = WDMS_COMPANY_UUID;
    }
    if (Array.isArray(terminalSns) && terminalSns.length > 0) {
        params.terminal_sn = terminalSns.join(',');
    }

    let transactions = [];
    let url = `${WDMS_BASE_URL}/iclock/api/transactions/`;
    let pages = 0;
    // Query params only ride on the FIRST request — `next` already carries them.
    let requestParams = params;

    while (url && pages < MAX_PAGES) {
        const response = await axios.get(url, {
            params: requestParams,
            headers: { Authorization: `JWT ${token}` },
        });
        const page = response.data.data || response.data.results || [];
        transactions = transactions.concat(page);
        url = response.data.next || null;
        requestParams = undefined;
        pages += 1;
    }

    if (pages >= MAX_PAGES) {
        logger.warn('wdms-transaction.pageLimitHit', { pages, startTime, endTime });
    }

    return transactions;
};

module.exports = { fetchWdmsTransactions };
