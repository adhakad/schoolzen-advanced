'use strict';
const axios = require('axios').default;
const { getWdmsToken } = require('./wdms-token');
const { WDMS_BASE_URL, WDMS_DEFAULT_DEPT_ID, WDMS_DEFAULT_POSITION_ID } = process.env;
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

const buildEmployeePayload = (person) => {
    const empCode = toWdmsEmpCode(person.empCode);
    const { first_name, last_name } = toWdmsName(person.name);
    return {
        emp_code: empCode,
        first_name: first_name || empCode,
        last_name: last_name,
        // WDMS expects card_no as integer, not string
        card_no: person.cardNo ? parseInt(person.cardNo, 10) : null,
        department: WDMS_DEFAULT_DEPT_ID,
        position: WDMS_DEFAULT_POSITION_ID,
        area: [WDMS_DEFAULT_AREA_ID],
    };
};

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