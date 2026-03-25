'use strict';
const ClassModel = require('../models/class');

let countClass = async(req,res,next) => {
    let countClass = await ClassModel.count();
    return res.status(200).json({countClass});
}

let GetClassPagination = async(req,res,next) => {
    let searchText = req.body.filters.searchText;
    if(searchText=='NURSERY' || searchText=='Nursery' || searchText=='nursery'){
        searchText = 200;
    }
    if(searchText=='LKG' || searchText=='lkg' || searchText=='Lkg'){
        searchText = 201;
    }
    if(searchText=='UKG' || searchText=='ukg' || searchText=='Ukg'){
        searchText = 202;
    }
    let searchObj = {};
    if (searchText) {
        searchObj = /^(?:\d*\.\d{1,2}|\d+)$/.test(searchText)
          ? {
              $or: [{ class: searchText }],
            }
          : { name: new RegExp(`${searchText.toString().trim()}`, 'i') };
      }

    try {
      let limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
      let page = req.body.page || 1;
        const classList = await ClassModel.find(searchObj).sort({ _id: -1 })
          .limit(limit * 1)
          .skip((page - 1) * limit)
          .exec();
        const countClass = await ClassModel.count();
        
        let classData = { countClass: 0 };
        classData.classList = classList;
        classData.countClass = countClass;
        return res.json(classData);
    } catch (error) {
        return res.status(500).json( 'Internal Server Error !' );;
    }
}

let GetAllClass = async(req,res,next) => {
    try{
        const classList = await ClassModel.find({});
        return res.status(200).json(classList);
    }catch(error){
        return res.status(500).json( 'Internal Server Error !' );
    }
}
let GetSingleClass = async(req,res,next) => {
    try{
        const singleClass = await ClassModel.findOne({_id:req.params.id});
        return res.status(200).json(singleClass);
    }catch(error){
        return res.status(500).json( 'Internal Server Error !' );
    }
}
let CreateClass = async(req,res,next) => {
    try{
        const singleClass = await ClassModel.findOne({class:req.body.class});
        if(singleClass){
         return res.status(400).json('Class already exist !');
        }
        const countClass = await ClassModel.count();
        if(countClass == 15){
            return res.status(400).json("Class limit is over !")
        }
        const addClass = {
            class:req.body.class,
        }
        
        const data = await ClassModel.create(addClass);
        return res.status(200).json('Class Created successfully.');
    }catch(error){
         return res.status(500).json( 'Internal Server Error !' );
    }
}
let UpdateClass = async(req,res,next) => {
    try{
        const id = req.params.id;
        const classData = {
            class:req.body.class
        }
        const update = await ClassModel.findByIdAndUpdate(id,{$set:classData}, {new:true});
        return res.status(200).json('Class update successfully.');
    }catch(error){
        return res.status(500).json( 'Internal Server Error !' );;
    }
}
let DeleteClass = async(req,res,next) => {
    try{
        const id = req.params.id;
        const dlt = await ClassModel.findByIdAndRemove(id);
        return res.status(200).json('Class delete successfully.');
    }catch(error){
        return res.status(500).json( 'Internal Server Error !' );
    }


}

module.exports = {
    countClass,
    GetClassPagination,
    GetAllClass,
    GetSingleClass,
    CreateClass,
    UpdateClass,
    DeleteClass,
}