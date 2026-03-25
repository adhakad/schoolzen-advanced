'use strict';
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const SchoolModel = require('../models/school');
const AdminUserModel = require('../models/users/admin-user');
const { CLOUDINARY_CLOUD_NAMAE, CLOUDINARY_CLOUD_API_KEY, CLOUDINARY_CLOUD_API_SECRET } = process.env;
const cloudinary_cloud_name = CLOUDINARY_CLOUD_NAMAE;
const cloudinary_cloud_api_key = CLOUDINARY_CLOUD_API_KEY;
const cloudinary_cloud_api_secret = CLOUDINARY_CLOUD_API_SECRET

cloudinary.config({
    cloud_name: cloudinary_cloud_name,
    api_key: cloudinary_cloud_api_key,
    api_secret: cloudinary_cloud_api_secret
})

let GetSingleSchoolNameLogo = async (req, res, next) => {
    try {
        const singleSchool = await SchoolModel.findOne({}, 'schoolName foundedYear');
        if (singleSchool) {
            return res.status(200).json(singleSchool);
        }
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetSingleSchool = async (req, res, next) => {
    try {
        let id = req.params.id;
        let adminUser = await AdminUserModel.findOne({ _id: id });
        if (!adminUser) {
            return res.status(404).json('Admin user not found!');
        }

        let singleSchool = await SchoolModel.findOne({ adminId: id });
        if (singleSchool) {
            let schoolData = { ...singleSchool.toObject(), schoolId: adminUser.schoolId };
            return res.status(200).json(schoolData);
        } else {
            return res.status(404).json('School not found!');
        }
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

const CreateSchool = async (req, res, next) => {
    // Helper function to delete uploaded file and return response
    const handleError = (statusCode, message) => {
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkError) {
                // Silent fail for file cleanup
            }
        }
        return res.status(statusCode).json(message);
    };

    try {
        const {
            adminId,
            schoolName,
            affiliationNumber,
            schoolCode,
            foundedYear,
            board,
            medium,
            street,
            city,
            district,
            state,
            country,
            pinCode,
            phoneOne,
            email
        } = req.body;

        if (!adminId) {
            return handleError(404, 'Invalid entry!');
        }

        const checkAdminPlan = await AdminUserModel.findOne({ _id: adminId });
        if (!checkAdminPlan) {
            return handleError(404, 'Invalid entry!');
        }

        // Check if school already exists for this admin
        const existingSchool = await SchoolModel.findOne({ adminId: adminId });
        if (existingSchool) {
            return handleError(400, 'School already exists for this admin!');
        }

        let schoolData = {
            adminId,
            schoolName,
            affiliationNumber,
            schoolCode,
            foundedYear,
            board,
            medium,
            street,
            city,
            district,
            state,
            country,
            pinCode,
            phoneOne,
            email
        };
        if (req.body.phoneSecond !== null && req.body.phoneSecond !== 'null') {
            schoolData.phoneSecond = req.body.phoneSecond;
        }

        const createSchool = await SchoolModel.create(schoolData);

        if (createSchool) {
            let schoolId = createSchool._id;

            // -------- IMAGE UPLOAD --------
            if (req.file && req.file.path) {
                const result = await cloudinary.uploader.upload(req.file.path);
                fs.unlinkSync(req.file.path);

                // Update school with image details
                await SchoolModel.findByIdAndUpdate(schoolId, {
                    schoolLogo: result.secure_url,
                    schoolLogoPublicId: result.public_id
                });
            }

            return res.status(200).json('School created successfully');
        }

    } catch (error) {
        return handleError(500, 'Internal Server Error!');
    }
};

const UpdateSchool = async (req, res, next) => {
    // Helper function to delete uploaded file and return response
    const handleError = (statusCode, message) => {
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkError) {
                // Silent fail for file cleanup
            }
        }
        return res.status(statusCode).json(message);
    };

    try {
        const id = req.params.id;
        let {
            adminId,
            schoolName,
            affiliationNumber,
            schoolCode,
            foundedYear,
            board,
            medium,
            street,
            city,
            district,
            state,
            country,
            pinCode,
            phoneOne,
            email
        } = req.body;

        if (!adminId) {
            return handleError(404, 'Invalid entry!');
        }

        const checkAdminPlan = await AdminUserModel.findOne({ _id: adminId });
        if (!checkAdminPlan) {
            return handleError(404, 'Invalid entry!');
        }

        const singleSchool = await SchoolModel.findById(id);
        if (!singleSchool) {
            return handleError(404, 'School not found!');
        }

        // Check if this school belongs to the admin
        if (singleSchool.adminId.toString() !== adminId.toString()) {
            return handleError(403, 'Unauthorized access!');
        }

        let schoolData = {
            adminId,
            schoolName,
            affiliationNumber,
            schoolCode,
            foundedYear,
            board,
            medium,
            street,
            city,
            district,
            state,
            country,
            pinCode,
            email
        };
        if (req.body.phoneSecond !== null && req.body.phoneSecond !== 'null') {
            schoolData.phoneSecond = req.body.phoneSecond;
        }

        // -------- IMAGE UPLOAD --------
        if (req.file && req.file.path) {
            try {
                // Delete old image from cloudinary if exists
                if (singleSchool.schoolLogoPublicId) {
                    await cloudinary.uploader.destroy(singleSchool.schoolLogoPublicId);
                }

                // Upload new image
                const result = await cloudinary.uploader.upload(req.file.path);
                fs.unlinkSync(req.file.path);

                schoolData.schoolLogo = result.secure_url;
                schoolData.schoolLogoPublicId = result.public_id;
            } catch (imageError) {
                return handleError(500, 'Failed to upload image. Please try again!');
            }
        }

        const updateSchool = await SchoolModel.findByIdAndUpdate(
            id,
            { $set: schoolData },
            { new: true }
        );

        if (updateSchool) {
            return res.status(200).json('School updated successfully');
        } else {
            return handleError(404, 'School not found!');
        }

    } catch (error) {
        return handleError(500, 'Internal Server Error!');
    }
};
let DeleteSchool = async (req, res, next) => {
    try {
        const id = req.params.id;
        const singleSchool = await SchoolModel.findOne({ _id: id });
        await cloudinary.uploader.destroy(singleSchool.schoolLogoPublicId);
        const deleteSchool = await SchoolModel.findByIdAndRemove(id);
        if (deleteSchool) {
            return res.status(200).json('School deleted successfully');
        }
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    GetSingleSchoolNameLogo,
    GetSingleSchool,
    CreateSchool,
    UpdateSchool,
    DeleteSchool,
}
