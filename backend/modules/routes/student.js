'use strict';
const express = require('express');
const router = express.Router();
const { createStudentSchema, updateStudentSchema } = require("../validators/student");
const validate = require("../middleware/validate");
const fileUpload = require('../helpers/file-upload');
const { GetAllStudentByClass, countStudent, GetSingleStudent, GetAllStudentByClassWithoutStream, CreateStudent, CreateBulkStudentRecord, UpdateStudent, ChangeStatus, DeleteStudent, GetStudentPaginationByClass, GetStudentPaginationByAdmission, StudentClassPromote, StudentClassFail, GetStudentPaginationByAdmissionAndClass } = require('../controllers/student');

router.get('/student-count/:adminId', countStudent);
router.get('/admin/:id/student/:class/stream/:stream', GetAllStudentByClass);
router.get('/admin/:id/student/:class', GetAllStudentByClassWithoutStream);
router.post('/student-pagination', GetStudentPaginationByClass);
router.post('/student-admission-pagination', GetStudentPaginationByAdmission);
router.post('/student-admission-pagination/class', GetStudentPaginationByAdmissionAndClass);
// router.post('/student-admission-enquiry-pagination', GetStudentAdmissionEnquiryPagination);
router.get('/:id', GetSingleStudent);
router.post('/', (req, res, next) => {
  fileUpload.studentImage.single("studentImage")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json("Student photo must be under 100KB");
      }

      if (err.name === "INVALID_FILE_TYPE") {
        return res
          .status(400)
          .json("Please upload a valid photo in png, jpg, or jpeg format only");
      }

      if (err.code === "ENOENT") {
        return res
          .status(400)
          .json("File or directory not found. Check upload path.");
      }

      return res
        .status(400)
        .json("Error uploading file. Please try again.");
    }

    validate(createStudentSchema)(req, res, next);
  });
}, CreateStudent);
// router.post('/online-admission', CreateStudentAdmissionEnquiry);
router.post('/bulk-student-record', CreateBulkStudentRecord);
router.put("/:id", (req, res, next) => {
  fileUpload.studentImage.single("studentImage")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json("Student photo under 100KB size limit");
      }

      if (err.name === "INVALID_FILE_TYPE") {
        return res
          .status(400)
          .json("Please upload a valid photo in .png, .jpg, or .jpeg format only");
      }

      if (err.code === "ENOENT") {
        return res
          .status(400)
          .json("File or directory not found. Check upload path.");
      }

      return res
        .status(400)
        .json("Error uploading file. Please try again.");
    }

    validate(updateStudentSchema)(req, res, next);
  });
}, UpdateStudent);
router.put('/class-promote/:id', StudentClassPromote);
router.put('/class-fail/:id', StudentClassFail);
router.put('/status/:id', ChangeStatus);
router.delete('/:id', DeleteStudent);
// router.delete('/admission-enquiry/:id', DeleteAdmissionEnquiry);


module.exports = router;