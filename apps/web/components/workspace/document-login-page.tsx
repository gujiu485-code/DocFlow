"use client";

import { Button } from "@/components/tailwind/ui/button";
import {
  authRoleLabels,
  createAuthSession,
  demoAccounts,
  saveAuthSession,
  type AuthRole,
  type AuthSession,
} from "@/lib/auth";
import { cn } from "@/lib/utils";
import { LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";

interface DocumentLoginPageProps {
  onLogin: (session: AuthSession) => void;
}

const roleDescriptions: Record<AuthRole, string> = {
  admin: "管理成员、配置协作权限、维护知识库任务。",
  user: "创建和编辑文档，参与知识库协作流程。",
};

export function DocumentLoginPage({ onLogin }: DocumentLoginPageProps) {
  const [role, setRole] = useState<AuthRole>("admin");
  const [email, setEmail] = useState(demoAccounts.admin.email);
  const [password, setPassword] = useState(demoAccounts.admin.password);
  const [error, setError] = useState<string | null>(null);

  const selectRole = (nextRole: AuthRole) => {
    setRole(nextRole);
    setEmail(demoAccounts[nextRole].email);
    setPassword(demoAccounts[nextRole].password);
    setError(null);
  };

  const submitLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      const session = createAuthSession({ role, email, password });
      saveAuthSession(session);
      onLogin(session);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登录失败，请稍后重试。");
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f7f5] text-foreground dark:bg-background">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-10">
        <div className="grid w-full gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <section>
            <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              企业知识库协作平台
            </div>
            <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
              DocFlow AI
              <span className="block text-2xl font-medium text-muted-foreground sm:text-3xl">统一文档、成员与知识库权限入口</span>
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground">
              当前版本使用本地演示账号区分管理员和普通用户。管理员偏向空间治理，普通用户偏向文档协作，后续可以平滑接入真实登录接口和 RBAC 权限。
            </p>
            <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-2">
              <RoleSummary icon={<ShieldCheck className="h-4 w-4" />} title="管理员" description="成员管理、权限分配、知识库同步治理" />
              <RoleSummary icon={<UserRound className="h-4 w-4" />} title="普通用户" description="文档创建、内容编辑、参与协作" />
            </div>
          </section>

          <form onSubmit={submitLogin} className="rounded-lg border bg-background p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-foreground text-background">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">登录工作区</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">选择角色后进入对应工作台</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2">
              {(["admin", "user"] as AuthRole[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={cn(
                    "rounded-md border px-3 py-3 text-left transition-colors hover:bg-accent",
                    role === item && "border-foreground bg-accent",
                  )}
                  onClick={() => selectRole(item)}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {item === "admin" ? <ShieldCheck className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                    {authRoleLabels[item]}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{roleDescriptions[item]}</p>
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">账号</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus:border-foreground"
                  placeholder="请输入账号"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">密码</span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus:border-foreground"
                  placeholder="请输入密码"
                />
              </label>
            </div>

            <div className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-xs leading-5 text-muted-foreground">
              演示账号：{demoAccounts[role].email} / {demoAccounts[role].password}
            </div>

            {error && <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>}

            <Button type="submit" className="mt-5 h-10 w-full">
              以{authRoleLabels[role]}身份登录
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}

function RoleSummary({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-md border bg-background p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}
