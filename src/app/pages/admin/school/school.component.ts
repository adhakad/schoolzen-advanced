import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SchoolService } from 'src/app/services/school.service';
import { BoardService } from 'src/app/services/board.service';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { environment } from 'src/environments/environment';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-school',
  templateUrl: './school.component.html',
  styleUrls: ['./school.component.css']
})
export class SchoolComponent implements OnInit {
  public baseUrl = environment.API_URL;
  schoolForm: FormGroup;
  disabled: boolean = true;
  showModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  schoolInfo: any;
  boardInfo: any;
  mediums: any;
  loader: Boolean = true;
  adminId!: String;
  logoPreview: any = null;  // For showing school logo preview
  
  // Add submission state management property
  isClick: boolean = false;
  
  indianStates: string[] = [
    'Andhra Pradesh',
    'Arunachal Pradesh',
    'Assam',
    'Bihar',
    'Chhattisgarh',
    'Goa',
    'Gujarat',
    'Haryana',
    'Himachal Pradesh',
    'Jharkhand',
    'Karnataka',
    'Kerala',
    'Madhya Pradesh',
    'Maharashtra',
    'Manipur',
    'Meghalaya',
    'Mizoram',
    'Nagaland',
    'Odisha',
    'Punjab',
    'Rajasthan',
    'Sikkim',
    'Tamil Nadu',
    'Telangana',
    'Tripura',
    'Uttar Pradesh',
    'Uttarakhand',
    'West Bengal'
  ];
  
  constructor(
    private fb: FormBuilder, private toastr: ToastrService,
    private schoolService: SchoolService,
    private adminAuthService: AdminAuthService,
    private boardService: BoardService,
  ) {
    this.schoolForm = this.fb.group({
      _id: [''],
      adminId: [''],
      schoolName: ['', [Validators.required, Validators.maxLength(50)]],
      schoolLogo: [''], // School logo file
      affiliationNumber: ['', [Validators.required, Validators.maxLength(15)]],
      schoolCode: ['', [Validators.required, Validators.maxLength(15)]],
      foundedYear: ['', [Validators.required, Validators.pattern(/^(19|20)\d{2}$/)]],
      board: ['', [Validators.required, Validators.maxLength(50)]],
      medium: ['', [Validators.required, Validators.maxLength(50)]],
      street: ['', [Validators.required, Validators.maxLength(100)]],
      city: ['', [Validators.required, Validators.maxLength(50)]],
      district: ['', [Validators.required, Validators.maxLength(50)]],
      state: ['', [Validators.required, Validators.maxLength(50)]],
      pinCode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      phoneOne: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(10), Validators.pattern(/^\d+$/)]],
      phoneSecond: ['', [Validators.minLength(10), Validators.maxLength(10), Validators.pattern(/^\d+$/)]],
      email: ['', [Validators.required, Validators.email]],
    });
  }

  ngOnInit(): void {
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    this.getSchool();
    this.getBoard();
    this.allOptions();
    setTimeout(() => {
      this.loader = false;
    }, 2000);
  }

  closeModal() {
    this.showModal = false;
    this.updateMode = false;
    this.deleteMode = false;
    this.errorMsg = '';
    this.errorCheck = false;
    this.schoolForm.reset();
    this.logoPreview = null;  // Reset logo preview
    this.disabled = true;
    // Reset loading state
    this.isClick = false;
  }

  addSchoolModel() {
    this.getSchool();
    this.showModal = true;
    this.deleteMode = false;
    this.updateMode = false;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    this.schoolForm.reset();
  }

  updateSchoolModel(school: any) {
    this.showModal = true;
    this.deleteMode = false;
    this.updateMode = true;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    this.schoolForm.patchValue(school);
    if (school.schoolLogo) {
      this.logoPreview = `${this.baseUrl}/${school.schoolLogo}`; // Set logo preview
    }
  }

  deleteSchoolModel(id: String) {
    this.showModal = true;
    this.updateMode = false;
    this.deleteMode = true;
    this.errorCheck = false;
    this.errorMsg = '';
    this.deleteById = id;
  }

  successDone(msg: any) {
    this.getSchool();
    this.closeModal();
    setTimeout(() => {
      this.toastr.success('', msg);
    }, 500)
  }

  getSchool() {
    this.schoolService.getSchool(this.adminId).subscribe((res: any) => {
      if (res) {
        this.schoolInfo = res;
        this.errorCheck = true;
        this.errorMsg = 'School detail already exists!';
      }
    });
  }
  
  getBoard() {
    this.boardService.getBoardList().subscribe((res: any) => {
      if (res) {
        this.boardInfo = res;
      }
    });
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.schoolForm.patchValue({ schoolLogo: file });

      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.logoPreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  // Helper method to mark all form fields as touched for validation display
  private markFormGroupTouched() {
    Object.keys(this.schoolForm.controls).forEach(key => {
      const control = this.schoolForm.get(key);
      control?.markAsTouched();
    });
  }

  // Submit form for adding or updating school
  schoolAddUpdate() {
    // Check form validity first
    if (!this.schoolForm.valid) {
      // Mark all fields as touched to show validation errors
      this.markFormGroupTouched();
      this.errorCheck = true;
      this.errorMsg = 'Please fill all required fields correctly.';
      return;
    }

    // Check if already submitting
    if (this.isClick) {
      return;
    }

    // Reset error state and set loading state
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = true;
    this.disabled = false;

    this.schoolForm.value.adminId = this.adminId;

    if (this.updateMode) {
      this.schoolService.updateSchool(this.schoolForm.value).subscribe(
        (res: any) => {
          if (res) {
            this.isClick = false;
            this.successDone(res);
          }
        },
        (err) => {
          this.errorCheck = true;
          this.errorMsg = err.error || 'An error occurred while updating school.';
          this.isClick = false;
        }
      );
    } else {
      this.schoolService.addSchool(this.schoolForm.value).subscribe(
        (res: any) => {
          if (res) {
            this.isClick = false;
            this.successDone(res);
          }
        },
        (err) => {
          this.errorCheck = true;
          this.errorMsg = err.error || 'An error occurred while adding school.';
          this.isClick = false;
        }
      );
    }
  }

  // Delete school
  schoolDelete(id: String) {
    // Check if already processing delete
    if (this.isClick) {
      return;
    }

    this.isClick = true;

    this.schoolService.deleteSchool(id).subscribe((res: any) => {
      if (res) {
        this.isClick = false;
        this.successDone(res);
        this.schoolInfo = '';
        this.deleteById = '';
      }
    }, (err) => {
      this.errorCheck = true;
      this.errorMsg = err.error || 'An error occurred while deleting school.';
      this.isClick = false;
    });
  }

  allOptions() {
    this.mediums = [{ medium: 'Hindi' }, { medium: 'English' }, { medium: 'Hindi & English' }]
  }
}