'use strict';
const express = require('express');
const router = express.Router();

const { isAdminAuth } = require('../../middleware/admin-auth');
const assertAdminScope = require('../../middleware/assert-admin-scope');
const validateRequest = require('../../middleware/validate-request');
const idempotency = require('../../middleware/idempotency');
const { singleUpload, excelFile } = require('../../middleware/single-upload');
const fileUpload = require('../../helpers/file-upload');
const {
    listStudentsQuerySchema,
    overviewQuerySchema,
    excelScopeSchema,
    bulkDeleteSchema,
    assignCardsSchema,
    resyncSchema,
} = require('../../validators/student/manage-students.validator');
const {
    ListStudents,
    GetOverview,
    GetStudent,
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
const photo = singleUpload(fileUpload.studentImage, 'photo', MODULE);
const sheet = singleUpload(excelFile, 'file', MODULE);
// Every write that creates or destroys something honours Idempotency-Key (after scope, so
// the key is per school).
const once = idempotency(MODULE);

router.get('/field-config', isAdminAuth, scope, GetFieldConfig);
router.get('/filter-options', isAdminAuth, scope, GetFilterOptions);
router.get('/jobs/:jobId', isAdminAuth, scope, GetJobStatus);

router.get('/students', isAdminAuth, scope, validateRequest(listStudentsQuerySchema, MODULE, 'query'), ListStudents);
router.get('/students/overview', isAdminAuth, scope, validateRequest(overviewQuerySchema, MODULE, 'query'), GetOverview);
// Declared before /students/:id so "excel" is never read as an id.
router.get('/students/excel/export', isAdminAuth, scope, validateRequest(excelScopeSchema, MODULE, 'query'), ExportExcel);
router.post('/students/excel/import', isAdminAuth, sheet, scope, once, validateRequest(excelScopeSchema, MODULE), ImportExcel);
router.post('/students/bulk-delete', isAdminAuth, scope, once, validateRequest(bulkDeleteSchema, MODULE), BulkDeleteStudents);
router.post('/students/cards', isAdminAuth, scope, once, validateRequest(assignCardsSchema, MODULE), AssignCards);

router.get('/students/:id', isAdminAuth, scope, GetStudent);
router.post('/students', isAdminAuth, photo, scope, once, CreateStudent);
router.put('/students/:id', isAdminAuth, photo, scope, once, UpdateStudent);
router.delete('/students/:id', isAdminAuth, scope, once, DeleteStudent);
router.post('/students/:id/card-resync', isAdminAuth, scope, validateRequest(resyncSchema, MODULE), ResyncCard);

module.exports = router;
