'use strict';
const HolidayModel = require('../models/holiday');
const HolidayTemplateModel = require('../models/holiday-template');
const HolidayAssignmentModel = require('../models/holiday-assignment');
const ClassHolidayAssignmentModel = require('../models/class-holiday-assignment');
const StudentModel = require('../models/student');
const { getStudentClassMap } = require('./class-shift-lookup');
const { toDateKey, eachDateInRange, parseDateKey } = require('../helpers/date-only');

// DECLARED HOLIDAYS, in the four shapes the attendance pipeline reads them.
//
// Express-unaware and called in-process, the same as roster-lookup.js and leave-lookup.js —
// the reconcile worker has no HTTP layer to go through.
//
// HOLIDAYS ARE PER-PERSON, NOT PER-SCHOOL. A person follows a HolidayTemplate, and the
// template is what carries the dates. Staff and teachers are assigned individually
// (models/holiday-assignment.js); students are assigned by CLASS
// (models/class-holiday-assignment.js), mirroring the Roster-vs-ClassShift split the shift
// side already draws. This is why every export takes a person or a person list rather than
// just a school — the Phase 6 stub these replaced was school-wide and could not express
// "the office is open on the day the classrooms are shut".
//
// NO ASSIGNMENT MEANS NO HOLIDAYS. An unassigned person gets an empty map and their
// non-punch days stay Absent. That is deliberate: assignment is the switch that turns
// holidays on, exactly as Roster and ClassShift gate whether somebody was expected at all.
//
// Batched by (school, date) and (school, month) for the reason roster-lookup.js is:
// reconciliation processes a whole school-day at once and the grid renders a whole
// school-month at once. A per-person query would be thousands of round-trips per school.

// The same composite key roster-lookup.js, leave-lookup.js and attendance-reconcile.js
// batch on, so the worker can read every map with one lookup.
const personKeyOf = (personType, personId) => `${personType}|${personId}`;

// UTC midnights bracketing the month. Day 0 of the NEXT month is the last day of this one,
// so this needs no leap-year table — the same trick leave-lookup.js uses.
const monthBounds = (year, month) => ({
    monthStart: new Date(Date.UTC(year, month - 1, 1)),
    monthEnd: new Date(Date.UTC(year, month, 0)),
});

// ---------------------------------------------------------------------------
// INTERNAL — the one query set every export below is built on.
//
// templateId -> ("YYYY-MM-DD" -> Holiday), for the templates actually in use.
//
// Two queries regardless of how many templates or holidays are involved: the templates, then
// ONE Holiday read over the union of their holidayIds narrowed by month overlap. Ranges are
// expanded in memory and CLIPPED to the month, so a Diwali break running 29 Oct - 2 Nov
// contributes three keys to October and two to November without being read twice.
//
// Overlap, not containment: a holiday starting on or before the month ends and finishing on
// or after it starts touches this month, even if neither of its own ends falls inside it.
// ---------------------------------------------------------------------------
const buildTemplateDayMaps = async (adminId, templateIds, year, month) => {
    const mapByTemplateId = new Map();
    const uniqueTemplateIds = [...new Set(templateIds.map(String))];
    if (uniqueTemplateIds.length === 0) return mapByTemplateId;

    const { monthStart, monthEnd } = monthBounds(year, month);

    const templates = await HolidayTemplateModel
        .find({ _id: { $in: uniqueTemplateIds }, adminId }, { holidayIds: 1 })
        .lean();
    if (templates.length === 0) return mapByTemplateId;

    const allHolidayIds = new Set();
    for (const template of templates) {
        for (const holidayId of template.holidayIds || []) allHolidayIds.add(String(holidayId));
    }
    if (allHolidayIds.size === 0) return mapByTemplateId;

    const holidays = await HolidayModel
        .find({
            _id: { $in: [...allHolidayIds] },
            adminId,
            startDate: { $lte: monthEnd },
            endDate: { $gte: monthStart },
        })
        .lean();
    if (holidays.length === 0) return mapByTemplateId;

    // Expanded ONCE per holiday, then shared by every template that carries it — two
    // templates both containing Diwali cost one expansion, not two.
    const keysByHolidayId = new Map();
    for (const holiday of holidays) {
        // Clipped to the month before expanding, so a long break never walks days this
        // caller is not asking about.
        const from = holiday.startDate < monthStart ? monthStart : holiday.startDate;
        const to = holiday.endDate > monthEnd ? monthEnd : holiday.endDate;
        keysByHolidayId.set(
            holiday._id.toString(),
            { holiday, dateKeys: eachDateInRange(toDateKey(from), toDateKey(to), null).map(toDateKey) },
        );
    }

    for (const template of templates) {
        const dayMap = new Map();
        for (const holidayId of template.holidayIds || []) {
            const entry = keysByHolidayId.get(String(holidayId));
            if (!entry) continue;
            // Last one wins on an overlap. Two holidays covering the same date is a data
            // choice the school made (an exam break inside a festival week); either name is
            // a truthful answer and the day is a holiday regardless.
            for (const dateKey of entry.dateKeys) dayMap.set(dateKey, entry.holiday);
        }
        mapByTemplateId.set(template._id.toString(), dayMap);
    }
    return mapByTemplateId;
};

