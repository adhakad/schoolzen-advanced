'use strict';
const SchoolProfileV2Model = require('../../models/settings/school-profile');
const { BOARD_GROUPS, STATES, MEDIUMS } = require('../../helpers/settings/v2-school-profile-lists');
const { isDuplicateKey } = require('../../helpers/settings/duplicate-key');
const { uploadImageBuffer, destroyImages } = require('../../services/media/cloudinary.service');
const { logActivityV2, actorNameV2 } = require('../../services/v2-activity-log.service');

const MODULE = 'settings';

// Settings → School Profile (settings/school-profile.md). One document per school (adminId),
// created on the first save and updated in place afterwards — no create/delete pages.
// Every lookup is { adminId } from the verified token (req.adminId), never a client id.

const FIELDS = [
    'schoolName', 'board', 'medium', 'affiliationNumber', 'schoolCode', 'foundedYear', 'udiseNumber',
    'principalName', 'street', 'city', 'district', 'state', 'pinCode', 'phoneOne', 'phoneSecond',
    'email', 'website', 'senderName',
];
const PROJECTION = `${FIELDS.join(' ')} schoolLogo schoolLogoPublicId updatedAt updatedByName`;

const toView = (doc) => (doc ? {
    ...FIELDS.reduce((out, key) => ({ ...out, [key]: doc[key] == null ? null : doc[key] }), {}),
    schoolLogo: doc.schoolLogo || null,
    updatedAt: doc.updatedAt || null,
    updatedByName: doc.updatedByName || null,
} : null);

const blankToNull = (value) => (value === undefined || value === null || String(value).trim() === '' ? null : String(value).trim());

/** GET /school-profile → { profile | null, boards, states, mediums } (lists = the one constants file). */
let GetSchoolProfile = async (req, res) => {
    const doc = await SchoolProfileV2Model.findOne({ adminId: req.adminId }, PROJECTION).lean();
    return res.status(200).json({ profile: toView(doc), boards: BOARD_GROUPS, states: STATES, mediums: MEDIUMS });
};

/** PUT /school-profile — upsert. Body already validated (school-profile.validator.js). */
let SaveSchoolProfile = async (req, res) => {
    const adminId = req.adminId;
    const body = req.body;
    const before = await SchoolProfileV2Model.findOne({ adminId }, PROJECTION).lean();

    const next = {};
    FIELDS.forEach((key) => { next[key] = blankToNull(body[key]); });
    next.foundedYear = Number(next.foundedYear);
    if (next.email) next.email = next.email.toLowerCase();
    // Sender name defaults to the School Name the first time it is saved (and whenever cleared).
    if (!next.senderName) next.senderName = (before && before.senderName) || next.schoolName;

    // Logo: uploaded after validation, outside any write — a failed upload leaves the profile as it was.
    let oldLogoId = null;
    if (req.file) {
        const logo = await uploadImageBuffer(req.file.buffer, adminId, 'school-logo');
        next.schoolLogo = logo.url;
        next.schoolLogoPublicId = logo.publicId;
        oldLogoId = before && before.schoolLogoPublicId;
    } else if (body.removeLogo === true) {
        next.schoolLogo = null;
        next.schoolLogoPublicId = null;
        oldLogoId = before && before.schoolLogoPublicId;
    }

    const changed = Object.keys(next)
        .filter((key) => key !== 'schoolLogoPublicId')
        .filter((key) => String(before ? before[key] ?? '' : '') !== String(next[key] ?? ''));

    const actorName = await actorNameV2(req, adminId);
    const now = new Date();
    const update = {
        $set: { ...next, updatedAt: now, updatedBy: String(req.staffId || 'admin'), updatedByName: actorName },
        $setOnInsert: { adminId, createdAt: now, createdBy: String(req.staffId || 'admin') },
    };
    const write = () => SchoolProfileV2Model.findOneAndUpdate({ adminId }, update, { upsert: true, new: true, projection: PROJECTION }).lean();
    let saved;
    try {
        saved = await write();
    } catch (error) {
        // Two first saves raced on the unique adminId index — the loser updates the winner's row.
        if (!isDuplicateKey(error)) throw error;
        saved = await write();
    }

    await logActivityV2(req, {
        module: MODULE,
        action: 'settings.school-profile.save',
        targetId: String(saved._id),
        meta: { fields: changed, created: !before },
    });
    if (oldLogoId) await destroyImages([oldLogoId]);

    return res.status(200).json({ message: 'School profile saved', profile: toView(saved) });
};

module.exports = { GetSchoolProfile, SaveSchoolProfile };
