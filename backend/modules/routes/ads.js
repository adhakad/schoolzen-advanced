'use strict';
const express = require('express');
const router = express.Router();
const fileUpload = require('../helpers/file-upload')

const {GetAdsPagination,countAds,GetAllAds,GetSingleAds,CreateAds,UpdateAds,DeleteAds} = require('../controllers/ads');
const { isAdminAuth } = require('../middleware/admin-auth');

router.get('/ads-count',countAds);
router.get('/',GetAllAds);
router.post('/ads-pagination',GetAdsPagination);
router.get('/:id',GetSingleAds);
// router.post('/',fileUpload.adsImage.single('image'),CreateAds);
router.put('/:id',UpdateAds);
router.delete('/:id',DeleteAds);

module.exports = router;