'use strict';
const mongoose = require('mongoose');

// The school's flat master list of subjects — the pool Subject Groups picks from.
//
// NOT models/subject.js. That one is the legacy per-class subject row (adminId + class +
// stream + a subject name string); this is a school-wide named subject with a type and a
// status, referenced BY ID from anywhere it is used. Referencing rather than copying is
// the whole point: renaming "Social Science" here updates every Subject Group that
// includes it, with no migration and no stale duplicate left behind
// (database-design-principles.md, "Embed vs. reference").
//
// The mongoose model name must differ from the legacy 'subject' — re-registering that name
// throws OverwriteModelError.
const SubjectModel = mongoose.model('academic-subject', {
    adminId: {
        type: String,
        required: true,
        trim: true,
    },
    name: {
        // Stored as the admin typed it ("Social Science"), because it is displayed
        // verbatim in the table, the group tags and on a printed marksheet. Uniqueness is
        // case-INSENSITIVE all the same — see the collated index below.
        type: String,
        required: true,
        trim: true,
    },
    type: {
        // Core: every student in the class takes it. Elective: only matters once it is
        // picked into a Subject Group.
        type: String,
        required: true,
        enum: ['core', 'elective'],
        default: 'core',
    },
    status: {
        // Inactive keeps the subject's history (results, groups it is already in) while
        // removing it from new assignments — which is why this is a status rather than a
        // delete.
        type: String,
        required: true,
        enum: ['active', 'inactive'],
        default: 'active',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// A REAL unique index, not an app-level check: the UI implies one subject per name per
// school, so the database enforces it (database-design-principles.md, "Uniqueness").
// The collation makes "Hindi" and "hindi" the same name — without it both would save and
// then collide visually in every dropdown that lists them.
//
// This is also the index the list endpoint's `sort({ name: 1 })` runs on, which is why
// GetSubjects asks for the SAME collation: a collated index can only serve a query that
// requests the same collation, and a second plain { adminId, name } index cannot exist
// alongside it (Mongo rejects two indexes sharing a key pattern) — nor should it, since a
// name list that sorts "hindi" away from "Hindi" is wrong anyway.
SubjectModel.schema.index(
    { adminId: 1, name: 1 },
    { unique: true, collation: { locale: 'en', strength: 2 } }
);

module.exports = SubjectModel;
