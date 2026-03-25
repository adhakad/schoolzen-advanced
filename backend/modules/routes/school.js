'use strict';
const express = require('express');
const router = express.Router();
const fileUpload = require('../helpers/file-upload');
const { GetSingleSchoolNameLogo, GetSingleSchool, CreateSchool, UpdateSchool, DeleteSchool } = require('../controllers/school');

router.get('/name-logo', GetSingleSchoolNameLogo);
router.get('/:id', GetSingleSchool);
router.post('/', (req, res) => {
  fileUpload.schoolLogo.single('schoolLogo')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json('School logo must be under 100KB');
      }

      if (err.name === 'INVALID_FILE_TYPE') {
        return res.status(400).json('Please upload a valid logo in .png, .jpg, or .jpeg format only');
      }

      if (err.code === 'ENOENT') {
        return res.status(400).json('File or directory not found. Check upload path.');
      }

      return res.status(400).json(err.message || 'Error uploading file. Please try again.');
    }

    CreateSchool(req, res);
  });
});
router.put('/:id', (req, res) => {
  fileUpload.schoolLogo.single('schoolLogo')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json('School logo must be under 100KB');
      }

      if (err.name === 'INVALID_FILE_TYPE') {
        return res.status(400).json('Please upload a valid logo in .png, .jpg, or .jpeg format only');
      }

      if (err.code === 'ENOENT') {
        return res.status(400).json('File or directory not found. Check upload path.');
      }

      return res.status(400).json(err.message || 'Error uploading file. Please try again.');
    }
    // Call the controller function to update the school
    UpdateSchool(req, res);
  });
});
router.delete('/:id', DeleteSchool);

module.exports = router;