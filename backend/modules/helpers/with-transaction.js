'use strict';
const mongoose = require('mongoose');

/**
 * Run `work(dbSession)` inside one MongoDB transaction and return its result — shared by
 * every v2 module whose write spans documents (Student's profile + enrollment + fee record;
 * Academic Setup's class + its subject groups). A throw anywhere rolls the whole unit back.
 */
const withTransaction = async (work) => {
    const dbSession = await mongoose.startSession();
    try {
        let result;
        await dbSession.withTransaction(async () => {
            result = await work(dbSession);
        });
        return result;
    } finally {
        await dbSession.endSession();
    }
};

module.exports = { withTransaction };
