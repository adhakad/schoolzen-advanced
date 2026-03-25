'use strict';
const fs = require('fs');
const TopperModel = require('../models/topper');

let countTopper = async(req,res,next) => {
    let countTopper = await TopperModel.count();
    return res.status(200).json({countTopper});
}
let GetTopperPagination = async(req,res,next) => {
    let searchText = req.body.filters.searchText;
    let searchObj = {};
    if (searchText) {
        searchObj = /^(?:\d*\.\d{1,2}|\d+)$/.test(searchText)
          ? {
              $or: [{ discount: searchText }, { price: searchText }],
            }
          : { name: new RegExp(`${searchText.toString().trim()}`, 'i') };
      }

    try {
      let limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
      let page = req.body.page || 1;
        const topperList = await TopperModel.find(searchObj).sort({ _id: -1 })
          .limit(limit * 1)
          .skip((page - 1) * limit)
          .exec();
        const countTopper = await TopperModel.count();
        
        let topperData = { countTopper: 0 };
        topperData.topperList = topperList;
        topperData.countTopper = countTopper;
        return res.json(topperData);
    } catch (error) {
        return res.status(500).json('Internal Server Error !');
    }
}
let GetAllTopper = async(req,res,next) => {
    try{
        const topperList = await TopperModel.find({});
        return res.status(200).json(topperList);
    }catch(error){
        return res.status(500).json('Internal Server Error !');
    }  
}
let GetSingleTopper = async(req,res,next) => {
    try{
        const singleTopper = await TopperModel.find({});
        return res.status(200).json(singleTopper);
    }catch(error){
        return res.status(500).json('Internal Server Error !');
    }
}
let CreateTopper = async(req,res,next) => {
    const {name,percentile,year} = req.body;
    const topperData = {
        name:name,
        class:req.body.class,
        percentile:percentile,
        year:year,
        image:req.file.filename,
    }
    try{
        if(percentile > 100){
            return res.status(400).json("Topper percentile is not possible to greater then 100% !")
        }
        if(percentile < 60){
            return res.status(400).json("Topper percentile is not possible to less then 60% !")
        }
        const countTopper = await TopperModel.count();
        if(countTopper == 15){
            return res.status(400).json("Topper limit is over to 15 !");
        }
        const createTopper = await TopperModel.create(topperData);
        return res.status(200).json('Topper create successfully.');
    }catch(error){
        return res.status(500).json('Internal Server Error !');
    }
}
let UpdateTopper = async(req,res,next) => {
    try{
        const id = req.params.id;
        const topperData = {
            name:req.body.name,
            class:req.body.class,
            percentile:req.body.percentile,
            year:req.body.year,
        }
        const updateTopper = await TopperModel.findByIdAndUpdate(id,{$set:topperData},{new:true});
        return res.status(200).json('Topper update successfully.');
    }catch(error){
        return res.status(500).json('Internal Server Error !');
    }
}
let DeleteTopper = async(req,res,next) => {
    try{
        const id = req.params.id;
        const singleTopper = await TopperModel.findOne({_id:id});
        const singleImage = singleTopper.image;
        await fs.unlinkSync('./public/topper-image/'+singleImage);
        const deleteTopper = await TopperModel.findByIdAndRemove(id);
        return res.status(200).json('Topper delete successfully.');
    }catch(error){
        return res.status(500).json('Internal Server Error !');
    }
}

module.exports = {
    countTopper,
    GetTopperPagination,
    GetAllTopper,
    GetSingleTopper,
    CreateTopper,
    UpdateTopper,
    DeleteTopper,
}