import { Component, OnInit, Input, Output, EventEmitter  } from '@angular/core';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-pagination',
  templateUrl: './pagination.component.html',
  styleUrls: ['./pagination.component.css']
})
export class PaginationComponent implements OnInit {
  @Input() totalTableRecords: number = 0;
  @Input() paginationValues?: Subject<any>;
  @Output() onChange: EventEmitter<any> = new EventEmitter();
  public recordLimit: number = 10;
	public pages: number[] = [];
	public activePageNumber: number = 0;
	public iteration: number = 0;
	public filters:any = {};
	public selectedLimit:any = 10;
	
    constructor() {}

    ngOnInit() {
    	this.paginationValues?.subscribe((value) => {
    		if(value && value.type == "page-init") {
    			this.totalTableRecords = value.totalTableRecords;
				// console.log(value.page)
    			this.onChangePage(value.page,0);
    		}
    	})
    }


	calcNumberOfPage() {
      	this.iteration = (this.recordLimit == 0) ? 0 : this.totalTableRecords / this.recordLimit;
      	if(this.iteration < 0) { this.iteration = 0; }
      	else if(this.iteration > Number(this.iteration.toFixed())) {
        	this.iteration = Number(this.iteration.toFixed()) + 1;
      	} else { this.iteration = Number(this.iteration.toFixed()); }
	}

	onChangePage(page:any,isForceChange:any) {
        this.calcNumberOfPage();
        this.pages = [];
        for(var i = 1; i <= this.iteration; i++) {
          this.pages[i-1] = i;
		//   console.log(this.pages)
        }
        if(page != this.activePageNumber || isForceChange) {
        	this.activePageNumber = page;
        	this.onChange.emit({page:page,limit:this.recordLimit});
        }
	}

	queryLimitChange(value:any) {
	    if(value == "ALL") {
	        this.recordLimit = 0
	    } else {
	        this.recordLimit = parseInt(value);
	    }
	    this.onChangePage(1,1);
	}

	changePage(val:any) {
	    if((val == -1 && this.activePageNumber <= 1) ||
	      (val == 1 && this.iteration <= this.activePageNumber)) {
	      return ;
	    }
	    var tempPageNumber = this.activePageNumber + Number(val);
	    this.calcNumberOfPage();
	    if(tempPageNumber == -1) { tempPageNumber = 0; }
	    if(tempPageNumber > this.iteration) {
	      tempPageNumber = this.iteration;
	    }
	    this.onChangePage(tempPageNumber,0);
	}

  showPages(index:any):any {
    if(index > this.activePageNumber-5 && this.activePageNumber + 5 > index) {
      return true;
    }
  }
}
