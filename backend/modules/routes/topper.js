'use strict';
const express = require('express');
const router = express.Router();
const fileUpload = require('../helpers/file-upload');
const {GetAllTopper,countTopper,GetSingleTopper,CreateTopper,UpdateTopper,DeleteTopper, GetTopperPagination} = require('../controllers/topper');

router.get('/topper-count',countTopper);
router.get('/',GetAllTopper);
router.post('/topper-pagination',GetTopperPagination);
router.get('/:id',GetSingleTopper);
// router.post('/',fileUpload.topperImage.single('image'),CreateTopper);
router.put('/:id',UpdateTopper);
router.delete('/:id', DeleteTopper);

module.exports = router;