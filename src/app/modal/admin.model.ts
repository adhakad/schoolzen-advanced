export interface AdminLoginData {
    email:String,
    password:String,
}

// Sales-only directory entry used by the Device Management "assign to school" picker.
export interface AdminDirectoryEntry {
    _id: String,
    schoolName: String,
    schoolId: Number,
    city: String,
    state: String,
}