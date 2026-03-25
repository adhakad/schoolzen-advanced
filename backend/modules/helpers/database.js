const mongoose = require('mongoose');
const mongodbConfig = global.global_config.mongodb;

let DbConnect = () => {
    const URI = mongodbConfig.uri;
    mongoose.set('strictQuery', false);
    mongoose.connect(URI, { useNewUrlParser: true, useUnifiedTopology: true, })

    const db = mongoose.connection;
    db.on('error', console.error.bind(console, 'connection error:'));
    db.once('open', () => {
        console.log('DB connected...');
    });
}

module.exports = { DbConnect };