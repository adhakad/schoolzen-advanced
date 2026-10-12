'use strict';
const TcStructureModel = require('../../models/certificates/tc-structure');
const TransferCertificateModel = require('../../models/certificates/transfer-certificate');
const { ConflictError, ValidationError } = require('../../errors');
const messages = require('../../helpers/messages/certificates.messages');
const { TC_FIELDS } = require('../../helpers/certificates/tc-fields');
const { isValidSerial } = require('../../helpers/certificates/tc-rules');
const {
    MODULE, PERMISSIONS, actorOf, canEditOf, requireSessionId, ensureStructure, issuedCountOf,
} = require('../../helpers/certificates/tc-context');
const { findSessionId } = require('../../helpers/academic-session/session-resolver');
const { logActivity } = require('../../services/activity-log.service');

// TC Structure (certificates/tc-structure.md) — one school-wide settings form. The 19 fields
// are the code constant; only the next serial number is editable, and only with the explicit
// 'tc-structure' grant (routes). Never cached: nextSerialNumber is a live counter
// (certificates/optimization.md).

const serialError = (code, message) => new ValidationError(message, {
    module: MODULE, code, fields: [{ field: 'nextSerialNumber', message, code }],
});

const view = (structure, sessionId, req) => ({
    fields: TC_FIELDS.map((field) => ({ no: field.no, label: field.label })),
    nextSerialNumber: structure.nextSerialNumber,
    issuedThisSession: sessionId ? issuedCountOf(structure, sessionId) : 0,
    canEdit: canEditOf(req, PERMISSIONS.STRUCTURE),
});

let GetTcStructure = async (req, res) => {
    const { adminId, session } = req.query;
    const [structure, sessionId] = await Promise.all([ensureStructure(adminId), findSessionId(adminId, session)]);
    return res.status(200).json(view(structure, sessionId, req));
};

/**
 * Correct the next serial — affects only certificates issued after this point. Refused if
 * that exact number is already printed on a certificate (TC_SERIAL_IN_USE), and if the
 * counter moved since the form loaded (another TC issued meanwhile → TC_SERIAL_CHANGED).
 */
let UpdateTcStructure = async (req, res) => {
    const { adminId, session, nextSerialNumber, expectedSerialNumber } = req.body;
    const serial = String(nextSerialNumber).trim();
    if (!isValidSerial(serial)) throw serialError('TC_SERIAL_INVALID', messages.serialInvalid());
    const current = await ensureStructure(adminId);
    if (await TransferCertificateModel.exists({ adminId, serialNumber: serial })) {
        throw serialError('TC_SERIAL_IN_USE', messages.serialInUse());
    }
    const expected = expectedSerialNumber || current.nextSerialNumber;
    const updated = await TcStructureModel.findOneAndUpdate(
        { adminId, nextSerialNumber: expected },
        { $set: { nextSerialNumber: serial, updatedBy: actorOf(req), updatedAt: new Date() } },
        { new: true }
    ).lean();
    if (!updated) throw new ConflictError(messages.serialChanged(), { module: MODULE, code: 'TC_SERIAL_CHANGED' });

    if (expected !== serial) {
        await logActivity(req, {
            module: MODULE, action: 'certificates.tc-structure.update', targetId: String(updated._id),
            changes: { before: { nextSerialNumber: expected }, after: { nextSerialNumber: serial } },
        });
    }
    const sessionId = session ? await requireSessionId(adminId, session) : null;
    return res.status(200).json({ message: messages.structureSaved(), ...view(updated, sessionId, req) });
};

module.exports = { GetTcStructure, UpdateTcStructure };
