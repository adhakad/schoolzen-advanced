'use strict';
const express = require('express');
const router = express.Router();
const validate = require('../middleware/validate');
const {
    createHolidayTemplateSchema,
    updateHolidayTemplateSchema,
    templateHolidaySchema,
    generateFromPublicSchema,
} = require('../validators/holiday-template');
const {
    countHolidayTemplate,
    GetHolidayTemplatePagination,
    GetAllHolidayTemplate,
    GetSingleHolidayTemplate,
    CreateHolidayTemplate,
    UpdateHolidayTemplate,
    AddHolidayToTemplate,
    RemoveHolidayFromTemplate,
    DeleteHolidayTemplate,
    GetPublicHolidayStates,
    GenerateTemplateFromPublic,
} = require('../controllers/holiday-template');

router.get('/holiday-template-count/:adminId', countHolidayTemplate);
router.post('/holiday-template-pagination', GetHolidayTemplatePagination);
// Every literal segment is declared BEFORE '/:id' — Express matches in order, so a literal
// that could also read as an id has to come first or it never gets reached.
router.get('/all-holiday-template/:id', GetAllHolidayTemplate);
router.get('/public-states/:year', GetPublicHolidayStates);
router.post('/generate-from-public', validate(generateFromPublicSchema), GenerateTemplateFromPublic);
router.get('/:id', GetSingleHolidayTemplate);
router.post('/', validate(createHolidayTemplateSchema), CreateHolidayTemplate);
// The "holidays in this template" sub-list. Declared before the bare '/:id' PUT for the same
// ordering reason as above.
router.put('/:id/add-holiday', validate(templateHolidaySchema), AddHolidayToTemplate);
router.put('/:id/remove-holiday', validate(templateHolidaySchema), RemoveHolidayFromTemplate);
router.put('/:id', validate(updateHolidayTemplateSchema), UpdateHolidayTemplate);
router.delete('/:id', DeleteHolidayTemplate);

module.exports = router;
