'use strict';
const mongoose = require('mongoose');
const ExamResultModel = require('../../models/examination/exam-result');

// The read Certificates' "Last Annual Exam & Result" (TC field 11) is meant to use once it
// is wired up: a student's most recent ANNUAL result (the template's last term), optionally
// limited to one session. Tenant-scoped; null when the student has none yet.
//
// Returns the snapshot only — what was printed — never recomputed from live structure data.

const getLastAnnualResult = async (adminId, studentId, sessionId = null) => {
    if (!mongoose.Types.ObjectId.isValid(String(studentId || ''))) return null;
    const filter = { adminId, studentId: new mongoose.Types.ObjectId(String(studentId)), isAnnual: true };
    if (sessionId) filter.sessionId = new mongoose.Types.ObjectId(String(sessionId));
    const result = await ExamResultModel.findOne(filter, 'sessionId className streamName term totals updatedAt')
        .sort({ updatedAt: -1 }).lean();
    if (!result) return null;
    return {
        sessionId: String(result.sessionId),
        className: result.className,
        streamName: result.streamName,
        term: result.term,
        result: result.totals ? result.totals.result : null,
        percentage: result.totals ? result.totals.percentage : null,
        // The TC's printed wording: "8th — Passed".
        text: result.className ? `${[result.className, result.streamName].filter(Boolean).join(' ')} — ${result.totals && result.totals.result === 'Pass' ? 'Passed' : 'Failed'}` : null,
    };
};

module.exports = { getLastAnnualResult };
