'use strict';

// Settings → School Profile (settings/school-profile.md): THE board and state lists.
// One file for both sides: the backend validates against it and GET /school-profile sends it
// to the page, so the dropdown can never offer a value the server would refuse.
//
// Labels are copied verbatim from school-profile.html. The legacy `boards` collection was read
// ONCE while writing this file (shared-fix6 B.1, 2026-11-12) and merged here — nothing reads it
// at runtime. Its six rows all map to an entry below, so nothing new had to be added:
//   CBSE -> CBSE, CISCE -> CISCE, MP Board -> MPBSE, Rajasthan Board -> RBSE,
//   UP Board -> UPMSP, Chhattisgarh Board -> CGBSE.

const BOARD_GROUPS = Object.freeze([
    {
        label: 'National',
        boards: [
            'Central Board of Secondary Education (CBSE)',
            'Council for the Indian School Certificate Examinations (CISCE)',
            'National Institute of Open Schooling (NIOS)',
            'International Baccalaureate (IB)',
        ],
    },
    {
        label: 'District affiliated (State, up to Class 8)',
        boards: ['District Education Office, State (up to Class 8) (DEO)'],
    },
    {
        label: 'State boards (A to Z by state)',
        boards: [
            'Andhra Pradesh Board of Secondary Education (BSEAP)',
            'Board of Intermediate Education, Andhra Pradesh (BIEAP)',
            'Board of Secondary Education, Assam (SEBA)',
            'Assam Higher Secondary Education Council (AHSEC)',
            'Bihar School Examination Board (BSEB)',
            'Chhattisgarh Board of Secondary Education (CGBSE)',
            'Goa Board of Secondary and Higher Secondary Education (GBSHSE)',
            'Gujarat Secondary and Higher Secondary Education Board (GSEB)',
            'Haryana Board of School Education (HBSE)',
            'Himachal Pradesh Board of School Education (HPBOSE)',
            'Jammu and Kashmir State Board of School Education (JKBOSE)',
            'Jharkhand Academic Council (JAC)',
            'Karnataka Secondary Education Examination Board (KSEEB)',
            'Department of Pre-University Education, Karnataka (DPUE)',
            'Kerala Board of Public Examination (KBPE)',
            'Directorate of General Education, Higher Secondary Wing, Kerala (DGE Kerala)',
            'Madhya Pradesh Board of Secondary Education (MPBSE)',
            'Maharashtra State Board of Secondary and Higher Secondary Education (MSBSHSE)',
            'Board of Secondary Education, Manipur (BSEM)',
            'Council of Higher Secondary Education, Manipur (COHSEM)',
            'Meghalaya Board of School Education (MBOSE)',
            'Mizoram Board of School Education (MBSE)',
            'Nagaland Board of School Education (NBSE)',
            'Board of Secondary Education, Odisha (BSE Odisha)',
            'Council of Higher Secondary Education, Odisha (CHSE Odisha)',
            'Punjab School Education Board (PSEB)',
            'Board of Secondary Education, Rajasthan (RBSE)',
            'Directorate of Government Examinations, Tamil Nadu (DGE TN)',
            'Board of Secondary Education, Telangana State (BSE TS)',
            'Telangana State Board of Intermediate Education (TSBIE)',
            'Tripura Board of Secondary Education (TBSE)',
            'Uttar Pradesh Madhyamik Shiksha Parishad (UPMSP)',
            'Uttarakhand Board of School Education (UBSE)',
            'West Bengal Board of Secondary Education (WBBSE)',
            'West Bengal Council of Higher Secondary Education (WBCHSE)',
        ],
    },
]);

const BOARDS = Object.freeze(BOARD_GROUPS.flatMap((g) => g.boards));

// 28 states, then the 8 UTs — the html's order.
const STATES = Object.freeze([
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
    'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
    'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
    'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
]);

const MEDIUMS = Object.freeze(['English', 'Hindi', 'Hindi & English']);

/** "Central Board of Secondary Education (CBSE)" -> "CBSE" (the preview's rule). */
const boardShort = (board) => {
    const m = String(board || '').match(/\(([^)]+)\)$/);
    return m ? m[1] : String(board || '');
};

/**
 * The letterhead text lines — the SAME rules as the page's live preview
 * (school-profile.html refresh()): sub line under the name, then address, then contact.
 */
const letterheadLines = (p) => {
    const sub = [
        p.board ? boardShort(p.board) : '',
        p.affiliationNumber ? `Affil./Recog. No. ${p.affiliationNumber}` : '',
        p.schoolCode ? `School Code ${p.schoolCode}` : '',
    ].filter(Boolean).join(' · ');
    const address = [p.street, p.city, p.district !== p.city ? p.district : '', p.state].filter(Boolean).join(', ')
        + (p.pinCode ? ` - ${p.pinCode}` : '');
    const contact = [p.phoneOne, p.email].filter(Boolean).join(' · ');
    return { sub, address, contact };
};

module.exports = { BOARD_GROUPS, BOARDS, STATES, MEDIUMS, boardShort, letterheadLines };
