'use strict';
const axios = require('axios').default;
const { withWdmsAuthRetry } = require('./wdms-request');
const { WDMS_BASE_URL, WDMS_DEFAULT_DEPT_ID, WDMS_DEFAULT_POSITION_ID, WDMS_RESYNC_PATH } = process.env;
const WDMS_DEFAULT_AREA_ID = process.env.WDMS_DEFAULT_AREA_ID || '1';

const EMP_CODE_MAX = 20;
const toWdmsEmpCode = (code) => String(code == null ? '' : code).trim().slice(-EMP_CODE_MAX);

const NAME_MAX = 20;
const toWdmsName = (name) => {
    const full = String(name == null ? '' : name).trim();
    const cut = full.lastIndexOf(' ');
    if (cut === -1) return { first_name: full.slice(0, NAME_MAX), last_name: '' };
    return {
        first_name: full.slice(0, cut).slice(0, NAME_MAX),
        last_name: full.slice(cut + 1).slice(0, NAME_MAX),
    };
};

// 4 = Card Only. Mirrors the default on models/biometric-mapping.js so a mapping written
// before verifyMode existed still pushes a sane value rather than an undefined one.
const DEFAULT_VERIFY_MODE = 4;

const buildEmployeePayload = (person) => {
    const empCode = toWdmsEmpCode(person.empCode);
    const { first_name, last_name } = toWdmsName(person.name);
    return {
        emp_code: empCode,
        first_name: first_name || empCode,
        last_name: last_name,
        // WDMS expects card_no as integer, not string
        card_no: person.cardNo ? parseInt(person.cardNo, 10) : null,
        // How the terminal may identify this person. `!= null` rather than truthiness —
        // verify_mode 0 (Auto) is a real setting and must not fall through to the default.
        verify_mode: person.verifyMode != null ? Number(person.verifyMode) : DEFAULT_VERIFY_MODE,
        department: WDMS_DEFAULT_DEPT_ID,
        position: WDMS_DEFAULT_POSITION_ID,
        area: [WDMS_DEFAULT_AREA_ID],
    };
};

const createWdmsEmployee = async (person) => {
    try {
        const response = await withWdmsAuthRetry((token) => axios.post(
            `${WDMS_BASE_URL}/personnel/api/employees/`,
            buildEmployeePayload(person),
            { headers: { Authorization: `JWT ${token}` } }
        ));
        return response.data;
    } catch (error) {
        console.error('WDMS Create Employee Error:', error.response?.data || error.message);
        throw new Error('WDMS employee create failed');
    }
};

const updateWdmsEmployee = async (wdmsId, person) => {
    try {
        const response = await withWdmsAuthRetry((token) => axios.patch(
            `${WDMS_BASE_URL}/personnel/api/employees/${wdmsId}/`,
            buildEmployeePayload(person),
            { headers: { Authorization: `JWT ${token}` } }
        ));
        return response.data;
    } catch (error) {
        console.error('WDMS Update Employee Error:', error.response?.data || error.message);
        throw new Error('WDMS employee update failed');
    }
};

/**
 * Push the employee list down to the terminals.
 *
 * Creating or updating an employee in WDMS only changes WDMS's own database. Until the
 * terminal pulls that change it still has the old card number and the old verify mode, so
 * a freshly-issued card is rejected at the door. This is the "and now actually tell the
 * machine" step.
 *
 * UNVERIFIED ENDPOINT. There is no WDMS API manual in this repo and no prior code that
 * calls a resync, so the path is a best guess behind WDMS_RESYNC_PATH — point that env var
 * at the real one once it is known. That is survivable precisely because this function is
 * best-effort: it NEVER throws and never affects the caller's own success.
 *
 * @param {String[]} [terminalSns] restrict to a school's own terminals; omitted means all
 * @returns {Promise<Boolean>} true if WDMS accepted the request
 */
const resyncWdmsDevices = async (terminalSns) => {
    try {
        const path = WDMS_RESYNC_PATH || '/iclock/api/terminals/resync_data/';
        const body = (Array.isArray(terminalSns) && terminalSns.length > 0)
            ? { sns: terminalSns }
            : {};
        await withWdmsAuthRetry((token) => axios.post(`${WDMS_BASE_URL}${path}`, body, {
            headers: { Authorization: `JWT ${token}` },
        }));
        return true;
    } catch (error) {
        // Logged, never rethrown. A device that has not caught up yet is a delay; failing
        // the Schoolzen save over it would be a data-loss bug.
        console.error('WDMS Device Resync Error:', error.response?.data || error.message);
        return false;
    }
};

module.exports = {
    createWdmsEmployee,
    updateWdmsEmployee,
    resyncWdmsDevices,
    toWdmsEmpCode,
};