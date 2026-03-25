/**
 * Global configuration for running server will reside here
 * ALL DB configuration, S3, and other apis calling url
 * along with their host name and port should reside here.
 *
 * This app server will get started from server/app.json file when required parameters can be
 * altered based on environment.
 */
const { PORT, BASE_URL, DB_URL} = process.env;
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
};

module.exports = config;