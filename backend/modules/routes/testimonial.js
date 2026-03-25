'use strict';
const express = require('express');
const router = express.Router();
const fileUpload = require('../helpers/file-upload');
const {GetAllTestimonial,countTestimonial,GetSingleTestimonial,CreateTestimonial,UpdateTestimonial,DeleteTestimonial, GetTestimonialPagination} = require('../controllers/testimonial');

router.get('/testimonial-count',countTestimonial);
router.get('/',GetAllTestimonial);
router.post('/testimonial-pagination',GetTestimonialPagination);
router.get('/:id',GetSingleTestimonial);
// router.post('/',fileUpload.testimonialImage.single('image'),CreateTestimonial);
router.put('/:id',UpdateTestimonial);
router.delete('/:id', DeleteTestimonial);

module.exports = router;