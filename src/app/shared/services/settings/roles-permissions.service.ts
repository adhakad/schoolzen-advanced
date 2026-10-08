/**
 * Settings → Roles & Permissions — thin wrappers around /api/v2/settings/roles and
 * /api/v2/settings/role-assignments. No error handling here: ErrorInterceptor surfaces
 * everything except inline-form errors.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  AssignmentScope, BulkAssignmentDeleteResponse, ClassScopeNode, MatrixQuery, MatrixResponse,
  ModulePermission, RoleAssignment, Role, RolesResponse
} from 'src/app/shared/models/settings/roles.model';

@Injectable({ providedIn: 'root' })
export class RolesPermissionsService {
  private url = `${environment.API_URL}/api/v2/settings`;

  constructor(private http: HttpClient) {}

  // Step 1 — roles
  getRoles(adminId: string): Observable<RolesResponse> {
    return this.http.get<RolesResponse>(`${this.url}/roles`, { params: { adminId } });
  }

  createRole(adminId: string, name: string, isScoped: boolean): Observable<{ role: Role }> {
    return this.http.post<{ role: Role }>(`${this.url}/roles`, { adminId, name, isScoped, permissions: [] });
  }

  updateRolePermissions(adminId: string, roleId: string, permissions: ModulePermission[]): Observable<{ role: Role }> {
    return this.http.put<{ role: Role }>(`${this.url}/roles/${roleId}`, { adminId, permissions });
  }

  deleteRole(adminId: string, roleId: string): Observable<unknown> {
    return this.http.delete(`${this.url}/roles/${roleId}`, { params: { adminId } });
  }

  // Step 2 — assignments
  getMatrix(adminId: string, query: MatrixQuery): Observable<MatrixResponse> {
    const params: Record<string, string> = { adminId };
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params[key] = String(value);
    });
    return this.http.get<MatrixResponse>(`${this.url}/role-assignments/matrix`, { params });
  }

  getClassOptions(adminId: string): Observable<{ classes: ClassScopeNode[] }> {
    return this.http.get<{ classes: ClassScopeNode[] }>(`${this.url}/role-assignments/class-options`, { params: { adminId } });
  }

  createAssignment(adminId: string, staffId: string, roleId: string, scope: AssignmentScope): Observable<{ assignment: RoleAssignment }> {
    return this.http.post<{ assignment: RoleAssignment }>(`${this.url}/role-assignments`, { adminId, staffId, roleId, ...scope });
  }

  updateAssignment(adminId: string, id: string, scope: AssignmentScope): Observable<unknown> {
    return this.http.put(`${this.url}/role-assignments/${id}`, { adminId, ...scope });
  }

  deleteAssignment(adminId: string, id: string): Observable<unknown> {
    return this.http.delete(`${this.url}/role-assignments/${id}`, { params: { adminId } });
  }

  /** `confirm: 'DELETE'` is the server's backstop behind the type-to-confirm gate. */
  bulkDeleteAssignments(adminId: string, ids: string[]): Observable<BulkAssignmentDeleteResponse> {
    return this.http.post<BulkAssignmentDeleteResponse>(`${this.url}/role-assignments/bulk-delete`,
      { adminId, ids, confirm: 'DELETE' });
  }
}
