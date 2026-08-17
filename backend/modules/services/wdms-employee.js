'use strict';
const axios = require('axios').default;
const { getWdmsToken } = require('./wdms-token');
const { WDMS_BASE_URL, WDMS_DEFAULT_DEPT_ID, WDMS_DEFAULT_POSITION_ID } = process.env;
// WDMS rejects a create with no area, so every employee lands in one default area unless
// the deployment overrides it. Sent as an array — the field is many-to-many WDMS-side.
const WDMS_DEFAULT_AREA_ID = process.env.WDMS_DEFAULT_AREA_ID || '1';

// WDMS caps emp_code at 20 characters. Callers pass the 24-char Mongo personId as the code,
// so it MUST be shortened here or every create/update 400s. Take the LAST 20 rather than the
// first: an ObjectId's leading 8 hex chars are a second-resolution timestamp (near-identical
// across records created the same morning) while the trailing bytes are the random +
// counter portion — keeping the tail is what keeps codes unique. punch-ingest's mapping
// index resolves both this short form and the full personId for the same reason.
const EMP_CODE_MAX = 20;
const toWdmsEmpCode = (code) => String(code == null ? '' : code).trim().slice(-EMP_CODE_MAX);

// WDMS requires first_name; there is no single `name` field on the employee resource. Split
// on the last space so a surname keeps its own field instead of being truncated away, and
// cap each part at the same 20-char limit the rest of the personnel fields use.
const NAME_MAX = 20;
const toWdmsName = (name) => {
    const full = String(name == null ? '' : name).trim();
    const cut = full.lastIndexOf(' ');
    // A blank first_name is still a 400, so fall back to the emp code's placeholder upstream.
    if (cut === -1) return { first_name: full.slice(0, NAME_MAX), last_name: '' };
    return {
        first_name: full.slice(0, cut).slice(0, NAME_MAX),
        last_name: full.slice(cut + 1).slice(0, NAME_MAX),
    };
};

const buildEmployeePayload = (person) => {
    const empCode = toWdmsEmpCode(person.empCode);
    const { first_name, last_name } = toWdmsName(person.name);
    return {
        emp_code: empCode,
        // Names are optional in Schoolzen but required by WDMS — fall back to the code so an
        // unnamed record still registers instead of failing validation.
        first_name: first_name || empCode,
        last_name: last_name,
        card_no: person.cardNo,
        department: WDMS_DEFAULT_DEPT_ID,
        position: WDMS_DEFAULT_POSITION_ID,
        area: [WDMS_DEFAULT_AREA_ID],
    };
};

// person: { name, empCode, cardNo }
const createWdmsEmployee = async (person) => {
    try {
        const token = await getWdmsToken();
        const response = await axios.post(
            `${WDMS_BASE_URL}/personnel/api/employees/`,
            buildEmployeePayload(person),
            { headers: { Authorization: `JWT ${token}` } }
        );
        return response.data;
    } catch (error) {
        console.error('WDMS Create Employee Error:', error.response?.data || error.message);
        throw new Error('WDMS employee create failed');
    }
};

const updateWdmsEmployee = async (wdmsId, person) => {
    try {
        const token = await getWdmsToken();
        const response = await axios.patch(
            `${WDMS_BASE_URL}/personnel/api/employees/${wdmsId}/`,
            buildEmployeePayload(person),
            { headers: { Authorization: `JWT ${token}` } }
        );
        return response.data;
    } catch (error) {
        console.error('WDMS Update Employee Error:', error.response?.data || error.message);
        throw new Error('WDMS employee update failed');
    }
};

module.exports = {
    createWdmsEmployee,
    updateWdmsEmployee,
    toWdmsEmpCode,
};
