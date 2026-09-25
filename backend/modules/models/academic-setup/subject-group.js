'use strict';
const mongoose = require('mongoose');

// A named bundle of subjects for one class (or one stream of one class). A student picks
// one group, and that decides their whole subject set for the year.
//
// classId/streamId are IDs, not names: `classId` points at an academic-setup/class
// document and `streamId` at one entry inside that document's `streams[]` array (those
// sub-documents keep their automatic _id, which is exactly what makes this possible). So
// renaming 11th's "Science" stream does not orphan the groups hanging off it, and the
// page's Class/Stream columns come from a $lookup rather than from copied strings that
// could drift.
//
// `subjectIds` likewise REFERENCES academic-subject and never copies a subject's name in
// (database-design-principles.md, "Embed vs. reference").
const SubjectGroupModel = mongoose.model('academic-subject-group', {
    adminId: {
        type: String,
        required: true,
        trim: true,
    },
    classId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'academic-class',
        required: true,
    },
    streamId: {
        // null for a class with no streams — the table's "— not applicable" cell. A class
        // WITH streams always carries one, because a group has to say which stream it is
        // for.
        type: mongoose.Schema.Types.ObjectId,
        default: null,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    subjectIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'academic-subject',
    }],
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// One group name per class+stream. A real unique index, not an app-level check, for the
// same reason as Subject's — and case-insensitive, so "General Group" and "general group"
// are the same name.
SubjectGroupModel.schema.index(
    { adminId: 1, classId: 1, streamId: 1, name: 1 },
    { unique: true, collation: { locale: 'en', strength: 2 } }
);

// Backs the toolbar's Class/Stream filter query, in ESR order: adminId and the two
// equality filters first, then the sort key. A separate index from the unique one above
// because that one is collated, and a collated index can only serve a query that asks for
// the same collation — which the list query does not.
SubjectGroupModel.schema.index({ adminId: 1, classId: 1, streamId: 1, createdAt: -1 });

// Lets "which groups use this subject?" — the delete guard on the Subjects page — be one
// indexed query rather than a collection scan.
SubjectGroupModel.schema.index({ adminId: 1, subjectIds: 1 });

module.exports = SubjectGroupModel;
