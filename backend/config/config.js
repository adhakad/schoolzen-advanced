/**
 * Global configuration for running server will reside here
 * ALL DB configuration, S3, and other apis calling url
 * along with their host name and port should reside here.
 *
 * This app server will get started from server/app.json file when required parameters can be
 * altered based on environment.
 */
const { PORT, BASE_URL, DB_URL, REDIS_URL, WDMS_COMPANY_UUID, SKIP_INDEX_SYNC } = process.env;
var config = {
    /**
     * server configuration
     */
    server: {
        port: PORT,
        networkCallTimeout: 30000,
    },
    baseUrl: BASE_URL,
    /**
     * DB configuration
     */
    mongodb: {
        uri: DB_URL,
    },
    /**
     * Redis — used ONLY as the BullMQ backing store and the fast-path punch pub/sub
     * channel (architecture doc 3.4). Not a general cache, not a session/token store.
     */
    redis: {
        url: REDIS_URL,
    },
    /**
     * WDMS — single cloud instance. companyUuid is optional: when blank the client
     * sends no company filter at all, which is what a local/single-tenant WDMS wants.
     */
    wdms: {
        companyUuid: WDMS_COMPANY_UUID || '',
    },
    /**
     * Startup index sync (helpers/ensure-indexes.js). On by default — it is what keeps the
     * declared indexes and the real ones from drifting apart. Set SKIP_INDEX_SYNC=true only
     * to hold indexes still during a migration window, since syncIndexes() also DROPS any
     * index a schema no longer declares.
     */
    indexes: {
        skipSync: String(SKIP_INDEX_SYNC || '').toLowerCase() === 'true',
    },
};

module.exports = config;