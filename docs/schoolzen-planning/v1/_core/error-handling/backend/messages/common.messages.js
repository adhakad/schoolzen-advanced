/**
 * Shared success-message builders — used instead of hardcoding a
 * string like 'Class deleted successfully.' inside every controller.
 * See ../README.md's "Response messages" section for the reasoning.
 *
 * Usage in a controller:
 *   const { success } = require('../../helpers/messages/common.messages');
 *   res.status(200).json({ message: success.deleted('Class') });
 */

const success = {
  created: (entity) => `${entity} created successfully.`,
  updated: (entity) => `${entity} updated successfully.`,
  deleted: (entity) => `${entity} deleted successfully.`,
  restored: (entity) => `${entity} restored successfully.`,
  // Bulk-action variant — used by CSV imports, bulk assign, etc.
  bulkProcessed: (count, entity) => `${count} ${entity}${count === 1 ? '' : 's'} processed successfully.`
};

module.exports = { success };

/**
 * Module-specific messages that don't fit the generic CRUD shape go
 * in their OWN file, same module-grouping convention as everything
 * else in the backend — e.g.
 * modules/helpers/messages/academic-setup.messages.js:
 *
 *   const classHasStudents = (count) =>
 *     `This class has ${count} student${count === 1 ? '' : 's'} enrolled — ` +
 *     `deleting it will also remove their placement records.`;
 *
 *   module.exports = { classHasStudents };
 *
 * Never write a message like this inline at the res.json() call site
 * in a controller - it belongs in a messages file so the exact
 * wording is defined once and reused anywhere else it's needed
 * (e.g. also shown in a confirmation dialog's warning text).
 */
