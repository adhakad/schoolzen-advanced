'use strict';
const AcademicSessionModel = require('../models/academic-session');

// Function to update academic session
const checkAndUpdateAcademicSession = async () => {
  const currentYear = new Date().getFullYear();
  const currentAcademicSession = `${currentYear}-${currentYear + 1}`; // Current academic session
  const previousAcademicSession = `${currentYear - 1}-${currentYear}`;

  try {
    // Update or create new session for the current year
    await AcademicSessionModel.updateOne(
      {}, // Match any existing session
      { academicSession: currentAcademicSession, previousAcademicSession: previousAcademicSession,allSession: [previousAcademicSession, currentAcademicSession], createdAt: new Date() }, // Update the session and createdAt fields
      { upsert: true } // If session doesn't exist, create a new one
    );
    console.log('Academic session updated to:', currentAcademicSession);
  } catch (error) {
    console.error('Error updating academic session:', error);
  }
};

module.exports = { checkAndUpdateAcademicSession };
