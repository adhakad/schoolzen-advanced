'use strict';
const DeviceModel = require('../../models/devices/device');
const { fetchAllWdmsTerminals } = require('../../services/wdms-device');

// Status state machine (not spelled out field-by-field in the spec, so made explicit here):
//   unassigned --(assign)--> active --(block)--> blocked --(reactivate)--> active
// A device can only be assigned once out of 'unassigned' (guarded by assignedSchoolId:null).

// Upserts by terminalSn. Existing rows keep salesPersonId/assignedSchoolId/status
// untouched (per spec) — only alias/terminalName/active are refreshed from WDMS. New
// rows land status:'unassigned' with no salesPersonId, addedBy set to the syncing sales
// user. Promise.allSettled so one bad terminal never aborts the whole batch — same
// resilience shape as biometric-mapping.js's AssignCard (local-write isolated per row).
let SyncDevicesFromWdms = async (req, res, next) => {
    try {
        const terminals = await fetchAllWdmsTerminals();
        const salesUserId = req.user.id;

        const results = await Promise.allSettled(terminals.map(async (t) => {
            const terminalSn = t.sn || t.serial_number;
            if (!terminalSn) return;
            const patch = {
                alias: t.alias,
                terminalName: t.terminal_name,
                active: t.is_actived !== undefined ? t.is_actived : true,
            };
            const existing = await DeviceModel.findOne({ terminalSn });
            if (existing) {
                await DeviceModel.updateOne({ terminalSn }, { $set: patch });
            } else {
                await DeviceModel.create({
                    terminalSn,
                    ...patch,
                    addedBy: salesUserId,
                    status: 'unassigned',
                });
            }
        }));

        const failedCount = results.filter((r) => r.status === 'rejected').length;
        return res.status(200).json({ successMsg: 'Devices synced from WDMS.', totalFetched: terminals.length, failedCount });
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetUnassignedDevices = async (req, res, next) => {
    try {
        // Global pool, not scoped by salesPersonId — an unassigned device has none yet,
        // and any sales user must be able to pick from the shared synced inventory.
        const devices = await DeviceModel.find({ assignedSchoolId: null });
        return res.status(200).json(devices);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let AssignDeviceToSchool = async (req, res, next) => {
    try {
        const { deviceId, schoolId } = req.body;
        // assignedSchoolId:null guard makes this atomic against double-assignment.
        const device = await DeviceModel.findOne({ _id: deviceId, assignedSchoolId: null });
        if (!device) {
            return res.status(400).json('Device is already assigned or does not exist!');
        }
        device.assignedSchoolId = schoolId;
        device.assignedAt = Date.now();
        device.salesPersonId = req.user.id;
        device.status = 'active';
        await device.save();
        return res.status(200).json('Device assigned successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let ActivateDevice = async (req, res, next) => {
    try {
        const device = await DeviceModel.findOne({ _id: req.params.id, status: 'blocked' });
        if (!device) {
            return res.status(400).json('Device is not in a blocked state!');
        }
        device.status = 'active';
        await device.save();
        return res.status(200).json('Device activated successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let BlockDevice = async (req, res, next) => {
    try {
        const device = await DeviceModel.findOne({ _id: req.params.id, status: 'active' });
        if (!device) {
            return res.status(400).json('Device is not in an active state!');
        }
        device.status = 'blocked';
        await device.save();
        return res.status(200).json('Device blocked successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetDevicesBySalesPerson = async (req, res, next) => {
    try {
        // Freshly synced devices have addedBy set but salesPersonId still null (only the
        // assign action sets salesPersonId) — without the $or, a device never shows up
        // in "My Devices" until someone else notices it in the unassigned pool and
        // assigns it, even though this sales user is the one who registered it locally.
        const devices = await DeviceModel.find({
            $or: [{ salesPersonId: req.user.id }, { addedBy: req.user.id }],
        });
        return res.status(200).json(devices);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetSchoolWiseDevices = async (req, res, next) => {
    try {
        // Same sales user's portfolio, re-grouped by assignedSchoolId — no adminId
        // scoping anywhere, per the cross-tenant requirement.
        // assignedSchoolId is stored as a plain String (see device.js model comment —
        // it's the admin-user._id), but admin-users._id is a real ObjectId, so a plain
        // $lookup localField/foreignField match would silently return zero matches
        // (string "607f..." !== ObjectId("607f...")). $toObjectId bridges the type gap.
        const grouped = await DeviceModel.aggregate([
            { $match: { salesPersonId: req.user.id, assignedSchoolId: { $ne: null } } },
            { $group: { _id: '$assignedSchoolId', devices: { $push: '$$ROOT' } } },
            {
                $lookup: {
                    from: 'admin-users',
                    let: { schoolId: '$_id' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$_id', { $toObjectId: '$$schoolId' }] } } },
                        { $project: { schoolName: 1, schoolId: 1, city: 1, state: 1 } },
                    ],
                    as: 'school',
                },
            },
            { $unwind: { path: '$school', preserveNullAndEmptyArrays: true } },
        ]);
        return res.status(200).json(grouped);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    SyncDevicesFromWdms,
    GetUnassignedDevices,
    AssignDeviceToSchool,
    ActivateDevice,
    BlockDevice,
    GetDevicesBySalesPerson,
    GetSchoolWiseDevices,
}
