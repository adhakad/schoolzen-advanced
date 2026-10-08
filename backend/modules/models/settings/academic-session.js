'use strict';
const mongoose = require('mongoose');

// A school's academic session — the v2, PER-SCHOOL successor to the legacy global
// models/academic-session.js (one document holding label strings for every school, with no
// per-session _id to reference). Schema per settings/academic-sessions.md.
//
// Every other v2 collection stores a session as a REFERENCE to this document (its _id), never
// a copied label string — StudentEnrollment.sessionId first. A label is still what the shell
// header shows and what the API accepts; helpers/academic-session/session-resolver.js turns it
// into this document's id at the API edge.
//
// Settings → Academic Sessions (module 12) owns create / Set-as-Active / delete
// (controllers/settings/academic-sessions.controller.js). The resolver still creates a
// session on first use for a label a write path names, but never a second `active` one.
//
// Mongoose name differs from the legacy 'academic-session' (re-registering it would throw).
const AcademicSessionSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    // Server-computed "2026-2027" from the dates (academic-session-format.js), never typed.
    label: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['active', 'closed', 'upcoming'], required: true },
    // Flips true the first time another collection writes against this session; the date
    // range is immutable after that (settings/academic-sessions.md).
    isLocked: { type: Boolean, default: false },
    schemaVersion: { type: Number, default: 1 },
    createdBy: { type: String, default: 'system' },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// One document per label per school — also the race guard for on-demand seeding: two
// concurrent first requests both upsert, and only one document can exist.
AcademicSessionSchema.index({ adminId: 1, label: 1 }, { unique: true });
// "The active session" lookup. Exactly-one-active is enforced by the activation
// transaction (database-design-principles.md), not by an index — status is mutable state.
AcademicSessionSchema.index({ adminId: 1, status: 1 });
// DB backstop for exactly-one-active: the activation transaction is the primary guard, this
// partial unique index makes a second `active` document impossible even if some write path
// ever skipped it — a violating write fails with E11000 instead of silently splitting the
// school's "current year" in two.
AcademicSessionSchema.index(
    { adminId: 1 },
    { unique: true, partialFilterExpression: { status: 'active' }, name: 'one_active_per_school' }
);
// The page's list order.
AcademicSessionSchema.index({ adminId: 1, startDate: -1 });

const AcademicSessionV2Model = mongoose.model('v2-academic-session', AcademicSessionSchema);

module.exports = AcademicSessionV2Model;
