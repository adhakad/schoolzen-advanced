'use strict';
const FieldConfigModel = require('../../models/settings/field-config');
const SchoolModel = require('../../models/school');
const { ValidationError, NotFoundError, ConflictError } = require('../../errors');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/settings.messages');
const { onFieldConfigChanged } = require('../../helpers/settings/cache-invalidation');
const { rethrowDuplicate, isDuplicateKey, fieldKeyDuplicate } = require('../../helpers/settings/duplicate-key');
const { withTransaction } = require('../../helpers/with-transaction');
const { STATES, canonicalState } = require('../../helpers/settings/states');
const {
    DISPLAY_GROUPS, CUSTOM_GROUPS, FIXED_FIELDS, EDITABLE_RULE_KEYS, CUSTOM_FIELD_TYPES,
    displayGroupOf, mergeFieldConfig, deriveFieldKey, sanitizeRule, ruleProblems,
    isLossyTypeChange, removedOptions, countFieldData, countWithValue, countWithValues,
} = require('../../helpers/settings/field-config.utils');
const { DEFAULT_STUDENT_FIELD_CONFIG } = require('../../validators/student/field-config.validator');

const MODULE = 'settings';
const ENTITY = 'Field';

// Settings → Admission Form Fields (settings/admission-form-fields.md, errors.md Page 2).
//
// FieldConfig rows hold only what a school changed or added; mergeFieldConfig() lays them
// over the seed, and getStudentFieldConfig() serves that same merge to the Admission form and
// the Excel import — one source, so the form and the import can never drift apart.

const fail = (Type, code, message, extra = {}) => new Type(message, { module: MODULE, code, ...extra });
const notFound = () => fail(NotFoundError, 'NOT_FOUND', messages.notFound());
const definitionInvalid = (field) => fail(ValidationError, 'FIELD_DEFINITION_INVALID', messages.fieldDefinitionInvalid(), {
    fields: [{ field, message: messages.fieldDefinitionInvalid(), code: 'FIELD_DEFINITION_INVALID' }],
});

const loadMerged = async (adminId) => {
    const rows = await FieldConfigModel.find({ adminId }).lean();
    return { rows, merged: mergeFieldConfig(DEFAULT_STUDENT_FIELD_CONFIG, rows) };
};

const isFixed = (field) => FIXED_FIELDS.includes(field.fieldKey);

// A RegExp pattern (the seeded name rule) doesn't survive JSON — send its source.
const serializableRule = (rule = {}) => Object.fromEntries(Object.entries(rule)
    .map(([key, value]) => [key, value instanceof RegExp ? value.source : value]));

const toRow = (field, counts) => ({
    fieldKey: field.fieldKey,
    label: field.label,
    group: field.group,
    displayGroup: displayGroupOf(field),
    required: Boolean(field.required),
    visible: field.visible !== false,
    locked: Boolean(field.locked),
    fixed: isFixed(field),
    isCustom: Boolean(field.isCustom),
    stateSpecific: field.stateSpecific || null,
    validationRule: serializableRule(field.validationRule),
    editableRuleKeys: EDITABLE_RULE_KEYS[field.validationRule && field.validationRule.type] || [],
    dataCount: counts[field.fieldKey] || 0,
    version: field.version || 0,
});

/** GET /admission-form-fields — the grouped list, with each field's live data count. */
let GetFieldConfig = async (req, res) => {
    const adminId = req.query.adminId;
    const [{ merged }, school] = await Promise.all([
        loadMerged(adminId),
        SchoolModel.findOne({ adminId }, 'state').lean(),
    ]);
    const counts = await countFieldData(adminId, merged);
    return res.status(200).json({
        fields: merged.map((field) => toRow(field, counts)),
        schoolState: canonicalState(school && school.state),
        states: STATES,
        groups: DISPLAY_GROUPS,
        customGroups: CUSTOM_GROUPS,
        customTypes: CUSTOM_FIELD_TYPES,
        summary: { total: merged.length, custom: merged.filter((field) => field.isCustom).length },
    });
};

