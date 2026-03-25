'use strict';
const bcrypt = require('bcrypt');
const tokenService = require('../../services/teacher-token');
const AdminUserModel = require('../../models/users/admin-user');
const TeacherUserModel = require('../../models/users/teacher-user');
const TeacherModel = require('../../models/teacher');

let SignupTeacher = async (req, res, next) => {
    const { email, password,schoolId, teacherUserId, otp } = req.body;
    try {
        const checkAdminUser = await AdminUserModel.findOne({ schoolId: schoolId }); 
        if (!checkAdminUser) {
            return res.status(404).json("Invailid register!")
        }
        let adminId = checkAdminUser._id;
        const checkUser = await TeacherUserModel.findOne({adminId: adminId, email: email });
        if (checkUser) {
            return res.status(400).json("Username already register!");
        }
        const teacher = await TeacherModel.findOne({adminId: adminId,teacherUserId: teacherUserId });
        if (!teacher) {
            return res.status(404).json("Teacher does not exist in this school!")
        }
        const teacherId = teacher._id;
        const checkTeacherId = await TeacherUserModel.findOne({adminId: adminId,teacherId: teacherId });
        if (checkTeacherId) {
            return res.status(400).json("Teacher user id is invalid!")
        }
        const checkOtp = await teacher.otp;
        if (otp !== checkOtp) {
            return res.status(400).json("Your OTP is invalid!");
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        let teacherData = {
            adminId:adminId,
            teacherId: teacherId,
            email: email,
            password: hashedPassword
        }
        const createSignupTeacher = await TeacherUserModel.create(teacherData);
        if(createSignupTeacher){
            return res.status(200).json('Teacher register successfully.');
        }
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let LoginTeacher = async (req, res, next) => {
    try {
        const checkAdminUser = await AdminUserModel.findOne({ schoolId: req.body.schoolId }); 
        if (!checkAdminUser) {
            return res.status(404).json("Invailid login!")
        }
        let adminId = checkAdminUser._id;
        let teacher = await TeacherUserModel.findOne({adminId: adminId, email: req.body.email})
        if (!teacher) {
            return res.status(404).json('Username or password invalid!');
        }
        const passwordMatch = await bcrypt.compare(req.body.password, teacher.password);
        if (!passwordMatch) {
            return res.status(404).json('Username or password invalid!');
        }
        let teacherId = await teacher.teacherId;
        let teacherInfo = await TeacherModel.findOne({ _id: teacherId });
        if (teacherInfo.status == "Inactive") {
            return res.status(400).json('Login permission inactive, please contact school administration!')
        }
        if (teacherInfo.status == "Active") {
            const payload = { id: teacher._id,adminId:adminId, email: teacher.email, name: teacherInfo.name };
            const accessToken = await tokenService.getAccessToken(payload);
            const refreshToken = await tokenService.getRefreshToken(payload);
            if(accessToken && refreshToken){
                return res.status(200).json({ teacherInfo: teacherInfo, accessToken, refreshToken });
            }
        }
        return res.status(400).json('Login error!');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let RefreshToken = async (req, res, next) => {
    try {
        const { token } = req.body
        if (token) {
            const payload = await tokenService.verifyRefreshToken(token)
            const accessToken = await tokenService.getAccessToken(payload)
            res.send({ accessToken })
        }
        else {
            res.status(403).send('Token unavailable!')
        }
    } catch (err) {
        res.status(500).json(err)
    }
}

module.exports = {
    SignupTeacher,
    LoginTeacher,
    RefreshToken
}