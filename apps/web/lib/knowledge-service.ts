import "server-only";

import { buildDocumentKnowledgeIndex, searchKnowledgeChunks, type KnowledgeIndexStore } from "@/lib/knowledge-base";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import {
  deleteDocumentsFromLangChainRag,
  getLangChainRagStatus,
  retrieveFromLangChainRag,
  upsertDocumentsToLangChainRag,
} from "@/lib/rag/langchain-engine";
import type { RagIndexResult, RagIndexableDocument, RagProvider } from "@/lib/rag/types";
import type { KnowledgeSyncLogStatus } from "@/lib/knowledge-sync";
import { randomUUID } from "node:crypto";

export type KnowledgeContextSource = "local" | Exclude<RagProvider, "local">;

export type KnowledgeContextChunk = {
  id: string;
  documentId: string;
  documentTitle: string;
  headingPath: string[];
  text: string;
  score?: number;
  snippet?: string;
};

const parseDate = (value: string | null | undefined, fallback = new Date()) => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
};

const createEmptyKnowledgeIndex = (): KnowledgeIndexStore => ({
  documents: [],
  chunks: [],
  updatedAt: new Date().toISOString(),
});

const toKnowledgeDocumentResponse = (document: {
  documentId: string;
  title: string;
  contentHash: string;
  chunkCount: number;
  indexedAt: Date;
}): KnowledgeIndexStore["documents"][number] => ({
  documentId: document.documentId,
  title: document.title,
  contentHash: document.contentHash,
  chunkCount: document.chunkCount,
  indexedAt: document.indexedAt.toISOString(),
});

const toKnowledgeChunkResponse = (chunk: {
  id: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  text: string;
  headingPath: string[];
  contentHash: string;
  createdAt: Date;
  updatedAt: Date;
}): KnowledgeIndexStore["chunks"][number] => ({
  id: chunk.id,
  documentId: chunk.documentId,
  documentTitle: chunk.documentTitle,
  chunkIndex: chunk.chunkIndex,
  text: chunk.text,
  headingPath: chunk.headingPath,
  contentHash: chunk.contentHash,
  createdAt: chunk.createdAt.toISOString(),
  updatedAt: chunk.updatedAt.toISOString(),
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

const createKnowledgeSyncLogDatabase = (
  document: Pick<RagIndexableDocument, "id" | "title">,
  status: KnowledgeSyncLogStatus,
  message: string,
) => ({
  id: randomUUID(),
  documentId: document.id,
  documentTitle: document.title.trim() || "无标题",
  status,
  message,
  createdAt: new Date(),
});

const normalizeDocumentIds = (documentIds: string[]) => [
  ...new Set(documentIds.map((id) => id.trim()).filter(Boolean)),
];

const createKnowledgeStateDisabledResponse = () => ({
  enabled: false,
  ragStatus: getLangChainRagStatus(),
  knowledgeIndex: createEmptyKnowledgeIndex(),
  knowledgeSyncLogs: [],
  message: "未配置 DATABASE_URL，后端知识库摘要与检索无法持久化。",
});

const createRagErrorResult = (provider: RagProvider, message: string): RagIndexResult => ({
  enabled: false,
  provider,
  indexedDocuments: 0,
  indexedChunks: 0,
  message,
});

export const getKnowledgeState = async () => {
  if (!isDatabaseConfigured()) return createKnowledgeStateDisabledResponse();

  const prisma = getPrisma();
  const [knowledgeDocuments, knowledgeSyncLogs] = await Promise.all([
    prisma.knowledgeIndexedDocument.findMany({
      orderBy: [{ indexedAt: "desc" }],
    }),
    prisma.knowledgeSyncLog.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 50,
    }),
  ]);

  return {
    enabled: true,
    ragStatus: getLangChainRagStatus(),
    knowledgeIndex: {
      documents: knowledgeDocuments.map(toKnowledgeDocumentResponse),
      chunks: [],
      updatedAt: new Date().toISOString(),
    },
    knowledgeSyncLogs: knowledgeSyncLogs.map((log) => ({
      id: log.id,
      documentId: log.documentId,
      documentTitle: log.documentTitle,
      status: log.status,
      message: log.message,
      createdAt: log.createdAt.toISOString(),
    })),
  };
};

