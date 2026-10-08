'use strict';
const AcademicClassModel = require('../../models/academic-setup/class');
const { getClassDisplayName } = require('../format-class-name');
const { NotFoundError, ValidationError } = require('../../errors');
const messages = require('../messages/settings.messages');

// The school's class → stream → section tree from Academic Setup (v2 'academic-class'),
// shaped for Settings' cascading `.dd`s (Roles' Add-a-Class, Marksheet's Class/Stream) and
// for resolving chip labels — ONE read per request, then O(1) lookups (no N+1).

const MODULE = 'settings';

const titleCase = (text) => String(text || '').replace(/\b\w/g, (c) => c.toUpperCase());

const loadClassTree = async (adminId) => {
    const classes = await AcademicClassModel.find({ adminId }, 'class order hasStreams sections streams')
        .sort({ order: 1 }).lean();
    return classes.map((cls) => ({
        _id: String(cls._id),
        label: getClassDisplayName(cls.class) || String(cls.class),
        hasStreams: Boolean(cls.hasStreams),
        sections: (cls.sections || []).map((s) => ({ _id: String(s._id), label: s.name })),
        streams: (cls.streams || []).map((st) => ({
            _id: String(st._id),
            label: titleCase(st.name),
            sections: (st.sections || []).map((s) => ({ _id: String(s._id), label: s.name })),
        })),
    }));
};

/** Map classId → tree node, for label resolution. */
const indexTree = (tree) => new Map(tree.map((cls) => [cls._id, cls]));

/** "8th · Section A", "11th · Science · Section B", "9th · All sections". */
const scopeLabel = (byId, { classId, streamId, sectionId }) => {
    const cls = classId && byId.get(String(classId));
    if (!cls) return 'Class removed';
    const parts = [cls.label];
    let sections = cls.sections;
    if (streamId) {
        const stream = cls.streams.find((st) => st._id === String(streamId));
        parts.push(stream ? stream.label : 'Stream removed');
        sections = stream ? stream.sections : [];
    }
    if (sectionId) {
        const section = sections.find((s) => s._id === String(sectionId));
        parts.push(section ? `Section ${section.label}` : 'Section removed');
    } else {
        parts.push(cls.hasStreams && !streamId ? 'All streams' : 'All sections');
    }
    return parts.join(' · ');
};

const notFound = (context) => new NotFoundError(messages.notFound(), { module: MODULE, code: 'NOT_FOUND', context });

const fieldError = (code, field, message) => new ValidationError(message, {
    module: MODULE, code, fields: [{ field, message, code }],
});

/**
 * Validate a class/stream/section against THIS school's Academic Setup. Tenant-checked:
 * another school's class id reads exactly like a missing one. Returns normalized ids.
 * @param {Object} [opts]
 * @param {Boolean} [opts.requireStream] a streamed class must name its stream
 */
const resolveScope = async (adminId, { classId, streamId, sectionId }, opts = {}) => {
    const cls = await AcademicClassModel.findOne({ _id: classId, adminId }, 'hasStreams sections streams').lean();
    if (!cls) throw notFound({ classId });

    let sections = cls.sections || [];
    if (cls.hasStreams) {
        if (!streamId) {
            if (opts.requireStream || sectionId) {
                throw fieldError('STREAM_REQUIRED', 'streamId', 'Select a stream for this class.');
            }
        } else {
            const stream = (cls.streams || []).find((st) => String(st._id) === String(streamId));
            if (!stream) throw notFound({ streamId });
            sections = stream.sections || [];
        }
    } else if (streamId) {
        throw fieldError('STREAM_NOT_ALLOWED', 'streamId', "This class doesn't have streams — leave this blank.");
    }
    if (sectionId && !sections.some((s) => String(s._id) === String(sectionId))) throw notFound({ sectionId });

    return {
        classId: cls._id,
        streamId: streamId ? String(streamId) : null,
        sectionId: sectionId ? String(sectionId) : null,
    };
};

module.exports = { loadClassTree, indexTree, scopeLabel, resolveScope };
