'use strict'
require('dotenv').config()
const constant = "./config/config.js";
global.global_config = require(constant);

const express = require('express');
const app = express();
const { DbConnect } = require('./modules/helpers/database');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require("cookie-parser");
const path = require('path');
require('./cron-job');

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());
app.use(cors());
DbConnect();
// app.use(function (req, res, next) {
//   res.header("Access-Control-Allow-Origin", "*");
//   res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");
//   next();
// });
app.use('/public', express.static('public'));
// app.use(express.static(path.join(__dirname, './dist/zoclass')));
// app.use('/',express.static(path.join(__dirname,'./dist/zoclass')));

require('./routes')(app);

// app.get('/*',(req,res) => {
//   res.sendFile(path.join(__dirname ,'./dist/zoclass/index.html'));
// })




let port = Number(global.global_config.server.port);
let server = app.listen(port, function () {
    console.log('server listening on port ' + server.address().port);
});