export const upsertDocumentsToKnowledgeBase = async (documents: RagIndexableDocument[]): Promise<RagIndexResult> => {
  const ragStatus = getLangChainRagStatus();
  const databaseEnabled = isDatabaseConfigured();

  if (!databaseEnabled && !ragStatus.enabled) {
    return {
      enabled: false,
      provider: ragStatus.provider,
      indexedDocuments: 0,
      indexedChunks: 0,
      message: "未配置 DATABASE_URL，且 RAG 向量后端未启用，无法执行后端知识库入库。",
    };
  }

  const payloads = documents.map((document) => ({
    source: document,
    payload: buildDocumentKnowledgeIndex({
      ...document,
      sortOrder: 0,
      status: "draft",
      knowledgeStatus: "indexed",
      createdAt: document.updatedAt,
      deletedAt: null,
    }),
  }));
  const indexablePayloads = payloads.filter(({ payload }) => payload.chunks.length > 0);
  const emptyDocuments = payloads.filter(({ payload }) => payload.chunks.length === 0).map(({ source }) => source);

  if (!indexablePayloads.length) {
    if (databaseEnabled) {
      const prisma = getPrisma();
      await prisma.$transaction(async (transaction) => {
        for (const document of emptyDocuments) {
          await transaction.document.updateMany({
            where: { id: document.id },
            data: { knowledgeStatus: "failed" },
          });
          await transaction.knowledgeSyncLog.create({
            data: createKnowledgeSyncLogDatabase(document, "failed", "同步失败：没有可入库的标题或正文内容。"),
          });
        }
      });
    }

    return {
      enabled: databaseEnabled || ragStatus.enabled,
      provider: ragStatus.provider,
      indexedDocuments: 0,
      indexedChunks: 0,
      message: "没有可入库的标题或正文内容。",
    };
  }

  if (databaseEnabled) {
    const prisma = getPrisma();
    await prisma.$transaction(async (transaction) => {
      for (const { source, payload } of indexablePayloads) {
        await transaction.knowledgeChunk.deleteMany({
          where: { documentId: source.id },
        });
        await transaction.knowledgeIndexedDocument.upsert({
          where: { documentId: source.id },
          create: toKnowledgeDocumentDatabase(payload.document),
          update: toKnowledgeDocumentDatabase(payload.document),
        });
        await transaction.knowledgeChunk.createMany({
          data: payload.chunks.map(toKnowledgeChunkDatabase),
        });
        await transaction.document.updateMany({
          where: { id: source.id },
          data: { knowledgeStatus: "indexed" },
        });
        await transaction.knowledgeSyncLog.create({
          data: createKnowledgeSyncLogDatabase(
            source,
            "success",
            `后端知识库入库成功：生成 ${payload.chunks.length} 个知识片段。`,
          ),
        });
      }

      for (const document of emptyDocuments) {
        await transaction.document.updateMany({
          where: { id: document.id },
          data: { knowledgeStatus: "failed" },
        });
        await transaction.knowledgeSyncLog.create({
          data: createKnowledgeSyncLogDatabase(document, "failed", "同步失败：没有可入库的标题或正文内容。"),
        });
      }
    });
  }

  let ragResult: RagIndexResult = createRagErrorResult(ragStatus.provider, ragStatus.message);
  if (ragStatus.enabled) {
    try {
      ragResult = await upsertDocumentsToLangChainRag(indexablePayloads.map(({ source }) => source));
    } catch (error) {
      ragResult = createRagErrorResult(
        ragStatus.provider,
        error instanceof Error ? `向量库同步失败：${error.message}` : "向量库同步失败。",
      );
    }
  }

  const indexedDocuments = indexablePayloads.length;
  const indexedChunks = indexablePayloads.reduce((total, { payload }) => total + payload.chunks.length, 0);
  const databaseMessage = databaseEnabled
    ? `已写入后端数据库：${indexedDocuments} 篇文档，${indexedChunks} 个知识片段。`
    : "未配置 DATABASE_URL，仅尝试写入向量后端。";
  const skippedMessage = emptyDocuments.length ? `跳过 ${emptyDocuments.length} 篇空文档。` : "";

  return {
    enabled: databaseEnabled || ragResult.enabled,
    provider: ragResult.provider,
    indexedDocuments,
    indexedChunks,
    message: [databaseMessage, ragResult.message, skippedMessage].filter(Boolean).join(" "),
  };
};

