'use strict';
const express = require('express');
const router = express.Router();
const { GetAllDesignation, countDesignation, GetSingleDesignation, CreateDesignation, UpdateDesignation, DeleteDesignation, GetDesignationPagination } = require('../controllers/designation');

router.get('/designation-count/:adminId', countDesignation);
router.get('/all-designation/:id', GetAllDesignation);
router.post('/designation-pagination', GetDesignationPagination);
router.get('/:id', GetSingleDesignation);
router.post('/', CreateDesignation);
router.put('/:id', UpdateDesignation);
router.delete('/:id', DeleteDesignation);

module.exports = router;
