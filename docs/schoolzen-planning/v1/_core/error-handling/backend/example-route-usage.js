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
    adminId: req.adminId // multi-tenancy scoping, per database-design-principles.md §1
  }).lean();

  if (!student) {
    throw new NotFoundError('Student not found', {
      module: 'student',
      code: 'STUDENT_NOT_FOUND',
      context: { studentId: req.params.id }
    });
  }

  res.json(student);
});

router.post('/students', async (req, res) => {
  if (!req.body.name) {
    throw new ValidationError('Please fix the highlighted fields', {
      module: 'student',
      code: 'VALIDATION_FAILED',
      fields: [{ field: 'name', code: 'NAME_REQUIRED', message: 'Name is required' }]
    });
  }

  // A duplicate admissionNo throws a raw Mongo error (code 11000) from
  // this .create() call - we DON'T catch it here. It propagates up to
  // the error middleware, which normalizes it into a friendly
  // ConflictError automatically (see errorHandler.js's normalizeError),
  // which also derives a stable `code` (e.g. "ADMISSION_NO_DUPLICATE").
  const student = await Student.create({ ...req.body, adminId: req.adminId });
  res.status(201).json(student);
});

module.exports = router;
