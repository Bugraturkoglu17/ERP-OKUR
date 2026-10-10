export type UserRole = "ADMIN" | "MANAGER" | "USER";

export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "Admin",
  MANAGER: "Yönetici",
  USER: "Kullanıcı",
};

export const ROLE_PANEL_HOME: Record<UserRole, string> = {
  ADMIN: "/admin/dashboard",
  MANAGER: "/manager/dashboard",
  USER: "/user/dashboard",
};

export const ADMIN_PERMISSIONS = [
  "USER_CREATE",
  "USER_UPDATE",
  "USER_DELETE",
  "USER_DISABLE",
  "USER_RESET_PASSWORD",
  "ROLE_MANAGE",
  "AUDIT_READ",
  "SETTINGS_MANAGE",
  "ALL_MODULES_ACCESS",
] as const;

export const MANAGER_PERMISSIONS = [
  "WORK_ORDER_CREATE",
  "WORK_ORDER_ASSIGN",
  "WORK_ORDER_READ_ALL",
  "WORK_ORDER_UPDATE_ALL",
  "REPORT_READ_ALL",
  "STORE_READ_ALL",
  "STORE_FILE_ATTACH",
  "GENERAL_ARCHIVE_MANAGE",
  "USER_CREATE_EMPLOYEE",
  "USER_UPDATE_EMPLOYEE",
  "USER_DELETE_EMPLOYEE",
  "USER_DISABLE_EMPLOYEE",
] as const;

export const USER_PERMISSIONS = [
  "WORK_ORDER_READ_ASSIGNED",
  "WORK_ORDER_START_ASSIGNED",
  "WORK_ORDER_UPDATE_ASSIGNED",
  "REPORT_CREATE_ASSIGNED",
  "REPORT_UPLOAD_FILE_ASSIGNED",
  "PROFILE_READ_SELF",
  "PROFILE_UPDATE_SELF",
] as const;

export type Permission =
  | (typeof ADMIN_PERMISSIONS)[number]
  | (typeof MANAGER_PERMISSIONS)[number]
  | (typeof USER_PERMISSIONS)[number];

// Gerçek güvenlik backend permission kontrolü ile sağlanacak.
export const ROLE_PERMISSIONS: Record<UserRole, readonly string[]> = {
  ADMIN: ADMIN_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  USER: USER_PERMISSIONS,
};
