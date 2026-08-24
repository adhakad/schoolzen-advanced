const mongoose = require('mongoose');
const mongodbConfig = global.global_config.mongodb;

// Returns the connect promise so callers can chain work that must not run against a
// half-open connection — specifically the startup index sync in helpers/ensure-indexes.js.
// Previously this was fire-and-forget, which is why nothing could ever hook "after connect".
let DbConnect = () => {
    const URI = mongodbConfig.uri;
    mongoose.set('strictQuery', false);

    const db = mongoose.connection;
    db.on('error', console.error.bind(console, 'connection error:'));
    db.once('open', () => {
        console.log('DB connected...');
    });

    return mongoose.connect(URI, { useNewUrlParser: true, useUnifiedTopology: true, });
}

module.exports = { DbConnect };
