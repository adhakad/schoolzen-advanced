'use strict';
const ClassSubjectModel = require('../models/class-subject');

let countClassSubject = async (req, res, next) => {
    let countClassSubject = await ClassSubjectModel.count();
    return res.status(200).json({ countClassSubject });
}
let GetClassSubjectPagination = async (req, res, next) => {
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
    const adminId = req.body.adminId;
    let searchObj = {};
    if (searchText) {
        searchObj = /^(?:\d*\.\d{1,2}|\d+)$/.test(searchText)
            ? {
                $or: [{ class: searchText }],
            }
            : { stream: new RegExp(`${searchText.toString().trim()}`, 'i') };
    }

    try {
        let limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
        let page = req.body.page || 1;
        const classSubjectList = await ClassSubjectModel.find({adminId:adminId}).find(searchObj).sort({ _id: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();
        const countClassSubject = await ClassSubjectModel.count({adminId:adminId});

        let classSubjectData = { countClassSubject: 0 };
        classSubjectData.classSubjectList = classSubjectList;
        classSubjectData.countClassSubject = countClassSubject;
        return res.json(classSubjectData);
    } catch (error) {
        return res.status(500).json( 'Internal Server Error!' );;
    }
}
// let GetAllClassSubject = async (req, res, next) => {
//     try {
//         const classSubjectList = await ClassSubjectModel.find({});
//         return res.status(200).json(classSubjectList);
//     } catch (error) {
//         return res.status(500).json( 'Internal Server Error !' );
//     }
// }
let GetSingleClassSubjectByStream = async (req, res, next) => {
    let adminId = req.params.id;
    let className = parseInt(req.params.class);
    let stream = req.params.stream;
    if(stream==="stream"){
        stream = "n/a"
    }
    try {
        const classSubjectList = await ClassSubjectModel.findOne({adminId:adminId,class:className,stream:stream});
        if(!classSubjectList){
            return res.status(404).json( 'Please group subjcts in this class!' );
        }
        return res.status(200).json(classSubjectList);
    } catch (error) {
        return res.status(500).json( 'Internal Server Error!' );
    }
}

// let GetSubjectByClass = async (req, res, next) => {
//     try {
//         const subjectList = await ClassSubjectModel.find({ class: req.params.class });
//         return res.status(200).json(subjectList);
//     } catch (error) {
//         return res.status(500).json( 'Internal Server Error !' );;
//     }
// }
// let GetSingleClassSubject = async (req, res, next) => {
//     try {
//         const singleClassSubject = await ClassSubjectModel.findOne({ _id: req.params.id });
//         return res.status(200).json(singleClassSubject);
//     } catch (error) {
//         return res.status(500).json( 'Internal Server Error !' );;
//     }
// }
let CreateClassSubject = async (req, res, next) => {
    let className = req.body.class;
    let {adminId, stream, subject } = req.body;
    subject = subject.map(subject => ({ subject }));
    const classSubjectData = {
        adminId:adminId,
        class: className,
        stream: stream,
        subject: subject,
    }
    try {
        if(subject.length ==0 || subject ==null){
            return res.status(400).json(`Please select subject according to this class!`)
        }
        let checkClassSubject = await ClassSubjectModel.findOne({adminId:adminId, class: className, stream: stream });
        if(checkClassSubject){
            return res.status(400).json(`Class and subject group already exist!`)
        }
        const createClassSubject = await ClassSubjectModel.create(classSubjectData);
        return res.status(200).json("Class and subject group created successfully");
    } catch (error) {
        return res.status(500).json( 'Internal Server Error!' );
    }
}
let UpdateClassSubject = async (req, res, next) => {
    try {
        const id = req.params.id;
        const classSubjectData = {
            class: req.body.class,
            subject: req.body.subject,
        }
        const updateClassSubject = await ClassSubjectModel.findByIdAndUpdate(id, { $set: classSubjectData }, { new: true });
        return res.status(200).json('Class and subject group updated successfully');
    } catch (error) {
        return res.status(500).json( 'Internal Server Error !' );
    }
}
let DeleteClassSubject = async (req, res, next) => {
    try {
        const id = req.params.id;
        const deleteClassSubject = await ClassSubjectModel.findByIdAndRemove(id);
        return res.status(200).json('Class and subject group deleted successfully');
    } catch (error) {
        return res.status(500).json( 'Internal Server Error !' );;
    }
}

module.exports = {
    countClassSubject,
    GetClassSubjectPagination,
    // GetAllClassSubject,
    GetSingleClassSubjectByStream,
    // GetSubjectByClass,
    // GetSingleClassSubject,
    CreateClassSubject,
    UpdateClassSubject,
    DeleteClassSubject,
}