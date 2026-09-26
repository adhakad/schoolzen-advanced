'use strict';
const mongoose = require('mongoose');

// A student's identity and profile — who they are, not where they sit.
//
// Class, stream, group, section and roll number deliberately do NOT live here. Placement is
// session-scoped and lives on StudentEnrollment (./student-enrollment.js): one document per
// student per session. That is what lets Class Promotion create next year's placement
// without touching this year's, and what keeps a student's history readable after they move
// up (manage-students.md, class-promotion.md).
//
// NOT models/student.js. That legacy collection is flat (class/stream/rollNumber on the
// profile) and stays exactly as it is for the old admin pages; this is its v2 successor and
// is filled either by the v2 pages or by scripts/migrate-students-v2.js, which only ever
// READS the legacy one. The mongoose name has to differ — re-registering 'student' throws
// OverwriteModelError.
const StudentSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },

    // Issued by the school, not pre-existing: null is a real state ("Not yet issued") that
    // keeps an admission Pending until an admin assigns one (admission.md).
    admissionNo: { type: Number, default: null },
    status: { type: String, enum: ['pending', 'admitted'], default: 'pending' },
    // The session the student was admitted in — the Admission page lists "new students
    // entering the school this session" off this, not off the current enrollment.
    admissionSession: { type: String, required: true, trim: true },

    name: { type: String, required: true, trim: true },
    // Lowercased copy backing the name-prefix search index. Kept in sync by the pre-save /
    // pre-update hooks below, never set by a caller.
    nameLower: { type: String, trim: true },
    photoUrl: { type: String, trim: true, default: null },
    photoPublicId: { type: String, trim: true, default: null },

    medium: { type: String, trim: true },
    admissionClass: { type: Number, default: null },   // "First Enrolled Class"
    doa: { type: Date, default: null },                // date of admission
    admissionFee: { type: Number, default: null },
    feesConcession: { type: Number, default: 0 },
    lastSchool: { type: String, trim: true },

    dob: { type: Date, default: null },
    gender: { type: String, trim: true },
    category: { type: String, trim: true },
    religion: { type: String, trim: true },
    nationality: { type: String, trim: true },
    aadharNumber: { type: String, trim: true },
    samagraId: { type: String, trim: true },
    udiseNumber: { type: String, trim: true },
    bankAccountNo: { type: String, trim: true },
    bankIfscCode: { type: String, trim: true, uppercase: true },
    address: { type: String, trim: true },

    fatherName: { type: String, trim: true },
    fatherQualification: { type: String, trim: true },
    fatherOccupation: { type: String, trim: true },
    motherName: { type: String, trim: true },
    motherQualification: { type: String, trim: true },
    motherOccupation: { type: String, trim: true },
    familyAnnualIncome: { type: Number, default: null },
    parentsContact: { type: String, trim: true },

    // Biometric identity. The device-side record lives in BiometricMapping (shared with
    // Attendance's punch ingest); these two are the profile's own copy so the list can show
    // the Card column without a join.
    cardNumber: { type: String, trim: true, default: null },
    // 4 = Card only, 10 = Card + Fingerprint — the terminal codes, see
    // helpers/student/student.utils.js VERIFY_MODES.
    verifyMode: { type: Number, default: 4 },

    // Outbound notifications resolve their language from this, never from a request
    // (additional-technical-considerations.md, Notifications).
    preferredLanguage: { type: String, trim: true, default: 'en' },

    // Values for school-defined custom fields (Settings → Admission Form Fields). Keyed by
    // FieldConfig.fieldKey.
    extraFields: { type: Map, of: mongoose.Schema.Types.Mixed, default: undefined },

    // Set only by scripts/migrate-students-v2.js — the upsert key that makes re-running it
    // a no-op.
    legacyStudentId: { type: String, default: undefined },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

const syncDerived = (target) => {
    if (target.name != null) target.nameLower = String(target.name).trim().toLowerCase();
    target.updatedAt = new Date();
};

StudentSchema.pre('save', function (next) {
    syncDerived(this);
    next();
});

StudentSchema.pre(['updateOne', 'findOneAndUpdate'], function (next) {
    const update = this.getUpdate() || {};
    const set = update.$set || update;
    syncDerived(set);
    if (update.$set) update.$set = set;
    next();
});

// Admission No. is unique per school — but only once issued. A plain unique index would
// treat every pending admission's null as the same value and reject the second one.
StudentSchema.index(
    { adminId: 1, admissionNo: 1 },
    { unique: true, partialFilterExpression: { admissionNo: { $type: 'number' } } }
);

// One card, one person — the device would otherwise let one card open two identities.
StudentSchema.index(
    { adminId: 1, cardNumber: 1 },
    { unique: true, partialFilterExpression: { cardNumber: { $type: 'string' } } }
);

// Name-prefix search ("Search by name or admission no.") — an anchored, case-folded regex
// on this field is an index range scan, not a collection scan.
StudentSchema.index({ adminId: 1, nameLower: 1 });

// Migration idempotency.
StudentSchema.index(
    { adminId: 1, legacyStudentId: 1 },
    { unique: true, partialFilterExpression: { legacyStudentId: { $type: 'string' } } }
);

const StudentProfileModel = mongoose.model('v2-student', StudentSchema);

module.exports = StudentProfileModel;
