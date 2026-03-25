'use strict';
const express = require('express');
const router = express.Router();
const fileUpload = require('../helpers/file-upload');
const {GetBannerPagination,countBanner,GetAllBanner,GetSingleBanner,CreateBanner,UpdateBanner,DeleteBanner} = require('../controllers/banner');

router.get('/banner-count',countBanner);
router.get('/',GetAllBanner)
router.post('/banner-pagination',GetBannerPagination);
router.get('/:id',GetSingleBanner);
// router.post('/',fileUpload.bannerImage.single('image'),CreateBanner);
router.put('/:id',UpdateBanner);
router.delete('/:id',DeleteBanner);



module.exports = router;