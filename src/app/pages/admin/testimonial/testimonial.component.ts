import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Testimonial } from 'src/app/modal/testimonial.model';
import { TestimonialService } from 'src/app/services/testimonial.service';

@Component({
  selector: 'app-testimonial',
  templateUrl: './testimonial.component.html',
  styleUrls: ['./testimonial.component.css']
})
export class TestimonialComponent implements OnInit {
  public baseUrl = environment.API_URL;
  testimonialForm: FormGroup;
  showModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  successMsg: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  testimonialInfo: Testimonial[] = [];

  recordLimit: number = 5;
  filters: any = {};
  number: number = 0;
  paginationValues: Subject<any> = new Subject();
  loader:Boolean=true;
  constructor(private fb: FormBuilder, private testimonialService: TestimonialService) {
    this.testimonialForm = this.fb.group({
      _id: [''],
      name: ['', Validators.required],
      role: ['', Validators.required],
      desc: ['', Validators.required],
      image: [''],
    })
  }

  ngOnInit(): void {
    let load:any=this.getTestimonial({ page: 1 });
    if(load){
      setTimeout(()=>{
        this.loader = false;
      },1000);
    }
  }

  getTestimonial($event: any) {
    return new Promise((resolve, reject) => {
      let params: any = {
        filters: {},
        page: $event.page,
        limit: $event.limit ? $event.limit : this.recordLimit
      };
      this.recordLimit = params.limit;
      if (this.filters.searchText) {
        params["filters"]["searchText"] = this.filters.searchText.trim();
      }

      this.testimonialService.testimonialPaginationList(params).subscribe((res: any) => {
        if (res) {
          this.testimonialInfo = res.testimonialList;
          this.number = params.page;
          this.paginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countTestimonial });
          return resolve(true);
        }
      });
    });
  }

  closeModal() {
    this.showModal = false;
    this.updateMode = false;
    this.deleteMode = false;
    this.errorMsg = '';
  }
  addTestimonialModel() {
    this.showModal = true;
    this.deleteMode = false;
    this.testimonialForm.reset();
  }
  updateTestimonialModel(testimonial: Testimonial) {
    this.showModal = true;
    this.deleteMode = false;
    this.updateMode = true;
    this.testimonialForm.patchValue(testimonial);
  }
  deleteTestimonialModel(id: String) {
    this.showModal = true;
    this.updateMode = false;
    this.deleteMode = true;
    this.deleteById = id;
  }

  successDone() {
    setTimeout(() => {
      this.closeModal();
      this.successMsg = '';
      this.getTestimonial({ page: 1 });
    }, 1000)
  }
  testimonialAddUpdate() {
    if (this.testimonialForm.valid) {
      if (this.updateMode) {
        this.testimonialService.updateTestimonial(this.testimonialForm.value).subscribe((res: any) => {
          if (res) {
            this.successDone();
            this.successMsg = res;
          }
        }, err => {
          this.errorCheck = true;
          this.errorMsg = err.error;
        })
      } else {
        this.testimonialService.addTestimonial(this.testimonialForm.value).subscribe((res: any) => {
          if (res) {
            this.successDone();
            this.successMsg = res;
          }
        }, err => {
          this.errorCheck = true;
          this.errorMsg = err.error;
        })
      }
    }
  }

  testimonialDelete(id: String) {
    this.testimonialService.deleteTestimonial(id).subscribe((res: any) => {
      if (res) {
        this.successDone();
        this.successMsg = res;
        this.deleteById = '';
      }
    })
  }

}
