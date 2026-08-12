'use strict';
const axios = require('axios').default;
const { getWdmsToken } = require('./wdms-token');
const { WDMS_BASE_URL, WDMS_DEFAULT_DEPT_ID, WDMS_DEFAULT_POSITION_ID } = process.env;

// person: { name, empCode, cardNo }
const createWdmsEmployee = async (person) => {
    try {
        const token = await getWdmsToken();
        const response = await axios.post(
            `${WDMS_BASE_URL}/personnel/api/employees/`,
            {
                name: person.name,
                emp_code: person.empCode,
                card_no: person.cardNo,
                department: WDMS_DEFAULT_DEPT_ID,
                position: WDMS_DEFAULT_POSITION_ID,
            },
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
            {
                name: person.name,
                emp_code: person.empCode,
                card_no: person.cardNo,
                department: WDMS_DEFAULT_DEPT_ID,
                position: WDMS_DEFAULT_POSITION_ID,
            },
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
};
