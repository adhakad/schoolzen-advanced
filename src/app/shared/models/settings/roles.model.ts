/** Settings → Roles & Permissions — the shapes of /api/v2/settings/roles + /role-assignments. */

export interface ModulePermission {
  module: string;
  canView: boolean;
  canEdit: boolean;
}

export interface Role {
  _id: string;
  name: string;
  isSuperAdmin: boolean;
  isScoped: boolean;
  permissions: ModulePermission[];
  /** Staff currently holding the role — non-zero blocks "Remove this role" (ROLE_IN_USE). */
  holderCount: number;
  holderNames: string[];
}

export interface RolesResponse {
  roles: Role[];
  modules: string[];
}

export interface RoleAssignment {
  _id: string;
  roleId: string;
  scope: 'school' | 'class';
  classId: string | null;
  streamId: string | null;
  sectionId: string | null;
  label: string;
}

export interface MatrixStaffRow {
  _id: string;
  name: string;
  empCode: string | null;
  department: string | null;
  designation: string | null;
  /** The school's root account — its Super Admin chip can't be removed. */
  isOwner: boolean;
  assignments: RoleAssignment[];
}

export interface MatrixQuery {
  search?: string;
  department?: string;
  designation?: string;
  roleId?: string;
  assigned?: '' | 'assigned' | 'unassigned';
  cursor?: string;
  limit?: number;
}

export interface MatrixResponse {
  rows: MatrixStaffRow[];
  nextCursor: string | null;
  filters: { departments: { name: string; designations: string[] }[] };
  summary: { totalStaff: number; assigned: number; unassigned: number };
}

export interface ScopeOption { _id: string; label: string; }
export interface ClassScopeNode {
  _id: string;
  label: string;
  hasStreams: boolean;
  sections: ScopeOption[];
  streams: (ScopeOption & { sections: ScopeOption[] })[];
}

export interface AssignmentScope {
  classId: string | null;
  streamId: string | null;
  sectionId: string | null;
}

export interface BulkAssignmentDeleteResponse {
  message: string;
  deletedCount: number;
  results: { id: string; status: 'deleted' | 'failed'; code?: string; message?: string }[];
}