export const deleteDocumentsFromKnowledgeBase = async (documentIds: string[]): Promise<RagIndexResult> => {
  const normalizedDocumentIds = normalizeDocumentIds(documentIds);
  const ragStatus = getLangChainRagStatus();

  if (!normalizedDocumentIds.length) {
    return {
      enabled: isDatabaseConfigured() || ragStatus.enabled,
      provider: ragStatus.provider,
      indexedDocuments: 0,
      indexedChunks: 0,
      message: "没有需要删除的文档。",
    };
  }

  if (isDatabaseConfigured()) {
    const prisma = getPrisma();
    await prisma.$transaction(async (transaction) => {
      await transaction.knowledgeChunk.deleteMany({
        where: { documentId: { in: normalizedDocumentIds } },
      });
      await transaction.knowledgeIndexedDocument.deleteMany({
        where: { documentId: { in: normalizedDocumentIds } },
      });
      await transaction.document.updateMany({
        where: { id: { in: normalizedDocumentIds } },
        data: { knowledgeStatus: "none" },
      });
    });
  }

  let ragResult: RagIndexResult = createRagErrorResult(ragStatus.provider, ragStatus.message);
  if (ragStatus.enabled) {
    try {
      ragResult = await deleteDocumentsFromLangChainRag(normalizedDocumentIds);
    } catch (error) {
      ragResult = createRagErrorResult(
        ragStatus.provider,
        error instanceof Error ? `向量库删除失败：${error.message}` : "向量库删除失败。",
      );
    }
  }

  const databaseMessage = isDatabaseConfigured()
    ? `已从后端数据库删除 ${normalizedDocumentIds.length} 篇文档的知识片段。`
    : "未配置 DATABASE_URL，仅尝试删除向量后端。";

  return {
    enabled: isDatabaseConfigured() || ragResult.enabled,
    provider: ragResult.provider,
    indexedDocuments: normalizedDocumentIds.length,
    indexedChunks: 0,
    message: [databaseMessage, ragResult.message].filter(Boolean).join(" "),
  };
};

export const searchKnowledgeBase = async ({
  keyword,
  documentIds,
  limit = 20,
}: {
  keyword: string;
  documentIds?: string[];
  limit?: number;
}) => {
  const normalizedDocumentIds = documentIds ? normalizeDocumentIds(documentIds) : [];
  const nextLimit = Math.max(1, Math.min(limit, 50));

  if (!keyword.trim()) return [];

  if (!isDatabaseConfigured()) {
    const vectorResults = await retrieveFromLangChainRag(
      keyword,
      nextLimit,
      normalizedDocumentIds.length ? normalizedDocumentIds : undefined,
    );
    return vectorResults.map((chunk) => ({
      ...chunk,
      contentHash: "",
      chunkIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      snippet: chunk.text.slice(0, 160),
    }));
  }

  const prisma = getPrisma();
  const chunks = await prisma.knowledgeChunk.findMany({
    where: normalizedDocumentIds.length
      ? {
          documentId: {
            in: normalizedDocumentIds,
          },
        }
      : undefined,
    orderBy: [{ updatedAt: "desc" }, { chunkIndex: "asc" }],
    take: 1000,
  });

  return searchKnowledgeChunks(chunks.map(toKnowledgeChunkResponse), keyword).slice(0, nextLimit);
};

export const retrieveKnowledgeContext = async (
  question: string,
  documentIds: string[],
  limit?: number,
): Promise<{ chunks: KnowledgeContextChunk[]; source: KnowledgeContextSource }> => {
  const normalizedDocumentIds = normalizeDocumentIds(documentIds);
  if (!question.trim() || !normalizedDocumentIds.length) return { chunks: [], source: "local" };

  try {
    const vectorChunks = await retrieveFromLangChainRag(question, limit, normalizedDocumentIds);
    if (vectorChunks.length) {
      return {
        source: vectorChunks[0]?.provider ?? "local",
        chunks: vectorChunks.map((chunk) => ({
          id: chunk.id,
          documentId: chunk.documentId,
          documentTitle: chunk.documentTitle,
          headingPath: chunk.headingPath,
          text: chunk.text,
          score: chunk.score,
          snippet: chunk.text.slice(0, 300),
        })),
      };
    }
  } catch (error) {
    console.error("LangChain RAG 检索失败，降级使用后端数据库片段。", error);
  }

  const databaseChunks = await searchKnowledgeBase({
    keyword: question,
    documentIds: normalizedDocumentIds,
    limit: limit ?? 6,
  });

  return {
    source: "local",
    chunks: databaseChunks.map((chunk) => ({
      id: chunk.id,
      documentId: chunk.documentId,
      documentTitle: chunk.documentTitle,
      headingPath: chunk.headingPath,
      text: chunk.text,
      score: chunk.score,
      snippet: chunk.snippet,
    })),
  };
};
