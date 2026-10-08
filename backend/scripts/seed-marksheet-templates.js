'use strict';
// Seeds the fixed marksheet-template catalog into v2-marksheet-template — idempotent: an
// upsert by `code`, so re-running only brings rows up to date with
// helpers/settings/marksheet-catalog.js. The catalog read also calls seedMarksheetTemplates()
// lazily when it finds rows missing, so a fresh database works without running this by hand.
//
//   node scripts/seed-marksheet-templates.js
const MarksheetTemplateV2Model = require('../modules/models/settings/marksheet-template');
const { MARKSHEET_CATALOG } = require('../modules/helpers/settings/marksheet-catalog');

const seedMarksheetTemplates = async () => {
    const now = new Date();
    const ops = MARKSHEET_CATALOG.map((template) => ({
        updateOne: {
            filter: { code: template.code },
            update: {
                $set: { ...template, updatedBy: 'system', updatedAt: now },
                $setOnInsert: { createdBy: 'system', createdAt: now, schemaVersion: 1 },
            },
            upsert: true,
        },
    }));
    const result = await MarksheetTemplateV2Model.bulkWrite(ops, { ordered: false });
    return { upserted: result.upsertedCount || 0, modified: result.modifiedCount || 0 };
};

module.exports = { seedMarksheetTemplates };

if (require.main === module) {
    require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
    global.global_config = require('../config/config.js');
    const mongoose = require('mongoose');
    const { DbConnect } = require('../modules/helpers/database');
    DbConnect()
        .then(seedMarksheetTemplates)
        .then((result) => { console.log('marksheet templates seeded', result); })
        .catch((error) => { console.error('seed failed:', error.message); process.exitCode = 1; })
        .finally(() => mongoose.disconnect());
}