// ---------------------------------------------------------------------------
// INTERNAL — the school's assignment rows, in the two shapes the exports need.
// One query per collection, never one per person.
// ---------------------------------------------------------------------------
const loadAssignments = async (adminId, { personTypes, includeClasses }) => {
    const [personRows, classRows] = await Promise.all([
        personTypes && personTypes.length > 0
            ? HolidayAssignmentModel
                .find({ adminId, personType: { $in: personTypes } }, { personType: 1, personId: 1, templateId: 1 })
                .lean()
            : [],
        includeClasses
            ? ClassHolidayAssignmentModel.find({ adminId }, { class: 1, templateId: 1, _id: 0 }).lean()
            : [],
    ]);

    const templateIdByPersonKey = new Map(
        personRows.map((row) => [personKeyOf(row.personType, row.personId), String(row.templateId)]),
    );
    // String() on both sides for the reason models/class-shift.js gives: student.class is a
    // Number while the assignment stores a String.
    const templateIdByClass = new Map(
        classRows.map((row) => [String(row.class), String(row.templateId)]),
    );
    return { templateIdByPersonKey, templateIdByClass };
};

/**
 * Holidays covering one school-day, for everyone who punched — the reconcile worker's form.
 *
 * Returns the SAME composite key attendance-reconcile.js already batches roster and leave on,
 * so resolving a person's holiday is one Map hit inside its existing single O(n) pass.
 *
 * Students' classes are resolved by reusing getStudentClassMap from class-shift-lookup.js —
 * one query for every punching student at once, and the same documents the shift resolution
 * on that path already reads.
 *
 * A fixed handful of round-trips regardless of headcount.
 *
 * @param {String} adminId
 * @param {Date|String} date
 * @param {String[]} [studentIds] the students who punched; omit when none did
 * @returns {Promise<Map<String, Object>>} "personType|personId" -> Holiday doc
 */
