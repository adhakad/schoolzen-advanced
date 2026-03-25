import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { TeacherAuthGuard } from './guards/teacher-auth.guard';

const routes: Routes = [
  { path: '', redirectTo: '/', pathMatch: 'full' },
  { path: '/', loadChildren: () => import('src/app/pages/main/home/home.module').then((module) => module.HomeModule) },
  { path: 'about', loadChildren: () => import('src/app/pages/main/about/about.module').then((module) => module.AboutModule) },
  { path: 'pricing', loadChildren: () => import('src/app/pages/main/pricing/pricing.module').then((module) => module.PricingModule) },
  { path: 'features', loadChildren: () => import('src/app/pages/main/features/features.module').then((module) => module.FeaturesModule) },
  { path: 'payment/subscription/:subscription-type/:id', loadChildren: () => import('src/app/pages/main/payment/payment.module').then((module) => module.PaymentModule) },
  { path: 'contact', loadChildren: () => import('src/app/pages/main/contact/contact.module').then((module) => module.ContactModule) },
  { path: 'terms-and-conditions', loadChildren: () => import('src/app/pages/main/terms-conditions/terms-conditions.module').then((module) => module.TermsConditionsModule) },
  { path: 'privacy-policy', loadChildren: () => import('src/app/pages/main/privacy-policy/privacy-policy.module').then((module) => module.PrivacyPolicyModule) },
  { path: 'refund-cancellation-policy', loadChildren: () => import('src/app/pages/main/refund-cancellation-policy/refund-cancellation-policy.module').then((module) => module.RefundCancellationPolicyModule) },
  // Admin Routing Section

  { path: 'admin/login', loadChildren: () => import('src/app/pages/auth/admin-auth/admin-login/admin-login.module').then((module) => module.AdminLoginModule) },
  { path: 'admin/forgot', loadChildren: () => import('src/app/pages/auth/admin-auth/admin-forgot/admin-forgot.module').then((module) => module.AdminForgotModule) },
  { path: 'admin/dashboard', loadChildren: () => import('src/app/pages/admin/dashboard/dashboard.module').then((module) => module.DashboardModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/school/detail', loadChildren: () => import('src/app/pages/admin/school/school.module').then((module) => module.SchoolModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/admission', loadChildren: () => import('src/app/pages/admin/admission/admission.module').then((module) => module.AdmissionModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/student', loadChildren: () => import('src/app/pages/admin/student/student.module').then((module) => module.StudentModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/id-card', loadChildren: () => import('src/app/pages/admin/admin-id-card/admin-id-card.module').then((module) => module.AdminIdCardModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/promote-fail', loadChildren: () => import('src/app/pages/admin/promote-fail/promote-fail.module').then((module) => module.PromoteFailModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/transfer-certificate', loadChildren: () => import('src/app/pages/admin/transfer-certificate/transfer-certificate.module').then((module) => module.TransferCertificateModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/fees', loadChildren: () => import('src/app/pages/admin/admin-student-fees/admin-student-fees.module').then((module) => module.AdminStudentFeesModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/fees/structure', loadChildren: () => import('src/app/pages/admin/admin-student-fees-structure/admin-student-fees-structure.module').then((module) => module.AdminStudentFeesStructureModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/fees/reminder', loadChildren: () => import('src/app/pages/admin/admin-fees-reminder/admin-fees-reminder.module').then((module) => module.AdminFeesReminderModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/fees/statement/:id', loadChildren: () => import('src/app/pages/admin/admin-student-fees-statement/admin-student-fees-statement.module').then((module) => module.AdminStudentFeesStatementModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/admit-card', loadChildren: () => import('src/app/pages/admin/admin-student-admit-card/admin-student-admit-card.module').then((module) => module.AdminStudentAdmitCardModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/admit-card/structure', loadChildren: () => import('src/app/pages/admin/admin-student-admit-card-structure/admin-student-admit-card-structure.module').then((module) => module.AdminStudentAdmitCardStructureModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/marksheet', loadChildren: () => import('src/app/pages/admin/admin-student-marksheet/admin-student-marksheet.module').then((module) => module.AdminStudentMarksheetModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/marksheet/structure/:class/:stream', loadChildren: () => import('src/app/pages/admin/admin-student-marksheet-structure/admin-student-marksheet-structure.module').then((module) => module.AdminStudentMarksheetStructureModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/marksheet/structure-edit/:id', loadChildren: () => import('src/app/pages/admin/admin-student-marksheet-structure-edit/admin-student-marksheet-structure-edit.module').then((module) => module.AdminStudentMarksheetStructureEditModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/marksheet/result/add/:class/:stream', loadChildren: () => import('src/app/pages/admin/admin-student-marksheet-result-add/admin-student-marksheet-result-add.module').then((module) => module.AdminStudentMarksheetResultAddModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/issued-transfer-certificate', loadChildren: () => import('src/app/pages/admin/issued-transfer-certificate/issued-transfer-certificate.module').then((module) => module.IssuedTransferCertificateModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/teacher', loadChildren: () => import('src/app/pages/admin/teacher/teacher.module').then((module) => module.TeacherModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/class', loadChildren: () => import('src/app/pages/admin/class/class.module').then((module) => module.ClassModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/subject', loadChildren: () => import('src/app/pages/admin/subject/subject.module').then((module) => module.SubjectModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/class-subject', loadChildren: () => import('src/app/pages/admin/class-subject/class-subject.module').then((module) => module.ClassSubjectModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/upgrade-plan', loadChildren: () => import('src/app/pages/admin/upgrade-plan/upgrade-plan.module').then((module) => module.UpgradePlanModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/upgrade-plan/payment/:id', loadChildren: () => import('src/app/pages/admin/upgrade-plan-payment/upgrade-plan-payment.module').then((module) => module.UpgradePlanPaymentModule), canActivate: [AdminAuthGuard] },

  { path: 'admin/plans', loadChildren: () => import('src/app/pages/admin/plans/plans.module').then((module) => module.PlansModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/banner', loadChildren: () => import('src/app/pages/admin/banner/banner.module').then((module) => module.BannerModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/ads', loadChildren: () => import('src/app/pages/admin/ads/ads.module').then((module) => module.AdsModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/topper', loadChildren: () => import('src/app/pages/admin/topper/topper.module').then((module) => module.TopperModule), canActivate: [AdminAuthGuard] },
  { path: 'admin/testimonial', loadChildren: () => import('src/app/pages/admin/testimonial/testimonial.module').then((module) => module.TestimonialModule), canActivate: [AdminAuthGuard] },


  // Teacher Routing Section
  { path: 'teacher/signup', loadChildren: () => import('src/app/pages/auth/teacher-auth/teacher-signup/teacher-signup.module').then((module) => module.TeacherSignupModule) },
  { path: 'teacher/login', loadChildren: () => import('src/app/pages/auth/teacher-auth/teacher-login/teacher-login.module').then((module) => module.TeacherLoginModule) },
  { path: 'teacher/dashboard', loadChildren: () => import('src/app/pages/teacher/teacher-dashboard/teacher-dashboard.module').then((module) => module.TeacherDashboardModule), canActivate: [TeacherAuthGuard] },

  { path: 'teacher/admission', loadChildren: () => import('src/app/pages/teacher/teacher-admission/teacher-admission.module').then((module) => module.TeacherAdmissionModule), canActivate: [TeacherAuthGuard] },
  { path: 'teacher/admit-card', loadChildren: () => import('src/app/pages/teacher/teacher-admit-card/teacher-admit-card.module').then((module) => module.TeacherAdmitCardModule), canActivate: [TeacherAuthGuard] },
  { path: 'teacher/marksheet', loadChildren: () => import('src/app/pages/teacher/teacher-student-marksheet/teacher-student-marksheet.module').then((module) => module.TeacherStudentMarksheetModule), canActivate: [TeacherAuthGuard] },
  { path: 'teacher/student', loadChildren: () => import('src/app/pages/teacher/teacher-student/teacher-student.module').then((module) => module.TeacherStudentModule), canActivate: [TeacherAuthGuard] },
  { path: 'teacher/fees', loadChildren: () => import('src/app/pages/teacher/teacher-student-fees/teacher-student-fees.module').then((module) => module.TeacherStudentFeesModule), canActivate: [TeacherAuthGuard] },


  { path: 'teacher/fees/structure', loadChildren: () => import('src/app/pages/teacher/teacher-student-fees-structure/teacher-student-fees-structure.module').then((module) => module.TeacherStudentFeesStructureModule), canActivate: [TeacherAuthGuard] },
  { path: 'teacher/fees/statement/:id', loadChildren: () => import('src/app/pages/teacher/teacher-student-fees-statement/teacher-student-fees-statement.module').then((module) => module.TeacherStudentFeesStatementModule), canActivate: [TeacherAuthGuard] },
  { path: 'teacher/admit-card/structure', loadChildren: () => import('src/app/pages/teacher/teacher-student-admit-card-structure/teacher-student-admit-card-structure.module').then((module) => module.TeacherStudentAdmitCardStructureModule), canActivate: [TeacherAuthGuard] },
  { path: 'teacher/marksheet/structure/:class/:stream', loadChildren: () => import('src/app/pages/teacher/teacher-student-marksheet-structure/teacher-student-marksheet-structure.module').then((module) => module.TeacherStudentMarksheetStructureModule), canActivate: [TeacherAuthGuard] },
  { path: 'teacher/marksheet/structure-edit/:id', loadChildren: () => import('src/app/pages/teacher/teacher-student-marksheet-structure-edit/teacher-student-marksheet-structure-edit.module').then((module) => module.TeacherStudentMarksheetStructureEditModule), canActivate: [TeacherAuthGuard] },
  { path: 'teacher/marksheet/result/add/:class/:stream', loadChildren: () => import('src/app/pages/teacher/teacher-student-marksheet-result-add/teacher-student-marksheet-result-add.module').then((module) => module.TeacherStudentMarksheetResultAddModule), canActivate: [TeacherAuthGuard] },
  { path: 'teacher/promote-fail', loadChildren: () => import('src/app/pages/teacher/teacher-student-promote-fail/teacher-student-promote-fail.module').then((module) => module.TeacherStudentPromoteFailModule), canActivate: [TeacherAuthGuard] },
  { path: 'teacher/transfer-certificate', loadChildren: () => import('src/app/pages/teacher/teacher-student-transfer-certificate/teacher-student-transfer-certificate.module').then((module) => module.TeacherStudentTransferCertificateModule), canActivate: [TeacherAuthGuard] },

];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'top' })],
  exports: [RouterModule]
})
export class AppRoutingModule { }