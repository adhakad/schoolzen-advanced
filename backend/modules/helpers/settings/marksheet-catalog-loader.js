'use strict';
const MarksheetTemplateV2Model = require('../../models/settings/marksheet-template');
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');
const { seedMarksheetTemplates } = require('../../../scripts/seed-marksheet-templates');

// The global marksheet-template catalog, cached — read by Settings › Marksheet Templates and
// by Examination (template strip, terms, grade scale, co-scholastic areas). Seeded on first
// use if a deploy hasn't run the seed yet.
const loadCatalog = () => cacheService.wrap(cacheKeys.settings.marksheetCatalog(), cacheService.TTL.NEAR_STATIC_45, async () => {
    let templates = await MarksheetTemplateV2Model.find({}).sort({ order: 1 }).lean();
    if (!templates.length) {
        await seedMarksheetTemplates();
        templates = await MarksheetTemplateV2Model.find({}).sort({ order: 1 }).lean();
    }
    return templates.map((t) => ({
        _id: String(t._id), code: t.code, name: t.name, terms: t.terms || [], gradeScale: t.gradeScale,
        theoryMax: t.theoryMax, theoryPass: t.theoryPass, practicalMax: t.practicalMax == null ? null : t.practicalMax,
        coScholasticAreas: t.coScholasticAreas || [], supplyLimit: t.supplyLimit, gradeRows: t.gradeRows || [],
    }));
});

module.exports = { loadCatalog };
