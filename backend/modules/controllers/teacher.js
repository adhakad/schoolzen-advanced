'use strict';
const fs = require('fs');
const AdminPlan = require('../models/users/admin-plan');
const TeacherModel = require('../models/teacher');
const TeacherUserModel = require('../models/users/teacher-user');

let countTeacher = async (req, res, next) => {
    let adminId = req.params.adminId;
    let countTeacher = await TeacherModel.count({ adminId: adminId });
    return res.status(200).json({ countTeacher });
}
let GetTeacherById = async (req, res, next) => {
    let adminId = req.params.adminId;
    let teacherUserId = req.params.teacherUserId;
    const checkTeacher = await TeacherUserModel.findOne({ _id: teacherUserId, adminId: adminId, });
    if (!checkTeacher) {
        return res.status(400).json("Invailid access!")
    }
    let teacherId = checkTeacher.teacherId;
    const teacher = await TeacherModel.findOne({ _id: teacherId, adminId: adminId, });
    if (!teacher) {
        return res.status(400).json("Invailid access!")
    }
    return res.status(200).json(teacher);
}
let GetTeacherPagination = async (req, res, next) => {
    let searchText = req.body.filters.searchText;
    let adminId = req.body.adminId;
    let searchObj = {};
    if (searchText) {
        searchObj = /^(?:\d*\.\d{1,2}|\d+)$/.test(searchText)
            ? {
                $or: [{ teacherUserId: searchText }],
            }
            : { name: new RegExp(`${searchText.toString().trim()}`, 'i') };
    }

    try {
        let limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
        let page = req.body.page || 1;
        const teacherList = await TeacherModel.find({ adminId: adminId }).find(searchObj).sort({ _id: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();
        const countTeacher = await TeacherModel.count();

        let teacherData = { countTeacher: 0 };
        teacherData.teacherList = teacherList;
        teacherData.countTeacher = countTeacher;
        return res.json(teacherData);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let CreateTeacher = async (req, res, next) => {
    let otp = Math.floor(Math.random() * 899999 + 100000);
    const { adminId, name, teacherUserId, education } = req.body;
    try {
        const checkAdminPlan = await AdminPlan.findOne({ adminId: adminId });
        if (!checkAdminPlan) {
            return res.status(404).json(`Invalid entry!`);
        }
        let teacherLimit = checkAdminPlan.teacherLimit;
        let countTeacher = await TeacherModel.count({ adminId: adminId });
        if (countTeacher == teacherLimit || countTeacher > teacherLimit) {
            return res.status(400).json(`You have exceeded the ${countTeacher} teacher limit for your current plan. Please increase the limit or upgrade to a higher plan to continue!`);
        }
        const checkTeacher = await TeacherModel.findOne({ adminId: adminId, teacherUserId: teacherUserId });
        if (checkTeacher) {
            return res.status(400).json("Teacher user id already exist!")
        }
        const teacherData = {
            adminId: adminId,
            name: name,
            teacherUserId: teacherUserId,
            education: education,
            otp: otp,
        }
        const createTeacher = await TeacherModel.create(teacherData);
        return res.status(200).json('Teacher created successfully');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}
let TeacherPermission = async (req, res, next) => {
    try {
        const adminId = req.params.id;
        const teacherId = req.params.teacherId;
        let { marksheetPermission, admitCardPermission, studentPermission, admissionPermission, feeCollectionPermission, promoteFailPermission, transferCertificatePermission } = req.body.type;
        const checkTeacher = await TeacherModel.findOne({ _id: teacherId, adminId: adminId });
        if (!checkTeacher) {
            return res.status(400).json("Invalid request!")
        }

        function getUniqueClasses(permissionArray) {
            return [...new Set(permissionArray.map(item => parseInt(Object.keys(item)[0])))];
        }

        // Process each permission type efficiently
        let marksheetClass = getUniqueClasses(marksheetPermission);
        let admissionClass = getUniqueClasses(admissionPermission);
        let studentClass = getUniqueClasses(studentPermission);
        let admitCardClass = getUniqueClasses(admitCardPermission);
        let feeCollectionClass = getUniqueClasses(feeCollectionPermission);
        let promoteFailClass = getUniqueClasses(promoteFailPermission);
        let transferCertificateClass = getUniqueClasses(transferCertificatePermission);


        const teacherData = {};
        const classPermissions = {
            marksheet: marksheetClass,
            admitCard: admitCardClass,
            student: studentClass,
            admission: admissionClass,
            feeCollection: feeCollectionClass,
            promoteFail: promoteFailClass,
            transferCertificate: transferCertificateClass
        };

        for (const key in classPermissions) {
            let classArray = [...new Set(classPermissions[key])]; // Remove duplicates

            // Agar 0 ke alawa koi value ho to 0 remove karo
            if (classArray.length > 1 && classArray.includes(0)) {
                classArray = classArray.filter(num => num!== 0);
            }

            let hasValidClass = classArray.length > 0 && !(classArray.length === 1 && classArray[0] === 0);

            teacherData[`${key}Permission`] = {
                status: hasValidClass,
                classes: hasValidClass ? classArray : [0]
            };
        }
        const updateTeacher = await TeacherModel.findByIdAndUpdate(teacherId, { $set: teacherData }, { new: true });
        return res.status(200).json('Teacher permissions set successfully');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}
let UpdateTeacher = async (req, res, next) => {
    try {
        const id = req.params.id;
        const { adminId, name, education } = req.body;
        const teacherData = {
            adminId: adminId,
            name: name,
            education: education
        }
        const updateTeacher = await TeacherModel.findByIdAndUpdate(id, { $set: teacherData }, { new: true });
        return res.status(200).json('Teacher updated successfully');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}
let ChangeStatus = async (req, res, next) => {
    try {
        const id = req.params.id;
        const { statusValue } = req.body;
        let status = statusValue == 1 ? 'Active' : 'Inactive'
        const teacherData = {
            status: status
        }
        const updateStatus = await TeacherModel.findByIdAndUpdate(id, { $set: teacherData }, { new: true });
        return res.status(200).json(`Teacher ${status} successfully`);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}
let DeleteTeacher = async (req, res, next) => {
    try {
        const id = req.params.id;
        const deleteTeacher = await TeacherModel.findByIdAndRemove(id);
        const deleteTeacherUser = await TeacherUserModel.findByIdAndDelete({ _id: id })
        return res.status(200).json('Teacher deleted successfully');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    GetTeacherById,
    countTeacher,
    GetTeacherPagination,
    CreateTeacher,
    UpdateTeacher,
    TeacherPermission,
    ChangeStatus,
    DeleteTeacher,
}