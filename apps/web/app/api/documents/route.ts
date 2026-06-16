import {
  createDefaultDocuments,
  normalizeDocument,
  normalizeSortOrder,
  type DocumentItem,
  type DocumentMemberAccess,
} from "@/lib/documents";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";

export const runtime = "nodejs";

const parseDate = (value: string | null | undefined, fallback = new Date()) => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
};

const toDocumentResponse = (document: {
  id: string;
  title: string;
  contentJson: unknown;
  contentText: string;
  tags: string[];
  summary: string;
  parentId: string | null;
  sortOrder: number;
  status: string;
  knowledgeStatus: string;
  ownerId: string | null;
  memberAccess?: DocumentMemberAccess[];
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): DocumentItem =>
  normalizeDocument({
    id: document.id,
    title: document.title,
    contentJson: document.contentJson,
    contentText: document.contentText,
    tags: document.tags,
    summary: document.summary,
    parentId: document.parentId,
    sortOrder: document.sortOrder,
    status: document.status,
    knowledgeStatus: document.knowledgeStatus,
    ownerId: document.ownerId,
    memberAccess: document.memberAccess ?? [],
    deletedAt: document.deletedAt?.toISOString() ?? null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  } as Partial<DocumentItem> & Record<string, unknown>);

const toDatabaseDocument = (document: DocumentItem) => ({
  id: document.id,
  title: document.title.trim() || "Untitled",
  contentJson: document.contentJson,
  contentText: document.contentText ?? "",
  tags: document.tags ?? [],
  summary: document.summary ?? "",
  parentId: document.parentId,
  sortOrder: document.sortOrder,
  status: document.status ?? "draft",
  knowledgeStatus: document.knowledgeStatus ?? "none",
  ownerId: document.ownerId ?? null,
  deletedAt: document.deletedAt ? parseDate(document.deletedAt) : null,
  createdAt: parseDate(document.createdAt),
  updatedAt: parseDate(document.updatedAt),
});

const normalizeDocumentAccess = (document: DocumentItem) =>
  [...new Map((document.memberAccess ?? []).map((access) => [access.memberId, access.role])).entries()]
    .filter(([memberId]) => Boolean(memberId.trim()))
    .map(([memberId, role]) => ({
      documentId: document.id,
      memberId,
      role: role === "editor" ? "editor" : "viewer",
    }));

const attachDocumentAccess = (
  documents: Array<Omit<Parameters<typeof toDocumentResponse>[0], "memberAccess">>,
  accessRows: Array<{ documentId: string; memberId: string; role: string }>,
) => {
  const accessByDocumentId = new Map<string, DocumentMemberAccess[]>();

  for (const access of accessRows) {
    const current = accessByDocumentId.get(access.documentId) ?? [];
    current.push({
      memberId: access.memberId,
      role: access.role === "editor" ? "editor" : "viewer",
    });
    accessByDocumentId.set(access.documentId, current);
  }

  return documents.map((document) =>
    toDocumentResponse({
      ...document,
      memberAccess: accessByDocumentId.get(document.id) ?? [],
    }),
  );
};

const normalizeDocumentsPayload = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .map((item) =>
      item && typeof item === "object"
        ? normalizeDocument(item as Partial<DocumentItem> & Record<string, unknown>)
        : null,
    )
    .filter((item): item is DocumentItem => Boolean(item))
    .slice(0, 500);

const createDatabaseDisabledResponse = () =>
  Response.json(
    {
      enabled: false,
      documents: [],
      message: "未配置 DATABASE_URL，当前继续使用浏览器本地文档存储。",
    },
    { status: 503 },
  );

export async function GET() {
  if (!isDatabaseConfigured()) return createDatabaseDisabledResponse();

  try {
    const prisma = getPrisma();
    let documents = await prisma.document.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    if (!documents.length) {
      const defaultDocuments = normalizeSortOrder(createDefaultDocuments()).map(toDatabaseDocument);

      await prisma.$transaction(
        defaultDocuments.map((document) =>
          prisma.document.create({
            data: document,
          }),
        ),
      );

      documents = await prisma.document.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
    }

    const accessRows = await prisma.documentAccess.findMany({
      where: {
        documentId: {
          in: documents.map((document) => document.id),
        },
      },
    });

    return Response.json({
      enabled: true,
      documents: normalizeSortOrder(attachDocumentAccess(documents, accessRows)),
    });
  } catch (error) {
    console.error("数据库文档加载失败", error);
    return Response.json(
      {
        enabled: true,
        error: error instanceof Error ? error.message : "数据库文档加载失败。",
      },
      { status: 503 },
    );
  }
}

export async function PUT(req: Request) {
  if (!isDatabaseConfigured()) return createDatabaseDisabledResponse();

  const body = await req.json().catch(() => null);
  const documents = normalizeDocumentsPayload((body as Record<string, unknown> | null)?.documents);
  const documentIds = documents.map((document) => document.id);
  const prisma = getPrisma();

  try {
    await prisma.$transaction(async (transaction) => {
      for (const document of documents) {
        const data = toDatabaseDocument(document);

        await transaction.document.upsert({
          where: {
            id: data.id,
          },
          create: data,
          update: data,
        });

        await transaction.documentAccess.deleteMany({
          where: {
            documentId: data.id,
          },
        });

        const accessRows = normalizeDocumentAccess(document);
        if (accessRows.length) {
          await transaction.documentAccess.createMany({
            data: accessRows,
          });
        }
      }

      await transaction.documentAccess.deleteMany({
        where: {
          documentId: {
            notIn: documentIds.length ? documentIds : ["__docflow_empty_document_set__"],
          },
        },
      });

      await transaction.document.deleteMany({
        where: {
          id: {
            notIn: documentIds.length ? documentIds : ["__docflow_empty_document_set__"],
          },
        },
      });
    });

    return Response.json({
      enabled: true,
      count: documents.length,
    });
  } catch (error) {
    console.error("数据库文档保存失败", error);
    return Response.json(
      {
        enabled: true,
        error: error instanceof Error ? error.message : "数据库文档保存失败。",
      },
      { status: 503 },
    );
  }
}