const getHolidayMapForDate = async (adminId, date, studentIds = []) => {
    const holidayByPersonKey = new Map();
    const parsed = parseDateKey(date);
    if (!adminId || !parsed) return holidayByPersonKey;

    const hasStudents = studentIds.length > 0;
    const [{ templateIdByPersonKey, templateIdByClass }, classByStudentId] = await Promise.all([
        loadAssignments(adminId, { personTypes: ['staff', 'teacher'], includeClasses: hasStudents }),
        hasStudents ? getStudentClassMap(studentIds) : new Map(),
    ]);

    // Only the templates somebody is actually on — an unassigned template costs nothing.
    const inUse = [...templateIdByPersonKey.values()];
    if (hasStudents) {
        for (const classKey of classByStudentId.values()) {
            const templateId = templateIdByClass.get(classKey);
            if (templateId) inUse.push(templateId);
        }
    }
    const mapByTemplateId = await buildTemplateDayMaps(adminId, inUse, parsed.year, parsed.month);
    if (mapByTemplateId.size === 0) return holidayByPersonKey;

    for (const [personKey, templateId] of templateIdByPersonKey) {
        const holiday = (mapByTemplateId.get(templateId) || new Map()).get(parsed.dateKey);
        if (holiday) holidayByPersonKey.set(personKey, holiday);
    }
    for (const [studentId, classKey] of classByStudentId) {
        const templateId = templateIdByClass.get(classKey);
        if (!templateId) continue;
        const holiday = (mapByTemplateId.get(templateId) || new Map()).get(parsed.dateKey);
        if (holiday) holidayByPersonKey.set(personKeyOf('student', studentId), holiday);
    }

    return holidayByPersonKey;
};

/**
 * ONE person's holidays across one month — the per-person calendar read path, and the one
 * controllers/leave-request.js expandLeaveDates uses to drop holidays out of a leave range.
 *
 * For a student the class is resolved here rather than being demanded of the caller: it is
 * one projected findOne and it keeps every call site to the same four arguments.
 *
 * @param {String} adminId
 * @param {String} personType 'student' | 'teacher' | 'staff'
 * @param {String} personId
 * @param {Number} year
 * @param {Number} month 1-12 (August = 8), matching helpers/date-only.js parseDateKey
 * @returns {Promise<Map<String, Object>>} "YYYY-MM-DD" -> Holiday doc
 */
const getHolidayMapForMonth = async (adminId, personType, personId, year, month) => {
    if (!adminId || !personType || !personId || !year || !month) return new Map();

    let templateId = null;
    if (personType === 'student') {
        const student = await StudentModel.findOne({ _id: personId }, { class: 1 }).lean();
        if (!student) return new Map();
        const assignment = await ClassHolidayAssignmentModel
            .findOne({ adminId, class: String(student.class) }, { templateId: 1 })
            .lean();
        templateId = assignment ? String(assignment.templateId) : null;
    } else {
        const assignment = await HolidayAssignmentModel
            .findOne({ adminId, personType, personId }, { templateId: 1 })
            .lean();
        templateId = assignment ? String(assignment.templateId) : null;
    }
    // Not assigned — see the file header. An empty map, not an error.
    if (!templateId) return new Map();

    const mapByTemplateId = await buildTemplateDayMaps(adminId, [templateId], year, month);
    return mapByTemplateId.get(templateId) || new Map();
};

/**
 * A WHOLE SCHOOL's holidays for one month, keyed by person — for the calendar grid.
 *
 * The batched form services/attendance-calendar.js getSchoolMonthGrid needs: a fixed number
 * of queries regardless of headcount, where calling getHolidayMapForMonth per row would be
 * two per person. That is the whole reason this exists as a separate export.
 *
 * Takes the `people` array the caller has ALREADY loaded — their documents carry `.class`,
 * so students cost no extra query here at all.
 *
 * @param {String} adminId
 * @param {String} personType
 * @param {Array} people lean person docs (only `_id` and, for students, `class` are read)
 * @param {Number} year
 * @param {Number} month 1-12
 * @returns {Promise<Map<String, Map<String, Object>>>} personId -> ("YYYY-MM-DD" -> Holiday)
 */
