export interface BiometricMapping {
    _id: String,
    adminId: String,
    personType: String,
    personId: String,
    wdmsEmpCode: String,
    cardNo: String,
    // How the terminal may identify this person: 0 Auto, 1 Fingerprint, 3 Password,
    // 4 Card Only (default), 15 Face. Pushed to WDMS as verify_mode.
    verifyMode: Number,
    wdmsId: String,
}
