'use strict';
const mongoose = require('mongoose');

const TeacherModel = mongoose.model('teacher', {
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
    teacherUserId: {
        type: Number,
        required: true,
        trim: true,
    },
    otp: {
        type: Number,
        required: true,
        trim: true,
    },
    education: {
        type: String,
        required: true,
        trim: true,
    },
    marksheetPermission: {
        status: {
            type: Boolean,
            required: true,
            default: false
        },
        classes: {
            type: [Number],
            required: true,
            default: [0]
        }
    },
    studentPermission: {
        status: {
            type: Boolean,
            required: true,
            default: false
        },
        classes: {
            type: [Number],
            required: true,
            default: [0]
        }
    },
    admissionPermission: {
        status: {
            type: Boolean,
            required: true,
            default: false
        },
        classes: {
            type: [Number],
            required: true,
            default: [0]
        }
    },
    admitCardPermission: {
        status: {
            type: Boolean,
            required: true,
            default: false
        },
        classes: {
            type: [Number],
            required: true,
            default: [0]
        }
    },
    feeCollectionPermission: {
        status: {
            type: Boolean,
            required: true,
            default: false
        },
        classes: {
            type: [Number],
            required: true,
            default: [0]
        }
    },
    promoteFailPermission: {
        status: {
            type: Boolean,
            required: true,
            default: false
        },
        classes: {
            type: [Number],
            required: true,
            default: [0]
        }
    },
    transferCertificatePermission: {
        status: {
            type: Boolean,
            required: true,
            default: false
        },
        classes: {
            type: [Number],
            required: true,
            default: [0]
        }
    },
    // Which classes this teacher may view attendance for. Same shape as every permission
    // above it, and the reason the shape is reused rather than a single `class` field being
    // added: a teacher here is not "the class teacher of 5B", they are someone granted a set
    // of classes per feature. middleware/socket-auth.js reads this to decide which
    // `school:<adminId>:class:<n>` rooms their socket joins, so a teacher only ever receives
    // punches for classes listed here.
    //
    // `[0]` is the default sentinel the other blocks use for "none" — readers must filter it
    // out rather than treat it as class zero.
    attendancePermission: {
        status: {
            type: Boolean,
            required: true,
            default: false
        },
        classes: {
            type: [Number],
            required: true,
            default: [0]
        }
    },
    status: {
        type: String,
        required: true,
        trim: true,
        enum: ['Active', 'Inactive'],
        default: 'Active',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = TeacherModel;