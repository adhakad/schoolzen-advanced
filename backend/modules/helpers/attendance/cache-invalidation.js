'use strict';
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');

// Attendance's write-through invalidation (attendance/optimization.md, "Invalidation
// triggers"). Roster writes invalidate nothing here — they re-enqueue reconcile, and THAT
// completing is what busts the day's live-status key.

// The shifts list is ONE key (shift-lookup.js) — a plain DEL, not a keyspace SCAN, which on
// managed Redis cost ~0.4 s per shift write (attendance-fix2.md Part B).
const onShiftsChanged = (adminId) => cacheService.del(cacheKeys.attendance.shifts(adminId));

const onLiveStatusChanged = (adminId, dateKey) => cacheService.del(cacheKeys.attendance.liveStatus(adminId, dateKey));

module.exports = { onShiftsChanged, onLiveStatusChanged };
