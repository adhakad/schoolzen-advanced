'use strict';
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');

// Attendance's write-through invalidation (attendance/optimization.md, "Invalidation
// triggers"). Roster writes invalidate nothing here — they re-enqueue reconcile, and THAT
// completing is what busts the day's live-status key.

const onShiftsChanged = (adminId) => cacheService.delPattern(cacheKeys.attendance.shiftsPattern(adminId));

const onLiveStatusChanged = (adminId, dateKey) => cacheService.del(cacheKeys.attendance.liveStatus(adminId, dateKey));

module.exports = { onShiftsChanged, onLiveStatusChanged };
