'use strict';
const mongoose = require('mongoose');

// Pure rules of the Approvals inbox (approvals.md, errors.md, optimization.md) — no DB.
//
// Every unioned source projects to one common shape and is ordered by the SAME key:
// (createdAt desc, _id desc). Pagination is a keyset cursor on that pair, never skip/limit,
// so a row leaving the Pending queue under someone never shifts the rows they paged past.

const INBOX_STATUSES = Object.freeze(['pending', 'approved', 'rejected']);
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isObjectId = (id) => /^[a-f\d]{24}$/i.test(String(id || ''));

/** Opaque "next page" token for the last row of a page. */
const encodeCursor = (row) => Buffer.from(`${new Date(row.createdAt).getTime()}|${row._id}`).toString('base64url');

/** `{ createdAt: Date, _id: string }`, or null when the token is not one of ours. */
const decodeCursor = (token) => {
    if (!token) return null;
    const [ms, id] = Buffer.from(String(token), 'base64url').toString('utf8').split('|');
    const time = Number(ms);
    if (!Number.isFinite(time) || !/^\d+$/.test(ms || '') || !isObjectId(id)) return null;
    return { createdAt: new Date(time), _id: id };
};

/** Rows strictly after the cursor in (createdAt desc, _id desc) order. */
const cursorMatch = (cursor) => ({
    $or: [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: new mongoose.Types.ObjectId(cursor._id) } },
    ],
});

/** "05 Aug" pieces → "05–06 Aug", "30 Jul–02 Aug", "12 Aug". */
const shortRange = (fromKey, toKey) => {
    const day = (key) => key.slice(8, 10);
    const month = (key) => MONTHS_SHORT[Number(key.slice(5, 7)) - 1];
    if (fromKey === toKey) return `${day(fromKey)} ${month(fromKey)}`;
    if (fromKey.slice(0, 7) === toKey.slice(0, 7)) return `${day(fromKey)}–${day(toKey)} ${month(toKey)}`;
    return `${day(fromKey)} ${month(fromKey)}–${day(toKey)} ${month(toKey)}`;
};

/** The Details cell for a leave row: "Casual Leave · 05–06 Aug (2 days)". */
const leaveDetail = (typeName, fromKey, toKey, days) =>
    `${typeName || 'Leave'} · ${shortRange(fromKey, toKey)} (${days} ${days === 1 ? 'day' : 'days'})`;

/** Name-cell second line: staff code, or "<class tag> · Student". */
const personCode = (personType, person) => {
    if (personType === 'staff') return (person && (person.code || person.sub)) || 'Staff';
    return [person && person.sub, 'Student'].filter(Boolean).join(' · ');
};

/**
 * A source module's own "gone" / "already actioned" codes → the inbox's two stable codes
 * (errors.md shapes 4 + 5). Anything else is the source's own message and passes through.
 */
const mapSourceCode = (code, codeMap) => (codeMap && codeMap[code]) || null;

module.exports = {
    INBOX_STATUSES,
    isObjectId,
    encodeCursor,
    decodeCursor,
    cursorMatch,
    shortRange,
    leaveDetail,
    personCode,
    mapSourceCode,
};
