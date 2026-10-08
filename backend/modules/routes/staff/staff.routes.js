'use strict';
const express = require('express');
const router = express.Router();

const { isAdminAuth } = require('../../middleware/admin-auth');
const assertAdminScope = require('../../middleware/assert-admin-scope');
const validateRequest = require('../../middleware/validate-request');
const v = require('../../validators/staff/staff.validator');
const departments = require('../../controllers/staff/departments.controller');
const designations = require('../../controllers/staff/designations.controller');
const staff = require('../../controllers/staff/manage-staff.controller');

// Mounted at /api/v2/staff — wiring only, no logic and no Mongoose calls.
//
// No Idempotency-Key on these writes (staff/optimization.md): they are HR/config writes, and a
// double-submit is caught by the unique indexes + the pages' own double-submit guards.
const MODULE = 'staff';
const base = [isAdminAuth, assertAdminScope(MODULE)];
const body = (schema) => validateRequest(schema, MODULE);
const query = (schema) => validateRequest(schema, MODULE, 'query');

// Departments
router.get('/departments', ...base, query(v.departmentListSchema), departments.GetDepartments);
router.get('/departments/options', ...base, departments.GetDepartmentOptions);
router.post('/departments', ...base, body(v.departmentSchema), departments.CreateDepartment);
router.put('/departments/:id', ...base, body(v.departmentSchema), departments.UpdateDepartment);
router.delete('/departments/:id', ...base, query(v.deleteQuerySchema), departments.DeleteDepartment);

// Designations
router.get('/designations', ...base, query(v.designationListSchema), designations.GetDesignations);
router.get('/designations/options', ...base, designations.GetDesignationOptions);
router.post('/designations', ...base, body(v.designationSchema), designations.CreateDesignation);
router.put('/designations/:id', ...base, body(v.designationSchema), designations.UpdateDesignation);
router.delete('/designations/:id', ...base, query(v.deleteQuerySchema), designations.DeleteDesignation);

// Manage Staff
router.get('/jobs/:jobId', ...base, staff.GetJobStatus);
router.get('/members', ...base, query(v.staffListSchema), staff.ListStaff);
router.post('/members/bulk-delete', ...base, body(v.bulkDeleteStaffSchema), staff.BulkDeleteStaff);
router.post('/members/cards', ...base, body(v.assignCardsSchema), staff.AssignCards);
router.get('/members/:id', ...base, staff.GetStaff);
router.post('/members', ...base, body(v.staffSchema), staff.CreateStaff);
router.put('/members/:id', ...base, body(v.staffSchema), staff.UpdateStaff);
router.patch('/members/:id/status', ...base, body(v.changeStatusSchema), staff.ChangeStatus);
router.delete('/members/:id', ...base, staff.DeleteStaff);
router.post('/members/:id/card-remove', ...base, body(v.adminOnlySchema), staff.RemoveCard);
router.post('/members/:id/card-resync', ...base, body(v.adminOnlySchema), staff.ResyncCard);

module.exports = router;
