import { createEmptyEditorContent, defaultEditorContent } from "@/lib/content";

export type KnowledgeStatus = "none" | "pending" | "indexed" | "failed" | "outdated";

export type DocumentStatus = "draft" | "reviewing" | "published" | "archived";

export type SaveStatusValue = "saving" | "saved" | "error";

export type DocumentItem = {
  id: string;
  title: string;
  contentJson: any;
  contentText?: string;
  tags?: string[];
  summary?: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  status?: DocumentStatus;
  knowledgeStatus?: KnowledgeStatus;
};

export type DocumentMetaUpdate = Partial<Pick<DocumentItem, "status" | "tags" | "summary" | "knowledgeStatus">>;

export type DraftDocument = {
  id: string;
  parentId: string | null;
  title: string;
  contentJson: any;
  contentText: string;
};

export const DOCUMENTS_STORAGE_KEY = "docflow-documents";
export const ACTIVE_DOCUMENT_STORAGE_KEY = "docflow-active-document";
export const EXPANDED_DOCUMENTS_STORAGE_KEY = "docflow-expanded-documents";

export const createDocumentId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const createDocumentItem = (
  parentId: string | null = null,
  title = "Untitled",
  sortOrder = 0,
  contentJson: any = createEmptyEditorContent(),
): DocumentItem => {
  const now = new Date().toISOString();

  return {
    id: createDocumentId(),
    title,
    contentJson,
    contentText: "",
    tags: [],
    summary: "",
    parentId,
    sortOrder,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    status: "draft",
    knowledgeStatus: "none",
  };
};

export const createDraftDocument = (
  parentId: string | null = null,
  contentJson: any = createEmptyEditorContent(),
  contentText = "",
  title = "",
): DraftDocument => ({
  id: createDocumentId(),
  parentId,
  title,
  contentJson,
  contentText,
});

export const materializeDraftDocument = (draftDocument: DraftDocument, sortOrder: number): DocumentItem => {
  const now = new Date().toISOString();

  return {
    id: draftDocument.id,
    title: draftDocument.title.trim(),
    parentId: draftDocument.parentId,
    contentJson: draftDocument.contentJson,
    contentText: draftDocument.contentText,
    sortOrder,
    knowledgeStatus: "none",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    status: "draft",
  };
};

export const isDraftDocumentEmpty = (draftDocument: DraftDocument | null) =>
  !draftDocument || (!draftDocument.title.trim() && !draftDocument.contentText.trim());

export const createDefaultDocuments = (): DocumentItem[] => {
  const root = createDocumentItem(null, "企业知识库示例文档", 0, defaultEditorContent);
  const child = createDocumentItem(root.id, "产品需求评审记录");
  child.contentJson = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "产品需求评审记录" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "记录需求背景、评审结论、风险点和后续待办。" }],
      },
    ],
  };

  return [root, child];
};

const normalizeDocument = (value: Partial<DocumentItem> & Record<string, unknown>): DocumentItem => {
  const now = new Date().toISOString();

  return {
    id: typeof value.id === "string" ? value.id : createDocumentId(),
    title: typeof value.title === "string" ? value.title : "Untitled",
    contentJson: value.contentJson ?? value.content ?? createEmptyEditorContent(),
    contentText: typeof value.contentText === "string" ? value.contentText : typeof value.markdown === "string" ? value.markdown : "",
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : [],
    summary: typeof value.summary === "string" ? value.summary : "",
    parentId: typeof value.parentId === "string" ? value.parentId : null,
    sortOrder: typeof value.sortOrder === "number" ? value.sortOrder : 0,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now,
    deletedAt: typeof value.deletedAt === "string" ? value.deletedAt : null,
    status:
      value.status === "reviewing" || value.status === "published" || value.status === "archived" ? value.status : "draft",
    knowledgeStatus:
      value.knowledgeStatus === "pending" ||
      value.knowledgeStatus === "indexed" ||
      value.knowledgeStatus === "failed" ||
      value.knowledgeStatus === "outdated"
        ? value.knowledgeStatus
        : "none",
  };
};

export const normalizeSortOrder = (documents: DocumentItem[]) => {
  const parentIds = new Set(documents.map((document) => document.parentId));
  let nextDocuments = documents;

  for (const parentId of parentIds) {
    const siblings = documents
      .filter((document) => document.parentId === parentId)
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

    nextDocuments = nextDocuments.map((document) => {
      const siblingIndex = siblings.findIndex((sibling) => sibling.id === document.id);
      return siblingIndex >= 0 ? { ...document, sortOrder: siblingIndex } : document;
    });
  }

  return nextDocuments;
};

export const loadDocuments = (): DocumentItem[] => {
  if (typeof window === "undefined") return createDefaultDocuments();

  const raw = window.localStorage.getItem(DOCUMENTS_STORAGE_KEY);
  if (!raw) {
    const documents = createDefaultDocuments();
    saveDocuments(documents);
    return documents;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Invalid document data");
    const documents = normalizeSortOrder(parsed.map((item) => normalizeDocument(item)));
    return documents.length ? documents : createDefaultDocuments();
  } catch {
    const documents = createDefaultDocuments();
    saveDocuments(documents);
    return documents;
  }
};

export const saveDocuments = (documents: DocumentItem[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DOCUMENTS_STORAGE_KEY, JSON.stringify(documents));
};

export const loadActiveDocumentId = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_DOCUMENT_STORAGE_KEY);
};

export const saveActiveDocumentId = (documentId: string | null) => {
  if (typeof window === "undefined") return;
  if (!documentId) {
    window.localStorage.removeItem(ACTIVE_DOCUMENT_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(ACTIVE_DOCUMENT_STORAGE_KEY, documentId);
};

export const loadExpandedDocumentIds = () => {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const raw = window.localStorage.getItem(EXPANDED_DOCUMENTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set<string>(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
};

export const saveExpandedDocumentIds = (documentIds: Set<string>) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EXPANDED_DOCUMENTS_STORAGE_KEY, JSON.stringify([...documentIds]));
};

export const getChildDocuments = (documents: DocumentItem[], parentId: string | null) =>
  documents
    .filter((document) => document.parentId === parentId)
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

export const getDescendantDocumentIds = (documents: DocumentItem[], documentId: string): string[] => {
  const childIds = documents.filter((document) => document.parentId === documentId).map((document) => document.id);
  return childIds.flatMap((childId) => [childId, ...getDescendantDocumentIds(documents, childId)]);
};
