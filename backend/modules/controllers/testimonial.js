'use strict';
const fs = require('fs');
const TestimonialModel = require('../models/testimonial');

let countTestimonial = async(req,res,next) => {
    let countTestimonial = await TestimonialModel.count();
    return res.status(200).json({countTestimonial});
}
let GetTestimonialPagination = async(req,res,next) => {
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
        const testimonialList = await TestimonialModel.find(searchObj).sort({ _id: -1 })
          .limit(limit * 1)
          .skip((page - 1) * limit)
          .exec();
        const countTestimonial = await TestimonialModel.count();
        
        let testimonialData = { countTestimonial: 0 };
        testimonialData.testimonialList = testimonialList;
        testimonialData.countTestimonial = countTestimonial;
        return res.json(testimonialData);
    } catch (error) {
        return res.status(500).json('Internal Server Error !');
    }
}
let GetAllTestimonial = async(req,res,next) => {
    try{
        const testimonialList = await TestimonialModel.find({});
        return res.status(200).json(testimonialList);
    }catch(error){
        return res.status(500).json('Internal Server Error !');
    }  
}
let GetSingleTestimonial = async(req,res,next) => {
    try{
        const singleTestimonial = await TestimonialModel.findOne({_id:req.params.id});
        return res.status(200).json(singleTestimonial);
    }catch(error){
        return res.status(500).json('Internal Server Error !');
    }
}
let CreateTestimonial = async(req,res,next) => {
    const {name,role,desc} = req.body;
    const testimonialData = {
        name:name,
        role:role,
        desc:desc,
        image:req.file.filename,
    }
    try{
        const countTestimonial = await TestimonialModel.count();
        if(countTestimonial==15){
            return res.status(400).json("Testimonial limit is over to 15 !");
        }
        const checkName = await TestimonialModel.findOne({name:name,role:role});
        if(checkName){
            return res.status(400).json(`Name already exist on ${role} role !`)
        }
        const checkDesc = await TestimonialModel.findOne({desc:desc});
        if(checkDesc){
            return res.status(400).json("Testimonial description already exist !")
        }
        const createTestimonial = await TestimonialModel.create(testimonialData);
        return res.status(200).json('Testimonial created successfully.');
    }catch(error){
        return res.status(500).json('Internal Server Error !');
    }
}
let UpdateTestimonial = async(req,res,next) => {
    try{
        const id = req.params.id;
        const testimonialData = {
            name:req.body.name,
            role:req.body.role,
            desc:req.body.desc,
        }
        const updateTestimonial = await TestimonialModel.findByIdAndUpdate(id,{$set:testimonialData},{new:true});
        return res.status(200).json('Testimonial update successfully.');
    }catch(error){
        return res.status(500).json('Internal Server Error !');
    }
}
let DeleteTestimonial = async(req,res,next) => {
    try{
        const id = req.params.id;
        const singleTestimonial = await TestimonialModel.findOne({_id:id});
        const singleImage = await singleTestimonial.image;
        await fs.unlinkSync('./public/testimonial-image/'+singleImage);
        const deleteTestimonial = await TestimonialModel.findByIdAndRemove(id);
        return res.status(200).json('Testimonial delete successfully.');
    }catch(error){
        return res.status(500).json('Internal Server Error !');
    }
}

module.exports = {
    countTestimonial,
    GetTestimonialPagination,
    GetAllTestimonial,
    GetSingleTestimonial,
    CreateTestimonial,
    UpdateTestimonial,
    DeleteTestimonial,
}