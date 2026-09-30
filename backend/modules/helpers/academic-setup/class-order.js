'use strict';

// Class.order — the fixed pedagogical rank every Class-driven list, dropdown and filter
// sorts by (academic-setup/classes-sections.md, "Class ordering — a global rule"):
// Nursery=0, LKG=1, UKG=2, 1st=3 … 12th=14. Never insertion order, never alphabetical
// ("10th" before "2nd"). Nursery/LKG/UKG are the codebase-wide 200/201/202 sentinels.
const SENTINEL_ORDER = { 200: 0, 201: 1, 202: 2 };

/** The order for a class number (8 → 10, 200 → 0). */
const classOrderOf = (classNumber) => {
    const value = Number(classNumber);
    if (Object.prototype.hasOwnProperty.call(SENTINEL_ORDER, value)) return SENTINEL_ORDER[value];
    return value + 2;
};

/** Comparator for class documents — the stored `order`, else derived from the number. */
const byClassOrder = (a, b) =>
    (a.order != null ? a.order : classOrderOf(a.class)) - (b.order != null ? b.order : classOrderOf(b.class));

module.exports = { classOrderOf, byClassOrder };
