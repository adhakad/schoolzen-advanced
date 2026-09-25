'use strict';
const mongoose = require('mongoose');

// A school's own class configuration: which classes it runs, whether each splits into
// streams, and the sections under each. This is the source data behind every
// Class/Stream/Section filter in the app — config, not a records list.
//
// NOT models/class.js. That one is GLOBAL (no adminId, hard-capped at 15 rows) and holds
// only the standard class NAMES every school picks from; it stays exactly as it is and is
// read here only to populate the "Class Name" dropdown. This collection is the per-school
// answer to "we run 11th, it has Science and Commerce, and Science has sections A and B",
// which nothing in the legacy schema could express.
//
// The mongoose model name must differ from the legacy 'class' — re-registering that name
// throws OverwriteModelError.
//
// One document per class holds the whole tree (streams and their sections as
// sub-documents) because that is exactly the unit the add/edit modal saves and the table
// row renders: one read serves the page, and deleting a class is one delete. The
// sub-documents keep their automatic _id, so a section already has a stable handle for the
// Class Teacher assignment and a future student.sectionId, without a migration.
const AcademicClassModel = mongoose.model('academic-class', {
    adminId: {
        type: String,
        required: true,
        trim: true,
    },
    class: {
        // Joins student.class, class-subject.class and every other class-keyed collection.
        // 200/201/202 stand in for Nursery/LKG/UKG school-wide — see
        // helpers/format-class-name.js, the server-side twin of the classSuffix pipe.
        type: Number,
        required: true,
    },
    hasStreams: {
        // The pivot of the whole form: off, sections hang off the class; on, sections hang
        // off each stream instead. Only one of `sections`/`streams` is ever populated.
        type: Boolean,
        default: false,
    },
    sections: [{
        name: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
        },
    }],
    streams: [{
        name: {
            // Stored lowercase to match student.stream and class-subject.stream, which are
            // both `lowercase: true` — the join has to work without either side casting.
            // Rendered through the streamTitleCase pipe, so "science" shows as "Science".
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        sections: [{
            name: {
                type: String,
                required: true,
                trim: true,
                uppercase: true,
            },
        }],
    }],
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// A school configures each class once. Same shape as class-shift's { adminId, class }.
AcademicClassModel.schema.index({ adminId: 1, class: 1 }, { unique: true });

module.exports = AcademicClassModel;
