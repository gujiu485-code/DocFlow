import type { AuditLogItem } from "@/lib/audit-logs";
import type { DocumentVersion } from "@/lib/document-versions";
import type { KnowledgeIndexStore } from "@/lib/knowledge-base";
import type { KnowledgeSyncLog } from "@/lib/knowledge-sync";
import type { WorkspaceMember } from "@/lib/members";

export type WorkspaceDatabaseState = {
  members?: WorkspaceMember[];
  versions?: DocumentVersion[];
  auditLogs?: AuditLogItem[];
  knowledgeIndex?: KnowledgeIndexStore;
  knowledgeSyncLogs?: KnowledgeSyncLog[];
};

export const loadWorkspaceStateFromDatabase = async (): Promise<Required<WorkspaceDatabaseState> | null> => {
  const response = await fetch("/api/workspace/state", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    if (payload?.enabled === false) return null;
    throw new Error(typeof payload?.error === "string" ? payload.error : "数据库工作区状态加载失败。");
  }

  return {
    members: Array.isArray(payload?.members) ? payload.members : [],
    versions: Array.isArray(payload?.versions) ? payload.versions : [],
    auditLogs: Array.isArray(payload?.auditLogs) ? payload.auditLogs : [],
    knowledgeIndex: payload?.knowledgeIndex ?? { documents: [], chunks: [], updatedAt: new Date().toISOString() },
    knowledgeSyncLogs: Array.isArray(payload?.knowledgeSyncLogs) ? payload.knowledgeSyncLogs : [],
  };
};

export const saveWorkspaceStateToDatabase = async (state: WorkspaceDatabaseState) => {
  const response = await fetch("/api/workspace/state", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(state),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    if (payload?.enabled === false) return { enabled: false, message: payload.message as string | undefined };
    throw new Error(typeof payload?.error === "string" ? payload.error : "数据库工作区状态保存失败。");
  }

  return {
    enabled: true,
  };
};
