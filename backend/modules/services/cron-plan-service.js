'use strict';
const AdminPlan = require('../models/users/admin-plan');

const checkAndUpdateExpiredPlans = async () => {
  const currentTime = new Date();

  try {
    const expiredPlans = await AdminPlan.find({
      expirationDate: { $lte: currentTime },
      expiryStatus: false
    });

    if (expiredPlans.length > 0) {
      await AdminPlan.updateMany(
        { _id: { $in: expiredPlans.map(plan => plan._id) } },
        { $set: { expiryStatus: true } }
      );
      console.log('Expired plans updated successfully.');
    } else {
      console.log('No plans need to be updated.');
    }
  } catch (error) {
    console.error('Error checking or updating expired plans:', error);
  }
};

module.exports = {
  checkAndUpdateExpiredPlans
};