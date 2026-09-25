'use strict';

// Generic CRUD success-message BUILDERS — the success-path twin of modules/errors/.
//
// A controller never writes `res.status(200).json('Class deleted successfully.')` itself:
// that is one hardcoded string per entity per action, duplicated across every controller,
// and a wording change becomes a grep-and-replace. These functions define the wording once
// and every entity's message comes out of the same shape.
//
// Usage in a controller:
//   const { success } = require('../../helpers/messages/common.messages');
//   return res.status(200).json({ message: success.deleted('Class') });
//
// Anything that is NOT plain CRUD (a warning naming how many students a delete affects,
// say) goes in modules/helpers/messages/<module>.messages.js, grouped per module the same
// way controllers/models/routes are — never inlined at the res.json() call site either.
const success = {
    created: (entity) => `${entity} created successfully.`,
    updated: (entity) => `${entity} updated successfully.`,
    deleted: (entity) => `${entity} deleted successfully.`,
    restored: (entity) => `${entity} restored successfully.`,
    // Bulk-action variant — CSV imports, bulk assign, and anything else that reports a count.
    bulkProcessed: (count, entity) => `${count} ${entity}${count === 1 ? '' : 's'} processed successfully.`,
};

module.exports = { success };
