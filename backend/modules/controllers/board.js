'use strict';
const BoardModel = require('../models/board');

let GetAllBoard = async(req,res,next) => {
    try{
        const boardList = await BoardModel.find({});
        return res.status(200).json(boardList);
    }catch(error){
        return res.status(500).json('Internal Server Error !');
    }  
}

module.exports = {
    GetAllBoard
}