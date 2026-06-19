import { normalizeAuditLog, type AuditLogItem } from "@/lib/audit-logs";
import { normalizeDocumentVersion, type DocumentVersion } from "@/lib/document-versions";
import {
  normalizeKnowledgeChunk,
  normalizeKnowledgeIndexedDocument,
  type KnowledgeIndexStore,
} from "@/lib/knowledge-base";
import { normalizeKnowledgeSyncLog, type KnowledgeSyncLog } from "@/lib/knowledge-sync";
import {
  createDefaultWorkspaceMembers,
  normalizeWorkspaceMember,
  sortWorkspaceMembers,
  type WorkspaceMember,
} from "@/lib/members";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";

export const runtime = "nodejs";

const parseDate = (value: string | null | undefined, fallback = new Date()) => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
};

const normalizeArray = <T>(value: unknown, normalize: (item: Record<string, unknown>) => T | null): T[] =>
  (Array.isArray(value) ? value : [])
    .map((item) => (item && typeof item === "object" ? normalize(item as Record<string, unknown>) : null))
    .filter((item): item is T => Boolean(item));

const createDatabaseDisabledResponse = () =>
  Response.json(
    {
      enabled: false,
      message: "未配置 DATABASE_URL，当前继续使用浏览器本地工作区状态存储。",
    },
    { status: 503 },
  );

const toMemberResponse = (member: {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarColor: string;
  createdAt: Date;
  updatedAt: Date;
}): WorkspaceMember =>
  normalizeWorkspaceMember({
    id: member.id,
    name: member.name,
    email: member.email,
    role: member.role,
    avatarColor: member.avatarColor,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
  } as Partial<WorkspaceMember> & Record<string, unknown>);

const toMemberDatabase = (member: WorkspaceMember) => ({
  id: member.id,
  name: member.name,
  email: member.email,
  role: member.role,
  avatarColor: member.avatarColor,
  createdAt: parseDate(member.createdAt),
  updatedAt: parseDate(member.updatedAt),
});

const toVersionResponse = (version: {
  id: string;
  documentId: string;
  title: string;
  contentJson: unknown;
  contentText: string;
  createdAt: Date;
}): DocumentVersion | null =>
  normalizeDocumentVersion({
    id: version.id,
    documentId: version.documentId,
    title: version.title,
    contentJson: version.contentJson,
    contentText: version.contentText,
    createdAt: version.createdAt.toISOString(),
  });

const toVersionDatabase = (version: DocumentVersion) => ({
  id: version.id,
  documentId: version.documentId,
  title: version.title,
  contentJson: version.contentJson,
  contentText: version.contentText,
  createdAt: parseDate(version.createdAt),
});

const toAuditLogResponse = (log: {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  actionLabel: string;
  documentId: string | null;
  documentTitle: string | null;
  detail: string | null;
  createdAt: Date;
}): AuditLogItem | null =>
  normalizeAuditLog({
    id: log.id,
    actorId: log.actorId,
    actorName: log.actorName,
    actorRole: log.actorRole,
    action: log.action,
    actionLabel: log.actionLabel,
    documentId: log.documentId,
    documentTitle: log.documentTitle ?? undefined,
    detail: log.detail ?? undefined,
    createdAt: log.createdAt.toISOString(),
  } as Partial<AuditLogItem> & Record<string, unknown>);

const toAuditLogDatabase = (log: AuditLogItem) => ({
  id: log.id,
  actorId: log.actorId,
  actorName: log.actorName,
  actorRole: log.actorRole,
  action: log.action,
  actionLabel: log.actionLabel,
  documentId: log.documentId ?? null,
  documentTitle: log.documentTitle ?? null,
  detail: log.detail ?? null,
  createdAt: parseDate(log.createdAt),
});

const toKnowledgeDocumentResponse = (document: {
  documentId: string;
  title: string;
  contentHash: string;
  chunkCount: number;
  indexedAt: Date;
}) =>
  normalizeKnowledgeIndexedDocument({
    documentId: document.documentId,
    title: document.title,
    contentHash: document.contentHash,
    chunkCount: document.chunkCount,
    indexedAt: document.indexedAt.toISOString(),
  });

