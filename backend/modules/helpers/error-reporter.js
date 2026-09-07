'use strict';

// Sentry seam. The error-handling architecture (docs/schoolzen-planning/v1/_core/
// error-handling/README.md) calls for @sentry/node in production, but nothing is installed
// or configured yet — so this is an inert wrapper: it forwards to Sentry only when
// SENTRY_DSN is set AND the package actually resolves, and is a no-op otherwise.
//
// Every call site (currently just modules/middleware/errorHandler.js) is written exactly as
// it would be with Sentry present, so switching it on later is `npm i @sentry/node` plus a
// DSN in .env — no code change.

let sentry = null;

if (process.env.SENTRY_DSN) {
    try {
        // eslint-disable-next-line global-require
        sentry = require('@sentry/node');
        sentry.init({
            dsn: process.env.SENTRY_DSN,
            tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.2)
        });
    } catch (error) {
        // Package not installed — stay a no-op rather than taking the process down over
        // an optional observability dependency.
        sentry = null;
        console.warn('SENTRY_DSN is set but @sentry/node is not installed — error reporting disabled');
    }
}

const isEnabled = () => sentry !== null;

/**
 * @param {Error} error
 * @param {{category?: string, module?: string, requestId?: string}} [tags]
 */
const captureException = (error, tags = {}) => {
    if (!sentry) return;
    sentry.withScope((scope) => {
        if (tags.category) scope.setTag('category', tags.category);
        if (tags.module) scope.setTag('module', tags.module);
        if (tags.requestId) scope.setContext('requestId', { id: tags.requestId });
        sentry.captureException(error);
    });
};

const captureMessage = (message, tags = {}) => {
    if (!sentry) return;
    sentry.withScope((scope) => {
        Object.keys(tags).forEach((key) => scope.setTag(key, tags[key]));
        sentry.captureMessage(message);
    });
};

module.exports = { isEnabled, captureException, captureMessage };
