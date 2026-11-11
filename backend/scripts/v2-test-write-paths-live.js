'use strict';
// Production-readiness sweep of every v2 write path. App's REAL database (DB_URL), scoped to a
// brand-new throwaway school id. For each module: create / update / delete through the REAL
// v2 routers (auth, scope, validation, permissions, idempotency, error handler), read the
// document back RAW from its own collection (the one the app reads from), and confirm the
// matching row in `v2-activity-logs` carries the actor's name. Every row of the throwaway
// school is deleted at the end and the cleanup is verified (0 left).
// Run: node scripts/v2-test-write-paths-live.js   (needs backend/.env: DB_URL, REDIS_URL, ADMIN_ACCESS_SECRET)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
global.global_config = require('../config/config.js');
require('express-async-errors');
const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const AcademicSessionV2Model = require('../modules/models/settings/academic-session');
const errorHandler = require('../modules/middleware/errorHandler');
const { todayKey } = require('../modules/helpers/attendance/v2-context');

const ADMIN = new mongoose.Types.ObjectId().toHexString();
const OWNER = jwt.sign({ payload: { id: ADMIN } }, process.env.ADMIN_ACCESS_SECRET, { expiresIn: '1h' });
const addDays = (k, n) => new Date(Date.parse(`${k}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const today = todayKey();
const month = today.slice(0, 7);
const pastDay = addDays(today, -1);
const sy = (() => { const y = Number(today.slice(0, 4)); return Number(today.slice(5, 7)) >= 4 ? y : y - 1; })();
const session = `${sy}-${sy + 1}`;

let base;
let server;
const f = {};
let seq = 0;
const api = async (method, urlPath, { body, query, token = OWNER } = {}) => {
    const qs = query ? `?${new URLSearchParams(query)}` : '';
    const res = await fetch(`${base}${urlPath}${qs}`, {
        method,
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}`, 'Idempotency-Key': `write-paths-${Date.now()}-${seq += 1}` },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (error) { json = text; }
    return { status: res.status, body: json };
};
const ok = async (method, urlPath, opts) => {
    const res = await api(method, urlPath, opts);
    assert.ok(res.status >= 200 && res.status < 300, `${method} ${urlPath} -> ${res.status} ${JSON.stringify(res.body).slice(0, 1500)}`);
    return res.body;
};
const A = (extra = {}) => ({ adminId: ADMIN, ...extra });

// RAW reads of the collections the app reads from.
const col = (name) => mongoose.connection.db.collection(name);
const oid = (id) => new mongoose.Types.ObjectId(String(id));
const one = async (name, filter) => col(name).findOne({ adminId: ADMIN, ...filter });
const count = (name, filter = {}) => col(name).countDocuments({ adminId: ADMIN, ...filter });
const expectLog = async (action) => {
    const rows = await col('v2-activity-logs').find({ adminId: ADMIN, action }).toArray();
    assert.ok(rows.length >= 1, `no '${action}' row in v2-activity-logs`);
    const row = rows[rows.length - 1];
    assert.strictEqual(row.actorId, ADMIN, `actorId on '${action}'`);
    assert.ok(typeof row.actorName === 'string' && row.actorName.trim(), `actorName empty on '${action}'`);
    return row;
};

// collection -> { write: bool, log: bool }
const proof = {};
const prove = (collection, kind) => { proof[collection] = proof[collection] || {}; proof[collection][kind] = true; };
const logs = async (collection, ...actions) => {
    for (const a of actions) await expectLog(a);
    prove(collection, 'log');
};

const queuedJobs = [];
const runAdmitCardJob = async (structure) => {
    const { generateAdmitCards } = require('../modules/helpers/examination/v2-admit-card-generation');
    const { admitCardJobId } = require('../modules/queues/examination-queue');
    queuedJobs.push(admitCardJobId(String(structure._id), structure.version));
    await generateAdmitCards(ADMIN, String(structure._id), structure.version);
};

