'use strict';
const AcademicSessionModel = require('../models/academic-session');

let GetAcademicSession = async (req, res, next) => {
    try{
        const singleAcademicSession = await AcademicSessionModel.findOne({});
        return res.status(200).json(singleAcademicSession);
    }catch(error){
        return res.status(500).json( 'Internal Server Error!' );
    }
}

module.exports = {
    GetAcademicSession
}