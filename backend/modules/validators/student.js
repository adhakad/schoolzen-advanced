'use strict';
const Joi = require("joi");

// Fields that are numbers but can be optional or empty
const numberOrEmpty = () =>
  Joi.alternatives()
    .try(
      Joi.number(), // valid number
      Joi.string()
        .trim()
        .custom((value, helpers) => {
          // Treat empty or invalid strings as "ignore"
          if (
            value === "" ||
            value === null ||
            value === undefined ||
            ["null", "undefined"].includes(value.toLowerCase())
          ) {
            return undefined; // undefined => Joi will remove this field if optional
          }

          const num = Number(value);
          if (isNaN(num)) return helpers.error("any.invalid");
          return num;
        })
    )
    .optional();

const stringOrEmpty = () =>
  Joi.alternatives()
    .try(
      Joi.string()
        .trim()
        .custom((value, helpers) => {
          if (
            value === null ||
            value === undefined ||
            value === "" ||
            ["null", "undefined"].includes(value.toLowerCase())
          ) {
            return undefined;
          }
          return value;
        })
    )
    .optional();

// Create Student Schema
const createStudentSchema = Joi.object({
  session: Joi.string().trim().required(),
  medium: Joi.string().trim().lowercase().required(),
  adminId: Joi.string().trim().required(),
  admissionNo: Joi.number().required(),
  name: Joi.string().trim().lowercase().required(),
  class: Joi.number().required(),
  stream: Joi.string().trim().lowercase().required(),
  admissionClass: Joi.number().required(),
  rollNumber: Joi.number().required(),
  admissionType: Joi.string().trim().lowercase().required(),
  dob: Joi.string().trim().required(),
  doa: Joi.string().trim().required(),
  gender: Joi.string().trim().lowercase().required(),
  category: Joi.string().trim().lowercase().required(),
  religion: Joi.string().trim().lowercase().required(),
  nationality: Joi.string().trim().lowercase().required(),
  address: Joi.string().trim().lowercase().required(),
  fatherName: Joi.string().trim().lowercase().required(),
  fatherQualification: Joi.string().trim().lowercase().required(),
  fatherOccupation: Joi.string().trim().lowercase().required(),
  motherName: Joi.string().trim().lowercase().required(),
  motherQualification: Joi.string().trim().lowercase().required(),
  motherOccupation: Joi.string().trim().lowercase().required(),
  familyAnnualIncome: Joi.string().trim().required(),
  feesConcession: Joi.number().required(),
  createdBy: Joi.string().trim().required(),

  // Optional fields
  studentImage: Joi.string().optional().allow(null).empty(""),
  studentImagePublicId: Joi.string().optional().allow(null).empty(""),
  udiseNumber: numberOrEmpty(),
  aadharNumber: numberOrEmpty(),
  samagraId: numberOrEmpty(),
  bankAccountNo: numberOrEmpty(),
  bankIfscCode: stringOrEmpty(),
  lastSchool: stringOrEmpty(),
  parentsContact: numberOrEmpty(),
  extraField: Joi.any().optional(),
  status: Joi.string().valid("Active", "Inactive").optional(),
});

// Update Schema: all fields optional
const updateStudentSchema = createStudentSchema.fork(
  Object.keys(createStudentSchema.describe().keys),
  (schema) => schema.optional()
);

module.exports = { createStudentSchema, updateStudentSchema };
