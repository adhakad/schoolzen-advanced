'use strict';
const tokenService = require('../services/sales-token');
const jwt = require('jsonwebtoken')


module.exports.isSalesAuth = async (req,res,next) =>{
    try{
        let isHeader = req.headers.authorization;
        if(isHeader){
            const token = isHeader.split(' ')[1]
            req.user = await tokenService.verifyAccessToken(token)
            next()
        }
        else{
            res.status(403).send('Token Unavailable')
        }
    }catch(err){
        console.log(err.message)
        if(err instanceof jwt.TokenExpiredError)
            res.status(403).send(err)
        res.status(500).send('Internal Server Error')
    }
}
