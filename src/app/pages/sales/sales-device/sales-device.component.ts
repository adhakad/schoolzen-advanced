import { Component, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { DeviceService } from 'src/app/services/device.service';
import { AdminUserService } from 'src/app/services/admin-user.service';

@Component({
  selector: 'app-sales-device',
  templateUrl: './sales-device.component.html',
  styleUrls: ['./sales-device.component.css']
})
export class SalesDeviceComponent implements OnInit {
  // Loosely typed (any[]), matching department.component.ts / the rest of the codebase's
  // convention — Device/AdminDirectoryEntry's String-typed fields don't line up with
  // Angular pipes' primitive `string` expectations under strict mode.
  devices: any[] = [];
  unassignedDevices: any[] = [];
  schoolWiseDevices: any[] = [];
  viewMode: 'list' | 'school-wise' = 'list';

  showAssignModal: boolean = false;
  selectedDeviceId: String = '';
  schoolSearch: any = {};
  schoolSearchResults: any[] = [];
  selectedSchoolId: String = '';
  selectedSchoolName: String = '';

  successMsg: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  loader: Boolean = true;
  syncing: boolean = false;

  // Double-submit guard
  isClick: boolean = false;

  constructor(private toastr: ToastrService, private deviceService: DeviceService, private adminUserService: AdminUserService) { }

  ngOnInit(): void {
    let load: any = this.loadDevices();
    if (load) {
      setTimeout(() => {
        this.loader = false;
      }, 1000);
    }
  }

  loadDevices() {
    return new Promise((resolve, reject) => {
      this.deviceService.getDevicesBySalesPerson().subscribe((res: any) => {
        if (res) {
          this.devices = res;
          return resolve(true);
        }
      });
    });
  }

  loadSchoolWise() {
    this.deviceService.getSchoolWiseDevices().subscribe((res: any) => {
      if (res) {
        this.schoolWiseDevices = res;
      }
    });
  }

  switchView(mode: 'list' | 'school-wise') {
    this.viewMode = mode;
    if (mode === 'school-wise') {
      this.loadSchoolWise();
    }
  }

  syncFromWdms() {
    if (this.syncing) {
      return;
    }
    this.syncing = true;
    this.deviceService.syncFromWdms().subscribe((res: any) => {
      this.syncing = false;
      if (res) {
        this.loadDevices();
        setTimeout(() => {
          this.toastr.success('', `Synced ${res.totalFetched} device(s) from WDMS${res.failedCount ? `, ${res.failedCount} failed` : ''}.`);
        }, 500)
      }
    }, err => {
      this.syncing = false;
      this.errorCheck = true;
      this.errorMsg = err.error;
    })
  }

  openAssignModal(deviceId: String) {
    this.showAssignModal = true;
    this.selectedDeviceId = deviceId;
    this.selectedSchoolId = '';
    this.selectedSchoolName = '';
    this.schoolSearch = {};
    this.schoolSearchResults = [];
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    // Refresh the unassigned pool in case another sales user assigned it moments ago.
    this.deviceService.getUnassignedDevices().subscribe((res: any) => {
      if (res) {
        this.unassignedDevices = res;
      }
    });
  }

  closeModal() {
    this.showAssignModal = false;
    this.selectedDeviceId = '';
    this.selectedSchoolId = '';
    this.selectedSchoolName = '';
    this.errorCheck = false;
    this.errorMsg = '';
  }

  searchSchools() {
    this.adminUserService.getAdminDirectory(this.schoolSearch.searchText).subscribe((res: any) => {
      if (res) {
        this.schoolSearchResults = res;
      }
    });
  }

  selectSchool(school: any) {
    this.selectedSchoolId = school._id;
    this.selectedSchoolName = school.schoolName;
  }

  successDone(res: any) {
    this.closeModal();
    this.successMsg = '';
    this.loadDevices();
    if (this.viewMode === 'school-wise') {
      this.loadSchoolWise();
    }
    setTimeout(() => {
      this.toastr.success('', res);
    }, 500)
  }

  confirmAssign() {
    if (!this.selectedSchoolId) {
      return;
    }
    if (this.isClick) {
      return;
    }
    this.isClick = true;
    this.deviceService.assignDevice({ deviceId: this.selectedDeviceId, schoolId: this.selectedSchoolId }).subscribe((res: any) => {
      if (res) {
        this.isClick = false;
        this.successDone(res);
      }
    }, err => {
      this.errorCheck = true;
      this.errorMsg = err.error;
      this.isClick = false;
    })
  }

  activate(id: String) {
    if (this.isClick) {
      return;
    }
    this.isClick = true;
    this.deviceService.activateDevice(id).subscribe((res: any) => {
      if (res) {
        this.isClick = false;
        this.successDone(res);
      }
    }, err => {
      this.errorCheck = true;
      this.errorMsg = err.error;
      this.isClick = false;
    })
  }

  block(id: String) {
    if (this.isClick) {
      return;
    }
    this.isClick = true;
    this.deviceService.blockDevice(id).subscribe((res: any) => {
      if (res) {
        this.isClick = false;
        this.successDone(res);
      }
    }, err => {
      this.errorCheck = true;
      this.errorMsg = err.error;
      this.isClick = false;
    })
  }
}