/**
 * POST /admission-form-fields/:fieldKey/impact { type?, options? } — what a pending type or
 * options change would do to existing students, fetched live by the gear modal BEFORE save.
 */
let GetFieldImpact = async (req, res) => {
    const { adminId, type, options } = req.body;
    const { merged } = await loadMerged(adminId);
    const field = merged.find((item) => item.fieldKey === req.params.fieldKey);
    if (!field) throw notFound();

    const currentType = field.validationRule.type;
    const dataCount = await countWithValue(adminId, field);
    const typeChanging = Boolean(type) && type !== currentType;
    const removed = Array.isArray(options) && currentType === 'dropdown' && (!typeChanging)
        ? removedOptions(field.validationRule.options, options) : [];
    const optionRemovalCount = removed.length ? await countWithValues(adminId, field, removed) : 0;

    return res.status(200).json({
        dataCount,
        typeChange: typeChanging && dataCount > 0
            ? { blocked: isLossyTypeChange(currentType, type), count: dataCount, message: messages.fieldTypeChangeUnsafe() }
            : null,
        optionRemoval: optionRemovalCount > 0
            ? { removed, count: optionRemovalCount, message: messages.fieldOptionRemovalUnsafe(optionRemovalCount) }
            : null,
    });
};

/** POST /admission-form-fields — a new custom (or custom state-specific) field. */
let CreateField = async (req, res) => {
    const { adminId, label, type, group, stateSpecific, required, visible, validationRule } = req.body;
    const actor = req.staffId || 'system';

    if (!label) throw definitionInvalid('label');
    if (!CUSTOM_FIELD_TYPES.includes(type)) throw definitionInvalid('type');
    const fieldKey = deriveFieldKey(label);
    if (!fieldKey) throw definitionInvalid('label');

    let state = null;
    if (stateSpecific) {
        state = canonicalState(stateSpecific);
        if (!state) {
            throw fail(ValidationError, 'VALIDATION_FAILED', messages.fieldStateInvalid(), {
                fields: [{ field: 'stateSpecific', message: messages.fieldStateInvalid(), code: 'VALIDATION_FAILED' }],
            });
        }
    }
    const fieldGroup = CUSTOM_GROUPS.includes(group) ? group : 'student';

    const rule = sanitizeRule(type, validationRule || {});
    const problems = ruleProblems(rule);
    if (problems.length) {
        throw fail(ValidationError, 'VALIDATION_FAILED', problems[0].message, {
            fields: problems.map((p) => ({ ...p, code: 'VALIDATION_FAILED' })),
        });
    }

    // A custom key may not shadow a seeded field either — the unique index only sees saved rows.
    if (DEFAULT_STUDENT_FIELD_CONFIG.some((field) => field.fieldKey === fieldKey)
        || await FieldConfigModel.exists({ adminId, fieldKey })) {
        throw fieldKeyDuplicate();
    }

    let created;
    try {
        created = await FieldConfigModel.create({
            adminId, fieldKey, label, group: fieldGroup, required, visible,
            locked: false, validationRule: rule, stateSpecific: state, isCustom: true,
            version: 1, createdBy: actor, updatedBy: actor,
        });
    } catch (error) {
        rethrowDuplicate(error, () => fieldKeyDuplicate());
    }

    await onFieldConfigChanged(adminId);
    return res.status(201).json({ message: success.created(ENTITY), fieldKey: created.fieldKey });
};

/**
 * Check one pending change against the current merged field. Returns the $set to persist,
 * or throws-as-data: { code, message, Type } for the per-row report.
 */
