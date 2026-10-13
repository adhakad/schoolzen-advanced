'use strict';

// The Approvals module's own messages (approvals/errors.md) — wording defined once.
const requestNotFound = () => 'This request no longer exists — it may have been removed.';
const requestNotPending = () => 'This request has already been actioned.';
const cursorInvalid = () => 'This page is out of date — go back to the first page and try again.';

module.exports = {
    requestNotFound,
    requestNotPending,
    cursorInvalid,
};