const tests = {
    // --- Academic Setup ---
    'academic-setup: subject C/U/D': async () => {
        const c = await ok('POST', '/academic-setup/subjects', { body: A({ name: 'WP Maths' }) });
        const s = await one('v2-academic-subjects', { name: 'WP Maths' });
        assert.ok(s, 'subject not in v2-academic-subjects');
        f.subjectId = String(s._id);
        await ok('PUT', `/academic-setup/subjects/${s._id}`, { body: A({ name: 'WP Mathematics', type: 'core', status: 'active' }) });
        assert.strictEqual((await one('v2-academic-subjects', { _id: s._id })).name, 'WP Mathematics');
        await ok('POST', '/academic-setup/subjects', { body: A({ name: 'WP Temp' }) });
        const t = await one('v2-academic-subjects', { name: 'WP Temp' });
        await ok('POST', '/academic-setup/subjects/bulk-delete', { body: A({ ids: [String(t._id)], confirmed: true }) });
        assert.strictEqual(await count('v2-academic-subjects', { _id: t._id }), 0, 'subject not deleted');
        prove('v2-academic-subjects', 'write');
        await logs('v2-academic-subjects', 'academic-setup.subject.create', 'academic-setup.subject.update', 'academic-setup.subject.delete.bulk');
        void c;
    },
    'academic-setup: class C/U/D': async () => {
        await ok('POST', '/academic-setup/classes', { body: A({ class: 6, sections: [{ name: 'A' }] }) });
        const k = await one('v2-academic-classes', { class: 6 });
        assert.ok(k, 'class not in v2-academic-classes');
        f.classId = String(k._id);
        await ok('PUT', `/academic-setup/classes/${k._id}`, { body: A({ sections: [{ name: 'A' }, { name: 'B' }] }) });
        const k2 = await one('v2-academic-classes', { _id: k._id });
        assert.strictEqual((k2.sections || []).length, 2, 'class update not saved');
        f.sectionId = String(k2.sections[0]._id);
        f.sectionB = String(k2.sections[1]._id);
        await ok('POST', '/academic-setup/classes', { body: A({ class: 7 }) });
        const tmp = await one('v2-academic-classes', { class: 7 });
        await ok('DELETE', `/academic-setup/classes/${tmp._id}`, { query: A({ confirmed: 'true' }) });
        assert.strictEqual(await count('v2-academic-classes', { _id: tmp._id }), 0, 'class not deleted');
        prove('v2-academic-classes', 'write');
        await logs('v2-academic-classes', 'academic-setup.class.create', 'academic-setup.class.update', 'academic-setup.class.delete');
    },
    'academic-setup: subject-group C/U/D': async () => {
        await ok('POST', '/academic-setup/classes', { body: A({ class: 11, hasStreams: true, streams: [{ name: 'Science', sections: [{ name: 'A' }], groups: [{ name: 'PCM' }] }] }) });
        const k11 = await one('v2-academic-classes', { class: 11 });
        f.class11 = String(k11._id); f.stream11 = String(k11.streams[0]._id);
        const G = (name, subjectIds) => A({ classId: f.class11, streamId: f.stream11, name, subjectIds });
        await ok('POST', '/academic-setup/subject-groups', { body: G('WP Group', [f.subjectId]) });
        const g = await one('v2-academic-subject-groups', { name: 'WP Group' });
        assert.ok(g, 'group not in v2-academic-subject-groups');
        await ok('PUT', `/academic-setup/subject-groups/${g._id}`, { body: G('WP Group 2', [f.subjectId]) });
        assert.strictEqual((await one('v2-academic-subject-groups', { _id: g._id })).name, 'WP Group 2');
        await ok('POST', '/academic-setup/subject-groups', { body: G('WP Group Tmp', []) });
        const t = await one('v2-academic-subject-groups', { name: 'WP Group Tmp' });
        await ok('POST', '/academic-setup/subject-groups/bulk-delete', { body: A({ ids: [String(t._id)], confirmed: true }) });
        assert.strictEqual(await count('v2-academic-subject-groups', { _id: t._id }), 0);
        prove('v2-academic-subject-groups', 'write');
        await logs('v2-academic-subject-groups', 'academic-setup.subject-group.create', 'academic-setup.subject-group.update', 'academic-setup.subject-group.delete.bulk');
    },
    // --- Staff ---
    'staff: department C/U/D': async () => {
        const c = await ok('POST', '/staff/departments', { body: A({ name: 'WP Dept' }) });
        const d = await one('v2-departments', { name: 'WP Dept' });
        assert.ok(d, 'department not in v2-departments');
        await ok('PUT', `/staff/departments/${d._id}`, { body: A({ name: 'WP Dept 2' }) });
        assert.strictEqual((await one('v2-departments', { _id: d._id })).name, 'WP Dept 2');
        await ok('DELETE', `/staff/departments/${d._id}`, { query: A({ confirm: 'DELETE' }) });
        assert.strictEqual(await count('v2-departments', { _id: d._id, deletedAt: null }), 0, 'department not deleted');
        prove('v2-departments', 'write');
        await logs('v2-departments', 'staff.department.create', 'staff.department.update', 'staff.department.delete');
        void c;
    },
    'staff: designation C/U/D': async () => {
        await ok('POST', '/staff/designations', { body: A({ title: 'WP Clerk' }) });
        const d = await one('v2-designations', { title: 'WP Clerk' });
        assert.ok(d, 'designation not in v2-designations');
        await ok('PUT', `/staff/designations/${d._id}`, { body: A({ title: 'WP Clerk 2' }) });
        assert.strictEqual((await one('v2-designations', { _id: d._id })).title, 'WP Clerk 2');
        await ok('DELETE', `/staff/designations/${d._id}`, { query: A({ confirm: 'DELETE' }) });
        assert.strictEqual(await count('v2-designations', { _id: d._id, deletedAt: null }), 0, 'designation not deleted');
        prove('v2-designations', 'write');
        await logs('v2-designations', 'staff.designation.create', 'staff.designation.update', 'staff.designation.delete');
    },
    'staff: member C/U/status/D': async () => {
        const c = await ok('POST', '/staff/members', { body: A({ name: 'WP Teacher', empCode: 'WP-1' }) });
        f.staffId = String(c.staff._id);
        assert.ok(await one('v2-staffs', { _id: oid(f.staffId) }), 'staff not in v2-staffs');
        await ok('PUT', `/staff/members/${f.staffId}`, { body: A({ name: 'WP Teacher Two', empCode: 'WP-1' }) });
        assert.strictEqual((await one('v2-staffs', { _id: oid(f.staffId) })).name, 'WP Teacher Two');
        await ok('PATCH', `/staff/members/${f.staffId}/status`, { body: A({ status: 'inactive' }) });
        await ok('PATCH', `/staff/members/${f.staffId}/status`, { body: A({ status: 'active' }) });
        const tmp = await ok('POST', '/staff/members', { body: A({ name: 'WP Temp', empCode: 'WP-9' }) });
        await ok('DELETE', `/staff/members/${tmp.staff._id}`, { query: A() });
        assert.strictEqual((await one('v2-staffs', { _id: oid(tmp.staff._id) })).status, 'terminated', 'staff not terminated');
        prove('v2-staffs', 'write');
        await logs('v2-staffs', 'staff.create', 'staff.update', 'staff.status', 'staff.terminate', 'staff.access.revoke');
    },
    // --- Settings ---
    'settings: academic session C/D': async () => {
        const c = await ok('POST', '/settings/academic-sessions', { body: A({ startDate: `${sy + 1}-04-01`, endDate: `${sy + 2}-03-31`, copyForward: [] }) });
        const id = c.session._id;
        assert.ok(await one('v2-academic-sessions', { _id: oid(id) }), 'session not in v2-academic-sessions');
        await ok('DELETE', `/settings/academic-sessions/${id}`, { query: A({ confirm: 'DELETE' }) });
        assert.strictEqual(await count('v2-academic-sessions', { _id: oid(id) }), 0);
        prove('v2-academic-sessions', 'write');
        await logs('v2-academic-sessions', 'settings.session.create', 'settings.session.delete');
    },
    'settings: role + role-assignment C/U/D': async () => {
        const r = await ok('POST', '/settings/roles', { body: A({ name: 'WP Role', isScoped: true, permissions: [{ module: 'student', canView: true, canEdit: false }] }) });
        const roleId = r.role._id;
        assert.ok(await one('v2-roles', { _id: oid(roleId) }), 'role not in v2-roles');
        await ok('PUT', `/settings/roles/${roleId}`, { body: A({ name: 'WP Role 2' }) });
        assert.strictEqual((await one('v2-roles', { _id: oid(roleId) })).name, 'WP Role 2');
        const a = await ok('POST', '/settings/role-assignments', { body: A({ staffId: f.staffId, roleId, classId: f.classId, sectionId: f.sectionId }) });
        const asg = await one('v2-role-assignments', { staffId: oid(f.staffId) }) || await one('v2-role-assignments', { staffId: f.staffId });
        assert.ok(asg, `assignment not in v2-role-assignments ${JSON.stringify(a).slice(0, 200)}`);
        await ok('PUT', `/settings/role-assignments/${asg._id}`, { body: A({ classId: f.classId, sectionId: f.sectionB }) });
        await ok('DELETE', `/settings/role-assignments/${asg._id}`, { query: A() });
        assert.strictEqual(await count('v2-role-assignments', { _id: asg._id }), 0, 'assignment not deleted');
        await ok('DELETE', `/settings/roles/${roleId}`, { query: A() });
        assert.strictEqual(await count('v2-roles', { _id: oid(roleId), deletedAt: null }), 0, 'role not deleted');
        prove('v2-roles', 'write'); prove('v2-role-assignments', 'write');
        await logs('v2-roles', 'settings.role.create', 'settings.role.update', 'settings.role.delete');
        await logs('v2-role-assignments', 'settings.role-assignment.create', 'settings.role-assignment.update', 'settings.role-assignment.delete');
    },
    'settings: admission form field C/U/D': async () => {
        await ok('POST', '/settings/admission-form-fields', { body: A({ label: 'WP Hobby', type: 'text' }) });
        const row = await one('v2-field-configs', { label: 'WP Hobby' });
        assert.ok(row, 'field not in v2-field-configs');
        await ok('PUT', '/settings/admission-form-fields', { body: A({ changes: [{ fieldKey: row.fieldKey, version: row.version || 0, label: 'WP Hobbies' }] }) });
        assert.strictEqual((await one('v2-field-configs', { _id: row._id })).label, 'WP Hobbies');
        await ok('DELETE', `/settings/admission-form-fields/${row.fieldKey}`, { query: A({ confirm: 'DELETE' }) });
        assert.strictEqual(await count('v2-field-configs', { _id: row._id }), 0);
        prove('v2-field-configs', 'write');
        await logs('v2-field-configs', 'settings.form-field.create', 'settings.form-fields.save', 'settings.form-field.delete');
    },
    // --- Student ---
    'student: C/U/D': async () => {
        const body = A({ session, name: 'WP Student', fatherName: 'WP Father', motherName: 'WP Mother', gender: 'Male', dob: '2015-05-05', classId: f.classId, sectionId: f.sectionId, admissionNo: '90001', medium: 'English', fatherQualification: 'Graduate', motherQualification: 'Graduate', fatherOccupation: 'Farmer', motherOccupation: 'Homemaker', familyAnnualIncome: 100000, rollNumber: '1', fatherMobile: '9000000001', admissionDate: today, category: 'General', religion: 'Hindu', nationality: 'Indian', address: 'WP Street' });
        const c = await ok('POST', '/student/students', { body });
        f.studentId = String(c.id);
        assert.ok(await one('v2-students', { _id: oid(f.studentId) }), 'student not in v2-students');
        assert.ok(await one('v2-student-enrollments', { studentId: { $in: [f.studentId, oid(f.studentId)] } }), 'no enrollment in v2-student-enrollments');
        await ok('PUT', `/student/students/${f.studentId}`, { body: A({ session, name: 'WP Student Two' }) });
        assert.strictEqual((await one('v2-students', { _id: oid(f.studentId) })).name, 'WP Student Two');
        const tmp = await ok('POST', '/student/students', { body: { ...body, name: 'WP Temp Student', admissionNo: '90009', rollNumber: '9', fatherMobile: '9000000009' } });
        await ok('DELETE', `/student/students/${tmp.id}`, { query: A({ confirmed: 'true', session }) });
        assert.strictEqual(await count('v2-students', { _id: oid(tmp.id) }), 0, 'student not deleted');
        prove('v2-students', 'write'); prove('v2-student-enrollments', 'write');
        await logs('v2-students', 'student.create', 'student.update', 'student.delete');
        proof['v2-student-enrollments'].log = true; // enrollment rides the student.* rows
    },
    // --- Attendance ---
    'attendance: shift C/U/D': async () => {
        const c = await ok('POST', '/attendance/shifts', { body: A({ name: 'WP Morning', startTime: '08:00', endTime: '14:00', earlyInMinutes: 10, graceMinutes: 5 }) });
        const s = await one('v2-shifts', { name: 'WP Morning' });
        assert.ok(s, 'shift not in v2-shifts');
        f.shiftId = String(s._id);
        await ok('PUT', `/attendance/shifts/${s._id}`, { body: A({ name: 'WP Morning', startTime: '08:30', endTime: '14:00', earlyInMinutes: 10, graceMinutes: 5 }) });
        assert.strictEqual((await one('v2-shifts', { _id: s._id })).startTime, '08:30');
        await ok('POST', '/attendance/shifts', { body: A({ name: 'WP Tmp', startTime: '15:00', endTime: '18:00', earlyInMinutes: 10, graceMinutes: 5 }) });
        const t = await one('v2-shifts', { name: 'WP Tmp' });
        await ok('DELETE', `/attendance/shifts/${t._id}`, { query: A({ confirmed: 'true' }) });
        assert.strictEqual(await count('v2-shifts', { _id: t._id, deletedAt: null }), 0, 'shift not deleted');
        prove('v2-shifts', 'write');
        await logs('v2-shifts', 'attendance.shift.create', 'attendance.shift.update', 'attendance.shift.delete');
        void c;
    },
    'attendance: roster + class shift assign/clear': async () => {
        await ok('POST', '/attendance/roster/staff/assign', { body: A({ staffIds: [f.staffId], shiftId: f.shiftId, month, weekdays: [0, 1, 2, 3, 4, 5, 6] }) });
        assert.ok(await one('v2-rosters', { staffId: { $in: [f.staffId, oid(f.staffId)] } }), 'roster not in v2-rosters');
        await ok('POST', '/attendance/roster/staff/assign', { body: A({ staffIds: [f.staffId], shiftId: f.shiftId, month, weekdays: [1, 2, 3, 4, 5] }) });
        await ok('POST', '/attendance/roster/classes/assign', { body: A({ session, shiftId: f.shiftId, targets: [{ classId: f.classId, sectionId: f.sectionId }] }) });
        assert.ok(await one('v2-class-shifts', {}), 'class shift not in v2-class-shifts');
        await ok('POST', '/attendance/roster/classes/clear', { body: A({ session, targets: [{ classId: f.classId, sectionId: f.sectionId }], confirmed: true }) });
        assert.strictEqual(await count('v2-class-shifts', { deletedAt: null }), 0, 'class shift not cleared');
        prove('v2-rosters', 'write'); prove('v2-class-shifts', 'write');
        await logs('v2-rosters', 'attendance.roster.assign');
        await logs('v2-class-shifts', 'attendance.class-shift.assign', 'attendance.class-shift.clear');
    },
    'attendance: mark today + mark past': async () => {
        const mk = await api('POST', '/attendance/mark', { body: A({ session, personType: 'staff', personId: f.staffId, status: 'Present' }) });
        f.markToday = mk.status < 300 ? 'ran' : (mk.body && mk.body.error && mk.body.error.code);
        if (mk.status >= 300 && f.markToday !== 'MARK_OUTSIDE_WINDOW') assert.fail(`mark -> ${mk.status} ${JSON.stringify(mk.body).slice(0, 400)}`);
        await ok('POST', '/attendance/mark-past', { body: A({ session, personType: 'staff', personId: f.staffId, status: 'Present', date: pastDay }) });
        await ok('POST', '/attendance/roster/classes/assign', { body: A({ session, shiftId: f.shiftId, targets: [{ classId: f.classId, sectionId: f.sectionId }] }) });
        await ok('POST', '/attendance/mark-past', { body: A({ session, personType: 'student', personId: f.studentId, classId: f.classId, sectionId: f.sectionId, status: 'Absent', date: pastDay }) });
        assert.ok(await count('v2-attendance-records') >= 1, 'no row in v2-attendance-records');
        prove('v2-attendance-records', 'write');
        await logs('v2-attendance-records', ...(f.markToday === 'ran' ? ['attendance.mark', 'attendance.mark-past'] : ['attendance.mark-past']));
        if (await count('v2-attendance-live-stats')) prove('v2-attendance-live-stats', 'write');
        await ok('POST', '/attendance/roster/staff/clear', { body: A({ staffIds: [f.staffId], month, confirmed: true }) });
        await logs('v2-rosters', 'attendance.roster.clear');
    },
    // --- Fees ---
    'fees: structure C/U/D, collect, concession, reminder filter C/D': async () => {
        const c = await ok('POST', '/fees/structures', { body: A({ session, classId: f.classId, admissionFee: 500, particulars: [{ name: 'Tuition', amount: 10000 }] }) });
        const s = await one('v2-fee-structures', {});
        assert.ok(s, `structure not in v2-fee-structures ${JSON.stringify(c).slice(0, 200)}`);
        await ok('PUT', `/fees/structures/${s._id}`, { body: A({ session, classId: f.classId, admissionFee: 500, particulars: [{ name: 'Tuition', amount: 12000 }] }) });
        assert.ok(await count('v2-student-fee-records') >= 1, 'no v2-student-fee-records row for the enrolled student');
        await ok('POST', `/fees/collection/${f.studentId}/collect`, { body: A({ session, amount: 1000, mode: 'cash' }) });
        assert.ok(await one('v2-fee-payments', {}), 'payment not in v2-fee-payments');
        assert.ok(await one('v2-fee-receipt-counters', {}), 'no v2-fee-receipt-counters row');
        await ok('PUT', `/fees/collection/${f.studentId}/concession`, { body: A({ session, amount: 200, reason: 'WP sibling' }) });
        const r = await ok('POST', '/fees/reminders', { body: A({ classId: f.classId, paidBelowPercent: 50 }) });
        const flt = await one('v2-fee-reminder-filters', {});
        assert.ok(flt, `filter not in v2-fee-reminder-filters ${JSON.stringify(r).slice(0, 200)}`);
        await ok('DELETE', `/fees/reminders/${flt._id}`, { query: A() });
        assert.ok((await one('v2-fee-reminder-filters', { _id: flt._id })).deletedAt, 'filter not deleted');
        ['v2-fee-structures', 'v2-student-fee-records', 'v2-fee-payments', 'v2-fee-receipt-counters', 'v2-fee-reminder-filters'].forEach((n) => prove(n, 'write'));
        await logs('v2-fee-structures', 'fees.structure.create', 'fees.structure.update');
        await logs('v2-fee-payments', 'fees.payment.collect');
        await logs('v2-student-fee-records', 'fees.concession.update');
        await logs('v2-fee-reminder-filters', 'fees.reminder-filter.create', 'fees.reminder-filter.delete');
        f.feeStructureId = String(s._id);
    },
    // --- Examination ---
    'examination: marksheet structure save, marks save, admit-card structure C/U/D': async () => {
        const general = await one('v2-academic-subject-groups', { classId: { $in: [f.classId, oid(f.classId)] } });
        assert.ok(general, 'no automatic General group for the class');
        await ok('PUT', `/academic-setup/subject-groups/${general._id}`, { body: A({ classId: f.classId, streamId: null, name: general.name, subjectIds: [f.subjectId] }) });
        const tpl = await col('v2-marksheet-templates').findOne({});
        assert.ok(tpl, 'no seeded v2-marksheet-templates row');
        await ok('POST', '/settings/marksheet-templates/assign', { body: A({ templateId: String(tpl.code || tpl._id), classId: f.classId, session }) });
        await expectLog('settings.marksheet-template.assign');
        await ok('PUT', '/examination/marksheet-structure', { body: A({ session, classId: f.classId, subjects: [{ subjectId: f.subjectId, theoryMax: 80, practicalMax: 20 }] }) });
        const ms = await one('v2-marksheet-structures', {});
        assert.ok(ms, 'not in v2-marksheet-structures');
        await ok('PUT', `/examination/marksheets/${f.studentId}`, { body: A({ session, term: 'Half-Yearly', marks: [{ subjectId: f.subjectId, theory: 70, practical: 18 }] }) });
        assert.ok(await one('v2-exam-results', {}), 'not in v2-exam-results');
        const sb = A({ session, classId: f.classId, examName: 'WP Half Yearly', subjects: [{ subjectId: f.subjectId, examDate: addDays(today, 10), startTime: '09:00', endTime: '12:00' }] });
        await ok('POST', '/examination/admit-card-structures', { body: sb });
        const st = await one('v2-admit-card-structures', {});
        assert.ok(st, 'not in v2-admit-card-structures');
        // Run the queued job with the worker's own processor (worker.js is not running here).
        await runAdmitCardJob(st);
        f.admitCards = await count('v2-admit-cards', { structureId: { $in: [st._id, String(st._id)] } });
        assert.ok(f.admitCards >= 1, 'worker wrote no v2-admit-cards rows for the enrolled student');
        await ok('PUT', `/examination/admit-card-structures/${st._id}`, { body: { ...sb, examName: 'WP Half Yearly 2', version: st.version || 1 } });
        const st2 = await one('v2-admit-card-structures', { _id: st._id });
        assert.strictEqual(st2.examName, 'WP Half Yearly 2');
        await runAdmitCardJob(st2);
        await ok('DELETE', `/examination/admit-card-structures/${st._id}`, { query: A() });
        assert.strictEqual(await count('v2-admit-card-structures', { _id: st._id, deletedAt: null }), 0, 'structure not deleted');
        await ok('DELETE', '/examination/marksheet-structure', { query: A({ session, classId: f.classId, version: ms.version || 0 }) });
        ['v2-marksheet-structures', 'v2-exam-results', 'v2-admit-card-structures'].forEach((n) => prove(n, 'write'));
        if (f.admitCards) prove('v2-admit-cards', 'write');
        await logs('v2-marksheet-structures', 'examination.marksheet-structure.save', 'examination.marksheet-structure.remove');
        await logs('v2-exam-results', 'examination.marks.save');
        await logs('v2-admit-card-structures', 'examination.admit-card-structure.create', 'examination.admit-card-structure.update', 'examination.admit-card-structure.delete');
        if (f.admitCards) proof['v2-admit-cards'].log = true; // generated under the structure.* rows
    },
    // --- Certificates ---
    'certificates: TC structure update, issue, cancel': async () => {
        await ok('PUT', '/certificates/tc-structure', { body: A({ session, nextSerialNumber: 'WP/001' }) });
        assert.ok(await one('v2-tc-structures', {}), 'not in v2-tc-structures');
        const issued = await ok('POST', `/certificates/tc/students/${f.studentId}/issue`, { body: A({ session, dateOfLeaving: today, reasonForLeaving: 'relocation', qualifiedForPromotion: true, acknowledgeFeesPending: true }) });
        const tc = await one('v2-transfer-certificates', {});
        assert.ok(tc, `not in v2-transfer-certificates ${JSON.stringify(issued).slice(0, 200)}`);
        await ok('POST', `/certificates/tc/${tc._id}/cancel`, { body: A({ session, reason: 'WP issued by mistake' }) });
        assert.strictEqual((await one('v2-transfer-certificates', { _id: tc._id })).status, 'cancelled');
        prove('v2-tc-structures', 'write'); prove('v2-transfer-certificates', 'write');
        await logs('v2-tc-structures', 'certificates.tc-structure.update');
        await logs('v2-transfer-certificates', 'certificates.tc.issue', 'certificates.tc.cancel');
    },
    // --- Leave ---
    'leave: type C/U/D, limits, request C/approve(inbox)/cancel/reject/delete': async () => {
        await ok('POST', '/leave/types', { body: A({ name: 'WP Casual', defaultDays: 12, applicableTo: 'both' }) });
        const t = await one('v2-leave-types', { name: 'WP Casual' });
        assert.ok(t, 'not in v2-leave-types');
        f.leaveTypeId = String(t._id);
        await ok('PUT', `/leave/types/${t._id}`, { body: A({ name: 'WP Casual Leave', defaultDays: 12, applicableTo: 'both' }) });
        assert.strictEqual((await one('v2-leave-types', { _id: t._id })).name, 'WP Casual Leave');
        await ok('PUT', '/leave/assign/limit', { body: A({ session, personType: 'staff', personId: f.staffId, leaveTypeId: f.leaveTypeId, days: 10 }) });
        assert.ok(await one('v2-leave-limits', {}), 'not in v2-leave-limits');
        await ok('POST', '/leave/assign/classes', { body: A({ session, targets: [{ classId: f.classId, sectionId: f.sectionId }], items: [{ leaveTypeId: f.leaveTypeId, days: 5 }] }) });
        const from = addDays(today, 14);
        const r1 = await ok('POST', '/leave/requests', { body: A({ session, personType: 'staff', personId: f.staffId, leaveTypeId: f.leaveTypeId, fromDate: from, toDate: from }) });
        const req1 = await one('v2-leave-requests', {});
        assert.ok(req1, `not in v2-leave-requests ${JSON.stringify(r1).slice(0, 200)}`);
        await ok('PUT', `/approvals/requests/leave/${req1._id}/approve`, { body: A() });
        assert.strictEqual((await one('v2-leave-requests', { _id: req1._id })).status, 'Approved');
        await ok('PUT', `/leave/requests/${req1._id}/cancel`, { body: A({ reason: 'WP plans changed' }) });
        const r2 = await ok('POST', '/leave/requests', { body: A({ session, personType: 'staff', personId: f.staffId, leaveTypeId: f.leaveTypeId, fromDate: addDays(from, 7), toDate: addDays(from, 7) }) });
        const id2 = (r2.request && r2.request._id) || (await col('v2-leave-requests').find({ adminId: ADMIN }).sort({ _id: -1 }).limit(1).next())._id;
        await ok('PUT', `/leave/requests/${id2}/reject`, { body: A() });
        await ok('DELETE', `/leave/requests/${id2}`, { query: A() });
        assert.strictEqual(await count('v2-leave-requests', { _id: oid(id2), deletedAt: null }), 0, 'request not deleted');
        await ok('POST', '/leave/types', { body: A({ name: 'WP Unused', defaultDays: 2, applicableTo: 'both' }) });
        const unused = await one('v2-leave-types', { name: 'WP Unused' });
        await ok('DELETE', `/leave/types/${unused._id}`, { query: A({ confirm: 'DELETE' }) });
        assert.strictEqual(await count('v2-leave-types', { _id: unused._id, deletedAt: null }), 0, 'leave type not deleted');
        ['v2-leave-types', 'v2-leave-limits', 'v2-leave-requests'].forEach((n) => prove(n, 'write'));
        if (await count('v2-class-leave-defaults')) prove('v2-class-leave-defaults', 'write');
        await logs('v2-leave-types', 'leave.type.create', 'leave.type.update', 'leave.type.delete');
        await logs('v2-leave-limits', 'leave.limit.staff.set');
        await logs('v2-class-leave-defaults', 'leave.limit.class.assign');
        await logs('v2-leave-requests', 'leave.request.create', 'leave.request.approve', 'approvals.request.approve', 'leave.request.cancel', 'leave.request.reject', 'leave.request.delete');
    },
    // --- Holiday ---
    'holiday: holiday C/U/D, template C/U/D, assign/unassign': async () => {
        const d = addDays(today, 30);
        await ok('POST', '/holiday/holidays', { body: A({ name: 'WP Fest', startDate: d, endDate: d }) });
        const h = await one('v2-holidays', { name: 'WP Fest' });
        assert.ok(h, 'not in v2-holidays');
        await ok('PUT', `/holiday/holidays/${h._id}`, { body: A({ name: 'WP Festival', startDate: d, endDate: d }) });
        assert.strictEqual((await one('v2-holidays', { _id: h._id })).name, 'WP Festival');
        await ok('POST', '/holiday/templates', { body: A({ name: 'WP Template', holidayIds: [String(h._id)] }) });
        const tp = await one('v2-holiday-templates', {});
        assert.ok(tp, 'not in v2-holiday-templates');
        await ok('PUT', `/holiday/templates/${tp._id}`, { body: A({ name: 'WP Template 2', holidayIds: [String(h._id)] }) });
        await ok('POST', '/holiday/assign', { body: A({ session, personType: 'staff', personIds: [f.staffId], templateId: String(tp._id), mode: 'assign' }) });
        await ok('POST', '/holiday/assign/remove', { body: A({ session, personType: 'staff', personIds: [f.staffId] }) });
        await ok('DELETE', `/holiday/templates/${tp._id}`, { query: A() });
        await ok('DELETE', `/holiday/holidays/${h._id}`, { query: A() });
        assert.strictEqual(await count('v2-holidays', { _id: h._id, deletedAt: null }), 0, 'holiday not deleted');
        prove('v2-holidays', 'write'); prove('v2-holiday-templates', 'write');
        await logs('v2-holidays', 'holiday.create', 'holiday.update', 'holiday.delete');
        await logs('v2-holiday-templates', 'holiday.template.create', 'holiday.template.update', 'holiday.template.delete', 'holiday.assign', 'holiday.unassign');
    },
    // --- Payroll ---
    'payroll: group C/U/D, assign, generate, lock/unlock, payment, slip': async () => {
        await ok('POST', '/payroll/salary-groups', { body: A({ name: 'WP Grade A', basic: 20000 }) });
        const g = await one('v2-salary-groups', { name: 'WP Grade A' });
        assert.ok(g, 'not in v2-salary-groups');
        await ok('PUT', `/payroll/salary-groups/${g._id}`, { body: A({ name: 'WP Grade A1', basic: 21000 }) });
        assert.strictEqual((await one('v2-salary-groups', { _id: g._id })).name, 'WP Grade A1');
        const prev = new Date(Date.parse(`${month}-01T00:00:00Z`) - 86400000);
        const y = prev.getUTCFullYear(); const m = prev.getUTCMonth() + 1;
        await ok('PUT', '/payroll/assign', { body: A({ staffId: f.staffId, salaryGroupId: String(g._id), effectiveFrom: `${y}-${String(m).padStart(2, '0')}-01` }) });
        assert.ok(await one('v2-staff-salary-assignments', {}), 'not in v2-staff-salary-assignments');
        // Fixture (not under test): a full month Present so the run has a payable net.
        const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
        await col('v2-attendance-records').insertMany(Array.from({ length: days }, (_, i) => {
            const dk = `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
            return { adminId: ADMIN, personType: 'staff', personId: f.staffId, date: new Date(`${dk}T00:00:00Z`), dateKey: dk, punches: [], status: 'Present', source: 'manual' };
        }));
        const gen = await ok('POST', '/payroll/runs/generate', { body: A({ staffId: f.staffId, year: y, month: m }) });
        const run = await one('v2-payroll-runs', {});
        assert.ok(run, `not in v2-payroll-runs ${JSON.stringify(gen).slice(0, 200)}`);
        await ok('POST', `/payroll/runs/${run._id}/lock`, { body: A() });
        await ok('POST', `/payroll/payouts/${run._id}/payments`, { body: A({ amountPaid: 100, mode: 'cash', date: today }) });
        const pay = await one('v2-payroll-payments', {});
        assert.ok(pay, 'not in v2-payroll-payments');
        // Confirm is the STAFF member's own action — a token that carries their staffId.
        const staffToken = jwt.sign({ payload: { staffId: f.staffId, adminId: ADMIN } }, process.env.ADMIN_ACCESS_SECRET, { expiresIn: '1h' });
        await ok('PUT', `/payroll/payouts/payments/${pay._id}/confirm`, { body: {}, token: staffToken });
        assert.strictEqual((await one('v2-payroll-payments', { _id: pay._id })).confirmationStatus, 'confirmed', 'payment not confirmed');
        await ok('POST', `/payroll/payouts/${run._id}/slip`, { body: A() });
        assert.ok(await one('v2-salary-slips', {}), 'not in v2-salary-slips');
        const g2 = await ok('POST', '/payroll/salary-groups', { body: A({ name: 'WP Tmp Grade', basic: 1000 }) });
        const tmp = await one('v2-salary-groups', { name: 'WP Tmp Grade' });
        await ok('DELETE', `/payroll/salary-groups/${tmp._id}`, { query: A({ confirm: 'DELETE' }) });
        assert.strictEqual(await count('v2-salary-groups', { _id: tmp._id, deletedAt: null }), 0, 'group not deleted');
        ['v2-salary-groups', 'v2-staff-salary-assignments', 'v2-payroll-runs', 'v2-payroll-payments', 'v2-salary-slips'].forEach((n) => prove(n, 'write'));
        await logs('v2-salary-groups', 'payroll.group.create', 'payroll.group.update', 'payroll.group.delete');
        await logs('v2-staff-salary-assignments', 'payroll.assign');
        await logs('v2-payroll-runs', 'payroll.generate', 'payroll.lock');
        await logs('v2-payroll-payments', 'payroll.payment.record', 'payroll.payment.confirm');
        await logs('v2-salary-slips', 'payroll.slip.generate');
        void g2;
    },
};

const cleanupLive = async () => {
    const db = mongoose.connection.db;
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.'));
    let removed = 0;
    for (const name of names) removed += (await db.collection(name).deleteMany({ adminId: ADMIN })).deletedCount;
    let left = 0;
    for (const name of names) left += await db.collection(name).countDocuments({ adminId: ADMIN });
    try { await require('../modules/services/cache/cache.service').delPattern(`${ADMIN}:*`); } catch (error) { /* cache optional */ }
    try {
        const { examinationQueue } = require('../modules/queues/examination-queue');
        for (const id of queuedJobs) { const job = await examinationQueue.getJob(id); if (job) await job.remove().catch(() => undefined); }
    } catch (error) { /* queue optional */ }
    console.log(`  live cleanup: ${removed} rows removed across ${names.length} collections, ${left} left`);
    if (left) throw new Error(`live cleanup left ${left} rows for ${ADMIN}`);
};

(async () => {
    await mongoose.connect(process.env.DB_URL, { serverSelectionTimeoutMS: 20000 });
    console.log(`  live: database "${mongoose.connection.name}", throwaway adminId ${ADMIN}`);
    const app = express();
    app.use(express.json());
    require('../routes')(app);
    app.use(errorHandler);
    server = http.createServer(app).listen(0);
    base = `http://127.0.0.1:${server.address().port}/api/v2`;
    let failed = 0;
    const total = Object.keys(tests).length + 1;
    try {
        await AcademicSessionV2Model.create({ adminId: ADMIN, label: session, startDate: new Date(Date.UTC(sy, 3, 1)), endDate: new Date(Date.UTC(sy + 1, 2, 31)), status: 'active' });
        for (const [name, fn] of Object.entries(tests)) {
            try { await fn(); console.log(`  ok   ${name}`); } catch (error) { failed += 1; console.log(`  FAIL ${name}\n       ${error.message}`); }
        }
        console.log('\n  PROOF collection | live write | activity log');
        for (const [c, p] of Object.entries(proof).sort()) console.log(`  ${c} | ${p.write ? 'yes' : 'no'} | ${p.log ? 'yes' : 'no'}`);
    } finally {
        server.close();
        try { await cleanupLive(); console.log('  ok   every test record removed (verified 0 left)'); } catch (error) { failed += 1; console.log(`  FAIL cleanup\n       ${error.message}`); }
        await mongoose.disconnect();
    }
    console.log(failed ? `\n${failed} failed` : `\nall ${total} passed`);
    process.exit(failed ? 1 : 0);
})().catch((error) => {
    console.error('setup failed:', error.message);
    if (server) server.close();
    // NEVER drop — this is the app's own database; delete this run's rows only.
    cleanupLive().catch((e) => console.error('cleanup failed:', e.message)).finally(() => process.exit(1));
});