const getHolidayMapForPeopleMonth = async (adminId, personType, people, year, month) => {
    const byPersonId = new Map();
    if (!adminId || !personType || !people || people.length === 0 || !year || !month) return byPersonId;

    const isStudent = personType === 'student';
    const { templateIdByPersonKey, templateIdByClass } = await loadAssignments(adminId, {
        personTypes: isStudent ? [] : [personType],
        includeClasses: isStudent,
    });

    // Resolve each person to a template first, so only the templates actually in play are
    // expanded — a school with twenty templates and one in use pays for the one.
    const templateIdByPersonId = new Map();
    for (const person of people) {
        const personId = person._id.toString();
        const templateId = isStudent
            ? templateIdByClass.get(String(person.class))
            : templateIdByPersonKey.get(personKeyOf(personType, personId));
        if (templateId) templateIdByPersonId.set(personId, templateId);
    }
    if (templateIdByPersonId.size === 0) return byPersonId;

    const mapByTemplateId = await buildTemplateDayMaps(
        adminId, [...templateIdByPersonId.values()], year, month,
    );

    // The SAME Map instance is shared by every person on one template rather than copied per
    // row — buildDayEntries only ever reads it, and a 400-pupil school on one calendar would
    // otherwise allocate 400 identical maps per render.
    for (const [personId, templateId] of templateIdByPersonId) {
        const dayMap = mapByTemplateId.get(templateId);
        if (dayMap && dayMap.size > 0) byPersonId.set(personId, dayMap);
    }
    return byPersonId;
};

/**
 * Holiday date keys for a MIXED list of people across several months — the batched form
 * controllers/leave-request.js expandLeaveDatesForPage needs.
 *
 * A page of leave requests spans arbitrary people of every type and arbitrary months, and
 * calling getHolidayMapForMonth per row would make the list endpoint an N+1. This resolves
 * every person once, then expands each distinct month once.
 *
 * @param {String} adminId
 * @param {Array} persons [{ personType, personId }]
 * @param {Array} months [{ year, month }] — as produced by parseDateKey
 * @returns {Promise<Map<String, Set<String>>>} "personType|personId" -> Set of "YYYY-MM-DD"
 */
const getHolidayKeysForPersons = async (adminId, persons, months) => {
    const keysByPersonKey = new Map();
    if (!adminId || !persons || persons.length === 0 || !months || months.length === 0) {
        return keysByPersonKey;
    }

    const studentIds = [...new Set(
        persons.filter((person) => person.personType === 'student').map((person) => String(person.personId)),
    )];
    const hasStudents = studentIds.length > 0;

    const [{ templateIdByPersonKey, templateIdByClass }, classByStudentId] = await Promise.all([
        loadAssignments(adminId, { personTypes: ['staff', 'teacher'], includeClasses: hasStudents }),
        hasStudents ? getStudentClassMap(studentIds) : new Map(),
    ]);

    // Person -> template, for the people on this page only.
    const templateIdByRequestKey = new Map();
    for (const person of persons) {
        const personKey = personKeyOf(person.personType, person.personId);
        if (templateIdByRequestKey.has(personKey)) continue;
        const templateId = person.personType === 'student'
            ? templateIdByClass.get(classByStudentId.get(String(person.personId)))
            : templateIdByPersonKey.get(personKey);
        if (templateId) templateIdByRequestKey.set(personKey, templateId);
    }
    if (templateIdByRequestKey.size === 0) return keysByPersonKey;

    const inUse = [...new Set(templateIdByRequestKey.values())];
    // One expansion per distinct month the page touches — a leave page normally spans one or
    // two, never one per row.
    const mapsByMonth = await Promise.all(
        months.map((entry) => buildTemplateDayMaps(adminId, inUse, entry.year, entry.month)),
    );

    for (const [personKey, templateId] of templateIdByRequestKey) {
        const dateKeys = new Set();
        for (const mapByTemplateId of mapsByMonth) {
            const dayMap = mapByTemplateId.get(templateId);
            if (!dayMap) continue;
            for (const dateKey of dayMap.keys()) dateKeys.add(dateKey);
        }
        if (dateKeys.size > 0) keysByPersonKey.set(personKey, dateKeys);
    }
    return keysByPersonKey;
};

module.exports = {
    getHolidayMapForDate,
    getHolidayMapForMonth,
    getHolidayMapForPeopleMonth,
    getHolidayKeysForPersons,
};