const toKnowledgeDocumentDatabase = (document: KnowledgeIndexStore["documents"][number]) => ({
  documentId: document.documentId,
  title: document.title,
  contentHash: document.contentHash,
  chunkCount: document.chunkCount,
  indexedAt: parseDate(document.indexedAt),
});

const toKnowledgeChunkDatabase = (chunk: KnowledgeIndexStore["chunks"][number]) => ({
  id: chunk.id,
  documentId: chunk.documentId,
  documentTitle: chunk.documentTitle,
  chunkIndex: chunk.chunkIndex,
  text: chunk.text,
  headingPath: chunk.headingPath,
  contentHash: chunk.contentHash,
  createdAt: parseDate(chunk.createdAt),
  updatedAt: parseDate(chunk.updatedAt),
});

const toKnowledgeSyncLogResponse = (log: {
  id: string;
  documentId: string;
  documentTitle: string;
  status: string;
  message: string;
  createdAt: Date;
}): KnowledgeSyncLog =>
  normalizeKnowledgeSyncLog({
    id: log.id,
    documentId: log.documentId,
    documentTitle: log.documentTitle,
    status: log.status,
    message: log.message,
    createdAt: log.createdAt.toISOString(),
  } as Partial<KnowledgeSyncLog> & Record<string, unknown>);

const toKnowledgeSyncLogDatabase = (log: KnowledgeSyncLog) => ({
  id: log.id,
  documentId: log.documentId,
  documentTitle: log.documentTitle,
  status: log.status,
  message: log.message,
  createdAt: parseDate(log.createdAt),
});

const replaceByIds = async <T extends { id: string }>(
  items: T[],
  upsert: (item: T) => Promise<unknown>,
  deleteMissing: (ids: string[]) => Promise<unknown>,
) => {
  for (const item of items) {
    await upsert(item);
  }

  await deleteMissing(items.map((item) => item.id));
};

export async function GET() {
  if (!isDatabaseConfigured()) return createDatabaseDisabledResponse();

  try {
    const prisma = getPrisma();
    let members = await prisma.workspaceMember.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    if (!members.length) {
      await prisma.$transaction(
        createDefaultWorkspaceMembers().map((member) =>
          prisma.workspaceMember.create({
            data: toMemberDatabase(member),
          }),
        ),
      );

      members = await prisma.workspaceMember.findMany({
        orderBy: [{ role: "asc" }, { name: "asc" }],
      });
    }

    const versions = await prisma.documentVersion.findMany({
      orderBy: [{ createdAt: "desc" }],
    });
    const auditLogs = await prisma.auditLog.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 300,
    });
    const knowledgeDocuments = await prisma.knowledgeIndexedDocument.findMany({
      orderBy: [{ indexedAt: "desc" }],
    });
    const knowledgeSyncLogs = await prisma.knowledgeSyncLog.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 50,
    });

    return Response.json({
      enabled: true,
      members: sortWorkspaceMembers(members.map(toMemberResponse)),
      versions: versions.map(toVersionResponse).filter((item): item is DocumentVersion => Boolean(item)),
      auditLogs: auditLogs.map(toAuditLogResponse).filter((item): item is AuditLogItem => Boolean(item)),
      knowledgeIndex: {
        documents: knowledgeDocuments
          .map(toKnowledgeDocumentResponse)
          .filter((item): item is KnowledgeIndexStore["documents"][number] => Boolean(item)),
        chunks: [],
        updatedAt: new Date().toISOString(),
      },
      knowledgeSyncLogs: knowledgeSyncLogs.map(toKnowledgeSyncLogResponse),
    });
  } catch (error) {
    console.error("数据库工作区状态加载失败", error);
    return Response.json(
      {
        enabled: true,
        error: error instanceof Error ? error.message : "数据库工作区状态加载失败。",
      },
      { status: 503 },
    );
  }
}

