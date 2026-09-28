'use strict';

// THE academic-session label format for every v2 module: the full "2026-2027", start year
// then end year.
//
// This is the format the live system already stores — services/cron-session-service.js
// writes `${currentYear}-${currentYear + 1}` into the AcademicSession document — so v2 must
// read and write exactly that. A shortened "2026-27" is never produced or accepted: a
// session string is a join key (enrollments, fee records, leave limits, payroll all key on
// it), and two spellings of one year would silently split its data in two.
//
// Settings → Academic Sessions, Leave, Payroll and every later module validate and build
// session labels through this file rather than re-deriving the rule.

const SESSION_PATTERN = /^(\d{4})-(\d{4})$/;
const SESSION_EXAMPLE = '2026-2027';

/** "2026-2027" for a session starting in 2026. */
const formatSession = (startYear) => `${startYear}-${Number(startYear) + 1}`;

/** { startYear, endYear } for a valid label, else null — end must be exactly start + 1. */
const parseSession = (label) => {
    const match = SESSION_PATTERN.exec(String(label || '').trim());
    if (!match) return null;
    const startYear = Number(match[1]);
    const endYear = Number(match[2]);
    return endYear === startYear + 1 ? { startYear, endYear } : null;
};

const isValidSession = (label) => parseSession(label) !== null;

/** The session after `label` ("2026-2027" → "2027-2028"), or null for an invalid label. */
const nextSessionLabel = (label) => {
    const parsed = parseSession(label);
    return parsed ? formatSession(parsed.startYear + 1) : null;
};

module.exports = {
    SESSION_PATTERN,
    SESSION_EXAMPLE,
    formatSession,
    parseSession,
    isValidSession,
    nextSessionLabel,
};
