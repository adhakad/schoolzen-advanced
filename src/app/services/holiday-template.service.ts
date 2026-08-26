import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HolidayTemplate, PublicHolidayState } from '../modal/holiday-template.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class HolidayTemplateService {
  url = `${environment.API_URL}/v1/holiday-template`;
  constructor(private http: HttpClient) { }

  addHolidayTemplate(templateData: any) {
    return this.http.post(this.url, templateData);
  }
  // What the Assign tab's template dropdown reads.
  getHolidayTemplateList(adminId: any) {
    return this.http.get<HolidayTemplate[]>(`${this.url}/all-holiday-template/${adminId}`);
  }
  getHolidayTemplateCount(adminId: any) {
    return this.http.get(`${this.url}/holiday-template-count/${adminId}`);
  }
  holidayTemplatePaginationList(templateData: any) {
    return this.http.post(`${this.url}/holiday-template-pagination`, templateData);
  }
  // Resolves holidayIds into the Holiday documents themselves — the edit modal seeds its
  // checklist from this rather than re-deriving it.
  getSingleHolidayTemplate(id: String) {
    return this.http.get<HolidayTemplate>(`${this.url}/${id}`);
  }
  updateHolidayTemplate(templateData: any) {
    return this.http.put(`${this.url}/${templateData._id}`, templateData);
  }
  // The "holidays in this template" sub-list. Toggling one holiday, rather than resubmitting
  // the whole template, so two admins editing different holidays cannot clobber each other.
  addHolidayToTemplate(id: String, holidayId: String) {
    return this.http.put(`${this.url}/${id}/add-holiday`, { holidayId });
  }
  removeHolidayFromTemplate(id: String, holidayId: String) {
    return this.http.put(`${this.url}/${id}/remove-holiday`, { holidayId });
  }
  // Refused server-side while anybody is still assigned to it.
  deleteHolidayTemplate(id: String) {
    return this.http.delete(`${this.url}/${id}`);
  }

  // ---- State-wise public holiday preset ----------------------------------
  // The states the hand-maintained system-holidays collection actually has data for.
  // Returns [] on a fresh install rather than an error — see backend/docs/README.md.
  getPublicHolidayStates(year: Number) {
    return this.http.get<PublicHolidayState[]>(`${this.url}/public-states/${year}`);
  }
  // data: { adminId, state, year, templateName }
  // A ONE-TIME COPY: every preset entry becomes a normal, editable Holiday owned by this
  // school. Correcting the preset later never touches what this produced.
  generateFromPublic(data: any) {
    return this.http.post(`${this.url}/generate-from-public`, data);
  }
}
