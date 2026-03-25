'use strict';
const mongoose = require('mongoose');
const MarksheetTemplateStructureModel = mongoose.model('marksheet-template-structure', {
    templateName: {
        type: String,
        required: true,
        trim: true
    },
    examStructure: {},
    createdAt: {
        type: Date,
        default: Date.now,
    },
    
});

module.exports = MarksheetTemplateStructureModel;