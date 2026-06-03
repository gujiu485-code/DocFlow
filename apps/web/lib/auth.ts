import { DEFAULT_WORKSPACE_MEMBER_ID } from "@/lib/members";

export type AuthRole = "admin" | "user";

export type AuthSession = {
  id: string;
  memberId: string;
  name: string;
  email: string;
  role: AuthRole;
  loggedInAt: string;
};

export type LoginPayload = {
  role: AuthRole;
  email: string;
  password: string;
};

export const AUTH_SESSION_STORAGE_KEY = "docflow-auth-session";
export const DEFAULT_USER_MEMBER_ID = "member-tech";

export const authRoleLabels: Record<AuthRole, string> = {
  admin: "管理员",
  user: "普通用户",
};

export const demoAccounts: Record<AuthRole, { email: string; password: string; name: string; memberId: string }> = {
  admin: {
    email: "admin@docflow.local",
    password: "admin123",
    name: "系统管理员",
    memberId: DEFAULT_WORKSPACE_MEMBER_ID,
  },
  user: {
    email: "user@docflow.local",
    password: "user123",
    name: "普通用户",
    memberId: DEFAULT_USER_MEMBER_ID,
  },
};

export const createAuthSession = ({ role, email, password }: LoginPayload): AuthSession => {
  const account = demoAccounts[role];
  const normalizedEmail = email.trim().toLowerCase();

  // 第一版是前端本地演示登录；真实项目中这里应替换为后端登录接口。
  if (normalizedEmail !== account.email || password !== account.password) {
    throw new Error("账号或密码不正确，请检查当前选择的登录角色。");
  }

  return {
    id: `${role}-${Date.now()}`,
    memberId: account.memberId,
    name: account.name,
    email: account.email,
    role,
    loggedInAt: new Date().toISOString(),
  };
};

export const loadAuthSession = (): AuthSession | null => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return normalizeAuthSession(JSON.parse(raw));
  } catch {
    clearAuthSession();
    return null;
  }
};

export const saveAuthSession = (session: AuthSession) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
};

export const clearAuthSession = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
};

export const isAdminSession = (session: AuthSession | null) => session?.role === "admin";

function normalizeAuthSession(value: Partial<AuthSession> & Record<string, unknown>): AuthSession | null {
  if (value.role !== "admin" && value.role !== "user") return null;

  const account = demoAccounts[value.role];

  return {
    id: typeof value.id === "string" && value.id ? value.id : `${value.role}-${Date.now()}`,
    memberId: typeof value.memberId === "string" && value.memberId ? value.memberId : account.memberId,
    name: typeof value.name === "string" && value.name ? value.name : account.name,
    email: typeof value.email === "string" && value.email ? value.email : account.email,
    role: value.role,
    loggedInAt: typeof value.loggedInAt === "string" ? value.loggedInAt : new Date().toISOString(),
  };
}
