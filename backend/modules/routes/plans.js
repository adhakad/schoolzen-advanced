'use strict';
const express = require('express');
const router = express.Router();
const {GetAllPlans,GetSinglePlans,GetSinglePlansByPlans,CreatePlans,UpdatePlans,DeletePlans, GetPlansPagination} = require('../controllers/plans');

router.get('/',GetAllPlans);
router.post('/plans-pagination',GetPlansPagination);
router.get('/:id',GetSinglePlans);
router.get('/plans/:id',GetSinglePlansByPlans);
router.post('/',CreatePlans);
router.put('/:id',UpdatePlans);
router.delete('/:id',DeletePlans);



module.exports = router;