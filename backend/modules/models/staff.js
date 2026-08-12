'use strict';
const mongoose = require('mongoose');

const StaffModel = mongoose.model('staff', {
    adminId: {
        type: String,
        required: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    departmentId: {
        // plain String FK -> Department._id, per repo convention (no Mongoose ref/ObjectId)
        type: String,
        required: true,
        trim: true,
    },
    designationId: {
        // plain String FK -> Designation._id, per repo convention (no Mongoose ref/ObjectId)
        type: String,
        required: true,
        trim: true,
    },
    joiningDate: {
        type: Date,
        required: true,
    },
    empCode: {
        // Optional admin-assigned employee code — Staff has no other stable, human-entered
        // identifier (unlike Teacher's teacherUserId or Student's admissionNo), and bulk
        // card-assignment CSVs need one to match rows to a Staff record.
        type: String,
        required: false,
        trim: true,
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active',
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = StaffModel;
