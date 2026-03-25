'use strict';
const jwt = require('jsonwebtoken')
const { TEACHER_ACCESS_SECRET, TEACHER_REFRESH_SECRET, ACCESS_EXPIRES_IN, REFRESH_EXPIRES_IN } = process.env;
const access_secret = TEACHER_ACCESS_SECRET;
const refresh_secret = TEACHER_REFRESH_SECRET;
const accessExpiresIn = ACCESS_EXPIRES_IN;
const refreshExpiresIn = REFRESH_EXPIRES_IN;

let getAccessToken = (payload) => {
    return new Promise((resolve, reject) => {
        jwt.sign({ payload }, access_secret, { expiresIn: accessExpiresIn }, (err, token) => {
            if (err) reject(err)
            resolve(token)
        })
    })
}

let getRefreshToken = (payload) => {
    return new Promise((resolve, reject) => {
        jwt.sign({ payload }, refresh_secret, { expiresIn: refreshExpiresIn }, (err, token) => {
            if (err) reject(err)
            resolve(token)
        })
    })
}

let verifyAccessToken = (accessToken) => {
    return new Promise((resolve,reject)=>{
        jwt.verify(accessToken,access_secret,(err,decode)=>{
            if(err) reject(err)
            resolve(decode.payload)
        })
    })
}

let verifyRefreshToken = (refreshToken) => {
    return new Promise((resolve,reject)=>{
        jwt.verify(refreshToken,refresh_secret,(err,decode)=>{
            if(err) reject(err)
            resolve(decode.payload)
        })
    })
}

module.exports = {
    getAccessToken,
    getRefreshToken,
    verifyAccessToken,
    verifyRefreshToken
}