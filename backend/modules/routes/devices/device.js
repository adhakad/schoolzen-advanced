'use strict';
const express = require('express');
const router = express.Router();
const { isSalesAuth } = require('../../middleware/sales-auth');
const validate = require('../../middleware/validate');
const { assignDeviceSchema } = require('../../validators/devices/device');
const {
    SyncDevicesFromWdms,
    GetUnassignedDevices,
    AssignDeviceToSchool,
    ActivateDevice,
    BlockDevice,
    GetDevicesBySalesPerson,
    GetSchoolWiseDevices,
} = require('../../controllers/devices/device');

// Sales-only namespace — isolated from attendance-sync logic, reads Device only.
router.use(isSalesAuth);

router.post('/sync', SyncDevicesFromWdms);
router.get('/unassigned', GetUnassignedDevices);
router.post('/assign', validate(assignDeviceSchema), AssignDeviceToSchool);
router.put('/activate/:id', ActivateDevice);
router.put('/block/:id', BlockDevice);
router.get('/by-sales-person', GetDevicesBySalesPerson);
router.get('/school-wise', GetSchoolWiseDevices);

module.exports = router;