export async function PUT(req: Request) {
  if (!isDatabaseConfigured()) return createDatabaseDisabledResponse();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const prisma = getPrisma();

  try {
    await prisma.$transaction(async (transaction) => {
      if (Array.isArray(body?.members)) {
        const members = normalizeArray(body.members, normalizeWorkspaceMember);
        await replaceByIds(
          members,
          (member) =>
            transaction.workspaceMember.upsert({
              where: { id: member.id },
              create: toMemberDatabase(member),
              update: toMemberDatabase(member),
            }),
          (ids) =>
            transaction.workspaceMember.deleteMany({
              where: { id: { notIn: ids.length ? ids : ["__docflow_empty_member_set__"] } },
            }),
        );
      }

      if (Array.isArray(body?.versions)) {
        const versions = normalizeArray(body.versions, normalizeDocumentVersion);
        await replaceByIds(
          versions,
          (version) =>
            transaction.documentVersion.upsert({
              where: { id: version.id },
              create: toVersionDatabase(version),
              update: toVersionDatabase(version),
            }),
          (ids) =>
            transaction.documentVersion.deleteMany({
              where: { id: { notIn: ids.length ? ids : ["__docflow_empty_version_set__"] } },
            }),
        );
      }

      if (Array.isArray(body?.auditLogs)) {
        const auditLogs = normalizeArray(body.auditLogs, normalizeAuditLog).slice(0, 300);
        await replaceByIds(
          auditLogs,
          (log) =>
            transaction.auditLog.upsert({
              where: { id: log.id },
              create: toAuditLogDatabase(log),
              update: toAuditLogDatabase(log),
            }),
          (ids) =>
            transaction.auditLog.deleteMany({
              where: { id: { notIn: ids.length ? ids : ["__docflow_empty_audit_set__"] } },
            }),
        );
      }

      if (body?.knowledgeIndex && typeof body.knowledgeIndex === "object") {
        const knowledgeIndex = body.knowledgeIndex as Partial<KnowledgeIndexStore> & Record<string, unknown>;
        const documents = normalizeArray(knowledgeIndex.documents, normalizeKnowledgeIndexedDocument);
        const chunks = normalizeArray(knowledgeIndex.chunks, normalizeKnowledgeChunk);

        await replaceByIds(
          documents.map((document) => ({ id: document.documentId, ...document })),
          (document) =>
            transaction.knowledgeIndexedDocument.upsert({
              where: { documentId: document.documentId },
              create: toKnowledgeDocumentDatabase(document),
              update: toKnowledgeDocumentDatabase(document),
            }),
          (ids) =>
            transaction.knowledgeIndexedDocument.deleteMany({
              where: { documentId: { notIn: ids.length ? ids : ["__docflow_empty_knowledge_document_set__"] } },
            }),
        );

        await replaceByIds(
          chunks,
          (chunk) =>
            transaction.knowledgeChunk.upsert({
              where: { id: chunk.id },
              create: toKnowledgeChunkDatabase(chunk),
              update: toKnowledgeChunkDatabase(chunk),
            }),
          (ids) =>
            transaction.knowledgeChunk.deleteMany({
              where: { id: { notIn: ids.length ? ids : ["__docflow_empty_knowledge_chunk_set__"] } },
            }),
        );
      }

      if (Array.isArray(body?.knowledgeSyncLogs)) {
        const logs = normalizeArray(body.knowledgeSyncLogs, normalizeKnowledgeSyncLog).slice(0, 50);
        await replaceByIds(
          logs,
          (log) =>
            transaction.knowledgeSyncLog.upsert({
              where: { id: log.id },
              create: toKnowledgeSyncLogDatabase(log),
              update: toKnowledgeSyncLogDatabase(log),
            }),
          (ids) =>
            transaction.knowledgeSyncLog.deleteMany({
              where: { id: { notIn: ids.length ? ids : ["__docflow_empty_sync_log_set__"] } },
            }),
        );
      }
    });

    return Response.json({ enabled: true });
  } catch (error) {
    console.error("数据库工作区状态保存失败", error);
    return Response.json(
      {
        enabled: true,
        error: error instanceof Error ? error.message : "数据库工作区状态保存失败。",
      },
      { status: 503 },
    );
  }
}
