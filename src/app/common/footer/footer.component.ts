import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SchoolService } from 'src/app/services/school.service';
import { environment } from 'src/environments/environment';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.css']
})
export class FooterComponent implements OnInit {
  currentYear: any;
  schoolInfo: any;
  whatsapp: string = 'https://wa.me/919893830679';
  facebook: string = 'https://www.facebook.com/profile.php?id=61587578035485';
  linkedin: string = 'https://www.linkedin.com/company/schoolzen';
  instagram: string = 'https://www.instagram.com/schoolzen_official/';
  youtube: string = 'https://www.youtube.com/@Schoolzen';
  softwareCompanyLink: string = 'https://schoolzen.in';
  adminId!: any;
  constructor(private router: Router, private schoolService: SchoolService, private adminAuthService: AdminAuthService) { }

  ngOnInit(): void {
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    this.getSchool();
    this.currentYear = (new Date()).getFullYear();
  }
  // socialMediaRedirect(link: string) {
  //   try {
  //     const sanitizedLink = encodeURI(link);
  //     const trustedDomains = ['wa.me', 'facebook.com', 'linkedin.com', 'instagram.com', 'youtube.com'];
  //     const parsed = new URL(sanitizedLink);
  //     const isTrusted = trustedDomains.some(domain => parsed.hostname.includes(domain));

  //     if (isTrusted) {
  //       window.open(sanitizedLink, '_blank');
  //     } else {
  //       console.warn('Blocked untrusted URL:', sanitizedLink);
  //     }
  //   } catch (e) {
  //     console.error('Invalid URL:', link);
  //   }
  // }
  socialMediaRedirect(link:string){
    const sanitizedLink = encodeURI(link);
    window.location.href = sanitizedLink;
  }
  softwareCompany(link: string) {
    const sanitizedLink = encodeURI(link);
    window.location.href = sanitizedLink;
  }
  getSchool() {
    this.schoolService.getSchool(this.adminId).subscribe((res: any) => {
      if (res) {
        this.schoolInfo = res;
        this.whatsapp = 'https://wa.me/9893830679'
        this.facebook = 'https://www.facebook.com/profile.php?id=61587578035485';
        this.linkedin = 'https://www.linkedin.com/company/schoolzen';
        this.instagram = 'https://www.instagram.com/schoolzen_official/';
        this.youtube = 'https://www.youtube.com/@Schoolzen';

      }
    })
  }
  openInNewTab(route: string) {
    const url = this.router.serializeUrl(
      this.router.createUrlTree([route])
    );
    window.open(url, '_blank', 'noopener,noreferrer');
  }

}
