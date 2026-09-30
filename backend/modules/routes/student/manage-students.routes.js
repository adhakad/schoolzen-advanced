'use strict';
const express = require('express');
const router = express.Router();

const { isAdminAuth } = require('../../middleware/admin-auth');
const assertAdminScope = require('../../middleware/assert-admin-scope');
const validateRequest = require('../../middleware/validate-request');
const idempotency = require('../../middleware/idempotency');
const { singleUpload, imageFile, excelFile, imageContentGuard, imageSanitize } = require('../../middleware/single-upload');
const {
    listStudentsQuerySchema,
    overviewQuerySchema,
    excelScopeSchema,
    excelExportSchema,
    studentDetailQuerySchema,
    revealFieldSchema,
    bulkDeleteSchema,
    assignCardsSchema,
    resyncSchema,
} = require('../../validators/student/manage-students.validator');
const {
    ListStudents,
    GetOverview,
    GetStudent,
    RevealStudentField,
    GetFieldConfig,
    GetFilterOptions,
    CreateStudent,
    UpdateStudent,
    DeleteStudent,
    BulkDeleteStudents,
    AssignCards,
    ResyncCard,
    ExportExcel,
    ImportExcel,
    GetJobStatus,
} = require('../../controllers/student/manage-students.controller');

// Mounted at /api/v2/student — wiring only, no logic.
//
// Multipart routes run the upload BEFORE the scope check: until Multer has parsed the
// form, req.body (and so its adminId) does not exist.
const MODULE = 'student';
const scope = assertAdminScope(MODULE);
// Memory-stored (no local folder), then the bytes themselves checked to be a JPG/PNG.
const photo = [singleUpload(imageFile, 'photo', MODULE), imageContentGuard('photo', MODULE), imageSanitize('photo', MODULE)];
const sheet = singleUpload(excelFile, 'file', MODULE);
// Idempotency-Key on the synchronous critical writes student/optimization.md names: student
// create and Assign Card (a retry must not create a second student or re-push a card to the
// devices). NOT on bulk delete (idempotent by nature) or import (deduped by its job key).
const once = idempotency(MODULE);

router.get('/field-config', isAdminAuth, scope, GetFieldConfig);
router.get('/filter-options', isAdminAuth, scope, GetFilterOptions);
router.get('/jobs/:jobId', isAdminAuth, scope, GetJobStatus);

router.get('/students', isAdminAuth, scope, validateRequest(listStudentsQuerySchema, MODULE, 'query'), ListStudents);
router.get('/students/overview', isAdminAuth, scope, validateRequest(overviewQuerySchema, MODULE, 'query'), GetOverview);
// Declared before /students/:id so "excel" is never read as an id.
router.get('/students/excel/export', isAdminAuth, scope, validateRequest(excelExportSchema, MODULE, 'query'), ExportExcel);
router.post('/students/excel/import', isAdminAuth, sheet, scope, validateRequest(excelScopeSchema, MODULE), ImportExcel);
router.post('/students/bulk-delete', isAdminAuth, scope, validateRequest(bulkDeleteSchema, MODULE), BulkDeleteStudents);
router.post('/students/cards', isAdminAuth, scope, once, validateRequest(assignCardsSchema, MODULE), AssignCards);

router.get('/students/:id', isAdminAuth, scope, validateRequest(studentDetailQuerySchema, MODULE, 'query'), GetStudent);
// Logged BEFORE the value is sent (student-fix4.md C) — a POST, so it's never cached or prefetched.
router.post('/students/:id/reveal', isAdminAuth, scope, validateRequest(revealFieldSchema, MODULE), RevealStudentField);
router.post('/students', isAdminAuth, photo, scope, once, CreateStudent);
router.put('/students/:id', isAdminAuth, photo, scope, UpdateStudent);
router.delete('/students/:id', isAdminAuth, scope, DeleteStudent);
router.post('/students/:id/card-resync', isAdminAuth, scope, validateRequest(resyncSchema, MODULE), ResyncCard);

module.exports = router;