const planChange = async (adminId, field, change) => {
    const set = {};
    const problem = (Type, code, message, field_) => ({ Type, code, message, field: field_ });

    if (change.version !== (field.version || 0)) {
        return { problem: problem(ConflictError, 'FIELD_CONFIG_CHANGED', messages.fieldConfigChanged()) };
    }

    if (change.label !== undefined) {
        if (!change.label) return { problem: problem(ValidationError, 'FIELD_DEFINITION_INVALID', messages.fieldDefinitionInvalid(), 'label') };
        set.label = change.label;
    }

    // Locked (Name/DOB/Gender) and fixed (Admission No./Roll No.) — backend backstop.
    const touchesFlags = (change.required !== undefined && change.required !== Boolean(field.required))
        || (change.visible !== undefined && change.visible !== (field.visible !== false));
    if (touchesFlags && (field.locked || isFixed(field))) {
        return { problem: problem(ConflictError, 'FIELD_LOCKED', messages.fieldLocked()) };
    }
    if (change.required !== undefined) set.required = change.required;
    if (change.visible !== undefined) set.visible = change.visible;

    if (change.validationRule !== undefined || change.type) {
        const currentType = field.validationRule.type;
        // A seeded field's type belongs to the seed; only a custom field may change it.
        const nextType = field.isCustom && change.type ? change.type : currentType;
        if (field.isCustom && !CUSTOM_FIELD_TYPES.includes(nextType)) {
            return { problem: problem(ValidationError, 'FIELD_DEFINITION_INVALID', messages.fieldDefinitionInvalid(), 'type') };
        }
        const incoming = sanitizeRule(nextType, change.validationRule || {});
        // Validate the rule as it will be in effect (seed/previous values + this edit).
        const effective = nextType === currentType ? { ...field.validationRule, ...incoming } : incoming;
        Object.keys(effective).forEach((key) => { if (effective[key] === null) delete effective[key]; });
        const problems = ruleProblems(effective);
        if (problems.length) {
            return { problem: problem(ValidationError, 'VALIDATION_FAILED', problems[0].message, problems[0].field) };
        }

        if (nextType !== currentType) {
            const count = await countWithValue(adminId, field);
            if (count > 0 && (isLossyTypeChange(currentType, nextType) || !change.acknowledgeTypeChange)) {
                return { problem: problem(ConflictError, 'FIELD_TYPE_CHANGE_UNSAFE', messages.fieldTypeChangeUnsafe()) };
            }
        } else if (currentType === 'dropdown' && Array.isArray(incoming.options)) {
            const removed = removedOptions(field.validationRule.options, incoming.options);
            const count = removed.length ? await countWithValues(adminId, field, removed) : 0;
            if (count > 0 && !change.acknowledgeOptionRemoval) {
                return { problem: problem(ConflictError, 'FIELD_OPTION_REMOVAL_UNSAFE', messages.fieldOptionRemovalUnsafe(count)) };
            }
        }
        // Custom rows store the whole rule; seeded overrides store only the edited keys.
        set.validationRule = field.isCustom
            ? { ...(nextType === currentType ? field.validationRule : {}), ...incoming, type: nextType }
            : { ...savedOverride(field), ...withoutType(incoming) };
    }
    return { set };
};

const withoutType = ({ type, ...rest }) => rest;
// The seeded field's previously saved override keys are already merged into field.validationRule;
// re-saving just the editable ones keeps the row an override, never a seed copy.
const savedOverride = (field) => Object.fromEntries((EDITABLE_RULE_KEYS[field.validationRule.type] || [])
    .filter((key) => field.validationRule[key] !== undefined)
    .map((key) => [key, field.validationRule[key]]));

/**
 * PUT /admission-form-fields { changes:[…] } — the page's one "Save Changes". Every change is
 * checked first; any problem refuses the whole save with one row per failing field
 * (rows[].id = fieldKey), so nothing is half-applied. Writes are version-conditional.
 */
