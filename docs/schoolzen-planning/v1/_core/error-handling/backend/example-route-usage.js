/**
 * EXAMPLE — not a real route file, shows how any module's routes use
 * the error system. Copy this pattern for every new route in every
 * module; nothing here is Student-specific except the model import.
 */
const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const { ValidationError, NotFoundError } = require('../errors');

// No try/catch needed - express-async-errors forwards any rejected
// promise (including a thrown AppError) straight to the error middleware.
router.get('/students/:id', async (req, res) => {
  const student = await Student.findOne({
    _id: req.params.id,
    schoolId: req.schoolId // multi-tenancy scoping, per database-architecture.md §1
  }).lean();

  if (!student) {
    throw new NotFoundError('Student not found', {
      module: 'student',
      context: { studentId: req.params.id }
    });
  }

  res.json(student);
});

router.post('/students', async (req, res) => {
  if (!req.body.name) {
    throw new ValidationError('Please fix the highlighted fields', {
      module: 'student',
      fields: [{ field: 'name', message: 'Name is required' }]
    });
  }

  // A duplicate admissionNo throws a raw Mongo error (code 11000) from
  // this .create() call - we DON'T catch it here. It propagates up to
  // the error middleware, which normalizes it into a friendly
  // ConflictError automatically (see errorHandler.js's normalizeError).
  const student = await Student.create({ ...req.body, schoolId: req.schoolId });
  res.status(201).json(student);
});

module.exports = router;
