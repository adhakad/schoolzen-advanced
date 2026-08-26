// Mirrors backend/modules/models/staff-bank-details.js.
//
// STORED, AND READ BY NOTHING IN THIS PHASE. There is no payout UI and no service class yet —
// this interface exists so the collection has a typed shape ready for the future Automated
// Payout phase rather than being reverse-engineered from the schema then.
export interface StaffBankDetails {
  _id?: String;
  adminId?: String;
  staffId: String;
  accountHolderName: String;
  accountNumber: String;
  ifscCode: String;
  bankName: String;
  upiId: String;
  createdAt?: Date;
}
