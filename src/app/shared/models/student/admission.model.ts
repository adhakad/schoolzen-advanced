/**
 * Admission page types — mirrors controllers/student/admission.controller.js. The list
 * row is the shared StudentListRow (./student.model.ts): an admission is a student at an
 * early lifecycle stage, not a separate record.
 */

export interface AdmissionOverview {
  admitted: number;
  pending: number;
}
