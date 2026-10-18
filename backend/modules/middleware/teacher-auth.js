'use strict';
const tokenService = require('../services/teacher-token');
const jwt = require('jsonwebtoken')

// A missing, expired or invalid access token is a 401 — the ONLY status the frontend's
// TokenRefreshInterceptor refreshes on. 403 is reserved for permission / business refusals.
module.exports.isTeacherAuth = async (req,res,next) =>{
    try{
        let isHeader = req.headers.authorization;
        if(!isHeader) return res.status(401).send('Token Unavailable')
        const token = isHeader.split(' ')[1]
        req.user = await tokenService.verifyAccessToken(token)
        next()
    }catch(err){
        if(err instanceof jwt.JsonWebTokenError) // TokenExpiredError is a subclass
            return res.status(401).send(err)
        console.log(err.message)
        res.status(500).send('Internal Server Error')
    }
}