let SaveFieldChanges = async (req, res) => {
    const { adminId, changes } = req.body;
    const actor = req.staffId || 'system';
    const { merged } = await loadMerged(adminId);
    const byKey = new Map(merged.map((field) => [field.fieldKey, field]));

    const plans = [];
    const problems = [];
    for (const change of changes) {
        const field = byKey.get(change.fieldKey);
        if (!field) {
            problems.push({ id: change.fieldKey, Type: NotFoundError, code: 'NOT_FOUND', message: messages.notFound() });
            continue;
        }
        // eslint-disable-next-line no-await-in-loop -- counts only run for type/options edits
        const plan = await planChange(adminId, field, change);
        if (plan.problem) problems.push({ id: change.fieldKey, ...plan.problem });
        else plans.push({ field, change, set: plan.set });
    }

    if (problems.length) {
        const first = problems[0];
        const rows = problems.map((p) => ({ id: p.id, code: p.code, message: p.message,
            ...(p.field ? { fields: [{ field: p.field, message: p.message, code: p.code }] } : {}) }));
        // A conflict (locked / unsafe / changed) outranks plain validation for the category.
        const conflict = problems.find((p) => p.Type === ConflictError);
        const Type = conflict ? ConflictError : first.Type;
        throw new Type((conflict || first).message, { module: MODULE, code: (conflict || first).code, rows });
    }

    const now = new Date();
    try {
        await withTransaction(async (dbSession) => {
            for (const { field, change, set } of plans) {
                if (!Object.keys(set).length) continue;
                const $set = { ...set, updatedBy: actor, updatedAt: now };
                if ((field.version || 0) === 0) {
                    // eslint-disable-next-line no-await-in-loop
                    await FieldConfigModel.create([{
                        adminId, fieldKey: field.fieldKey, isCustom: false, ...set,
                        version: 1, createdBy: actor, updatedBy: actor,
                    }], { session: dbSession });
                } else {
                    // eslint-disable-next-line no-await-in-loop
                    const result = await FieldConfigModel.updateOne(
                        { adminId, fieldKey: field.fieldKey, version: change.version },
                        { $set, $inc: { version: 1 } },
                        { session: dbSession }
                    );
                    if (result.matchedCount !== 1) throw Object.assign(new Error('changed'), { configChanged: field.fieldKey });
                }
            }
        });
    } catch (error) {
        if (!error.configChanged && !isDuplicateKey(error)) throw error;
        throw fail(ConflictError, 'FIELD_CONFIG_CHANGED', messages.fieldConfigChanged(), {
            rows: [{ id: error.configChanged || null, code: 'FIELD_CONFIG_CHANGED', message: messages.fieldConfigChanged() }],
        });
    }

    await onFieldConfigChanged(adminId);
    return res.status(200).json({ message: success.updated('Admission form fields'), saved: plans.length });
};

/**
 * DELETE /admission-form-fields/:fieldKey?confirm=DELETE — custom fields only, and only
 * while no student holds a value under it (FIELD_HAS_DATA — hiding is the reversible option).
 */
let DeleteField = async (req, res) => {
    const adminId = req.query.adminId;
    if (req.query.confirm !== 'DELETE') {
        throw new ValidationError(messages.deleteConfirmRequired(), {
            module: MODULE, fields: [{ field: 'confirm', message: messages.deleteConfirmRequired() }],
        });
    }
    const row = await FieldConfigModel.findOne({ adminId, fieldKey: req.params.fieldKey }).lean();
    if (!row) {
        if (DEFAULT_STUDENT_FIELD_CONFIG.some((field) => field.fieldKey === req.params.fieldKey)) {
            throw fail(ConflictError, 'FIELD_LOCKED', messages.fieldNotCustom());
        }
        throw notFound();
    }
    if (!row.isCustom) throw fail(ConflictError, 'FIELD_LOCKED', messages.fieldNotCustom());

    const count = await countWithValue(adminId, { ...row, isCustom: true });
    if (count > 0) throw fail(ConflictError, 'FIELD_HAS_DATA', messages.fieldHasData(count), { context: { count } });

    await FieldConfigModel.deleteOne({ _id: row._id, adminId });
    await onFieldConfigChanged(adminId);
    return res.status(200).json({ message: success.deleted(ENTITY) });
};

module.exports = { GetFieldConfig, GetFieldImpact, CreateField, SaveFieldChanges, DeleteField };
