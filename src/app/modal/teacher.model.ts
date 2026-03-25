export interface Teacher {
    _id:String,
    name:String,
    teacherUserId:Number,
    otp:Number,
    education: String,
    image:String,
    status:String
}
export interface TeacherLoginData {
    email:String,
    password:String,
}