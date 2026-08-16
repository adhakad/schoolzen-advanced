/**
 * Global configuration for running server will reside here
 * ALL DB configuration, S3, and other apis calling url
 * along with their host name and port should reside here.
 *
 * This app server will get started from server/app.json file when required parameters can be
 * altered based on environment.
 */
const { PORT, BASE_URL, DB_URL, REDIS_URL, WDMS_COMPANY_UUID} = process.env;
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
};

module.exports = config;