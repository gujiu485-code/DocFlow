"use client";

import type { EditorChangePayload } from "@/components/tailwind/advanced-editor";
import { DocumentEditorPage } from "@/components/workspace/document-editor-page";
import { DocumentSidebar } from "@/components/workspace/document-sidebar";
import { DocumentTemplatePicker } from "@/components/workspace/document-template-picker";
import { DocumentTrashDialog } from "@/components/workspace/document-trash-dialog";
import { KnowledgeSyncCenter } from "@/components/workspace/knowledge-sync-center";
import { WorkspaceDashboard } from "@/components/workspace/workspace-dashboard";
import {
  defaultDocumentFilter,
  filterDocumentsForTree,
  getDirectFilteredDocuments,
  isDefaultDocumentFilter,
  type DocumentFilter,
} from "@/lib/document-filters";
import {
  getDocumentTemplate,
  getTemplateBodyContent,
  getTemplateBodyText,
  getTemplateDraftTitle,
} from "@/lib/document-templates";
import {
  addDocumentVersion,
  cloneDocumentContent,
  getDocumentVersions,
  loadDocumentVersions,
  removeDocumentVersions,
  saveDocumentVersions,
  type DocumentVersion,
} from "@/lib/document-versions";
import {
  buildDocumentKnowledgeIndex,
  createEmptyKnowledgeIndex,
  loadKnowledgeIndex,
  removeDocumentsFromKnowledgeIndex,
  saveKnowledgeIndex,
  upsertDocumentKnowledgeIndex,
  type KnowledgeIndexStore,
} from "@/lib/knowledge-base";
import {
  appendKnowledgeSyncLog,
  createKnowledgeSyncLog,
  getKnowledgeSyncCandidates,
  loadKnowledgeSyncLogs,
  saveKnowledgeSyncLogs,
  type KnowledgeSyncLog,
} from "@/lib/knowledge-sync";
import {
  createDraftDocument,
  getDescendantDocumentIds,
  getChildDocuments,
  loadDocuments,
  loadExpandedDocumentIds,
  isDraftDocumentEmpty,
  saveActiveDocumentId,
  saveDocuments,
  saveExpandedDocumentIds,
  materializeDraftDocument,
  type DocumentMetaUpdate,
  type DraftDocument,
  type DocumentItem,
  type SaveStatusValue,
} from "@/lib/documents";
import { useDebouncedCallback } from "use-debounce";
import { useEffect, useMemo, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";

export function DocumentLayout() {
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [expandedDocumentIds, setExpandedDocumentIds] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<SaveStatusValue>("saved");
  const [draftDocument, setDraftDocument] = useState<DraftDocument | null>(null);
  const [previousDocumentId, setPreviousDocumentId] = useState<string | null>(null);
  const [templateParentId, setTemplateParentId] = useState<string | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [syncCenterOpen, setSyncCenterOpen] = useState(false);
  const [documentVersions, setDocumentVersions] = useState<DocumentVersion[]>([]);
  const [knowledgeSyncLogs, setKnowledgeSyncLogs] = useState<KnowledgeSyncLog[]>([]);
  const [knowledgeIndex, setKnowledgeIndex] = useState<KnowledgeIndexStore>(() => createEmptyKnowledgeIndex());
  const [editorRevisionByDocumentId, setEditorRevisionByDocumentId] = useState<Record<string, number>>({});
  const [documentFilter, setDocumentFilter] = useState<DocumentFilter>(defaultDocumentFilter);

  const persistDocuments = useDebouncedCallback((nextDocuments: DocumentItem[]) => {
    try {
      saveDocuments(nextDocuments);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, 500);

  const commitDocumentVersions = (updater: (current: DocumentVersion[]) => DocumentVersion[]) => {
    setDocumentVersions((current) => {
      const nextVersions = updater(current);
      saveDocumentVersions(nextVersions);
      return nextVersions;
    });
  };

  const commitKnowledgeSyncLogs = (updater: (current: KnowledgeSyncLog[]) => KnowledgeSyncLog[]) => {
    setKnowledgeSyncLogs((current) => {
      const nextLogs = updater(current);
      saveKnowledgeSyncLogs(nextLogs);
      return nextLogs;
    });
  };

  const commitKnowledgeIndex = (updater: (current: KnowledgeIndexStore) => KnowledgeIndexStore) => {
    setKnowledgeIndex((current) => {
      const nextIndex = updater(current);
      saveKnowledgeIndex(nextIndex);
      return nextIndex;
    });
  };

  const deleteDocumentsFromRemoteKnowledge = (documentIds: Iterable<string>) => {
    const ids = [...documentIds].filter(Boolean);
    if (!ids.length) return;

    void fetch("/api/knowledge/index", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documentIds: ids,
      }),
    }).catch((error) => {
      console.error("后端知识库删除失败", error);
    });
  };

  const snapshotDocument = (document: DocumentItem | undefined, options?: { force?: boolean }) => {
    if (!document) return;
    commitDocumentVersions((current) => addDocumentVersion(current, document, options));
  };

  useEffect(() => {
    const loadedDocuments = loadDocuments();
    const loadedExpandedIds = loadExpandedDocumentIds();

    setDocuments(loadedDocuments);
    setActiveDocumentId(null);
    setExpandedDocumentIds(loadedExpandedIds);
    setDocumentVersions(loadDocumentVersions());
    setKnowledgeSyncLogs(loadKnowledgeSyncLogs());
    setKnowledgeIndex(loadKnowledgeIndex());
    setWorkspaceReady(true);
  }, []);

  useEffect(() => {
    saveActiveDocumentId(activeDocumentId);
  }, [activeDocumentId]);

  useEffect(() => {
    saveExpandedDocumentIds(expandedDocumentIds);
  }, [expandedDocumentIds]);

  const visibleDocuments = useMemo(() => documents.filter((document) => !document.deletedAt), [documents]);
  const directFilteredDocuments = useMemo(
    () => getDirectFilteredDocuments(visibleDocuments, documentFilter),
    [visibleDocuments, documentFilter],
  );
  const sidebarDocuments = useMemo(
    () => filterDocumentsForTree(visibleDocuments, documentFilter),
    [visibleDocuments, documentFilter],
  );
  const deletedDocuments = useMemo(() => documents.filter((document) => document.deletedAt), [documents]);
  const activeDocument = documents.find((document) => document.id === activeDocumentId && !document.deletedAt) ?? null;
  const activeDocumentVersions = activeDocument ? getDocumentVersions(documentVersions, activeDocument.id) : [];
  const activeDraftDocument = draftDocument;
  const activeDraftDocumentId = activeDraftDocument?.id ?? null;

  useEffect(() => {
    if (draftDocument || isDefaultDocumentFilter(documentFilter)) return;

    const activeDocumentInFilter = activeDocumentId ? sidebarDocuments.some((document) => document.id === activeDocumentId) : false;
    if (activeDocumentInFilter) return;

    setActiveDocumentId(directFilteredDocuments[0]?.id ?? sidebarDocuments[0]?.id ?? null);
  }, [activeDocumentId, directFilteredDocuments, documentFilter, draftDocument, sidebarDocuments]);

  useEffect(() => {
    if (isDefaultDocumentFilter(documentFilter)) return;

    const documentById = new Map(visibleDocuments.map((document) => [document.id, document]));
    const ancestorIds = new Set<string>();

    for (const document of directFilteredDocuments) {
      let parentId = document.parentId;
      while (parentId) {
        const parent = documentById.get(parentId);
        if (!parent) break;
        ancestorIds.add(parent.id);
        parentId = parent.parentId;
      }
    }

    if (!ancestorIds.size) return;

    setExpandedDocumentIds((current) => {
      const next = new Set(current);
      let changed = false;
      for (const id of ancestorIds) {
        if (next.has(id)) continue;
        next.add(id);
        changed = true;
      }
      return changed ? next : current;
    });
  }, [directFilteredDocuments, documentFilter, visibleDocuments]);

  const commitDocuments = (updater: (current: DocumentItem[]) => DocumentItem[], options?: { immediate?: boolean }) => {
    setDocuments((current) => {
      const nextDocuments = updater(current);
      setSaveStatus("saving");
      if (options?.immediate) {
        try {
          saveDocuments(nextDocuments);
          setSaveStatus("saved");
        } catch {
          setSaveStatus("error");
        }
      } else {
        persistDocuments(nextDocuments);
      }
      return nextDocuments;
    });
  };

  const commitDraftDocumentValue = (nextDraftDocument: DraftDocument | null) => {
    // 新建草稿只有在标题和正文都为空时才丢弃；正文有内容时，即使没有标题也要保留。
    if (isDraftDocumentEmpty(nextDraftDocument)) {
      const fallbackId =
        previousDocumentId && documents.some((document) => document.id === previousDocumentId && !document.deletedAt)
          ? previousDocumentId
          : null;
      setDraftDocument(null);
      setActiveDocumentId(fallbackId);
      return null;
    }

    const siblingCount = documents.filter((document) => document.parentId === nextDraftDocument.parentId && !document.deletedAt).length;
    const nextDocument = materializeDraftDocument(nextDraftDocument, siblingCount);

    commitDocuments((current) => [...current, nextDocument], { immediate: true });
    setDraftDocument(null);
    setActiveDocumentId(nextDocument.id);

    if (nextDocument.parentId) {
      setExpandedDocumentIds((current) => new Set(current).add(nextDocument.parentId));
    }

    return nextDocument;
  };

  const commitDraftDocument = () => commitDraftDocumentValue(draftDocument);

  const openTemplatePicker = (parentId: string | null = null) => {
    if (draftDocument && !isDraftDocumentEmpty(draftDocument)) {
      commitDraftDocument();
    }

    setDocumentFilter(defaultDocumentFilter);
    setTemplateParentId(parentId);
    setTemplatePickerOpen(true);
  };

  const createDocument = (templateId: string) => {
    const parentId = templateParentId;
    const template = getDocumentTemplate(templateId);

    setPreviousDocumentId(activeDocumentId);
    setActiveDocumentId(null);
    setDraftDocument(
      createDraftDocument(parentId, getTemplateBodyContent(template), getTemplateBodyText(template), getTemplateDraftTitle(template)),
    );
    setTemplatePickerOpen(false);

    if (parentId) {
      setExpandedDocumentIds((current) => new Set(current).add(parentId));
    }
  };

  const openDashboard = () => {
    if (draftDocument && !isDraftDocumentEmpty(draftDocument)) {
      commitDraftDocument();
    } else if (draftDocument) {
      setDraftDocument(null);
    }

    setActiveDocumentId(null);
  };

  const applyDashboardFilter = (filter: DocumentFilter) => {
    setDocumentFilter(filter);
    setDraftDocument(null);

    const nextDocuments = getDirectFilteredDocuments(visibleDocuments, filter);
    setActiveDocumentId(nextDocuments[0]?.id ?? null);
  };

  const selectDocument = (documentId: string) => {
    if (!documents.some((document) => document.id === documentId && !document.deletedAt)) return;

    if (draftDocument) {
      if (!isDraftDocumentEmpty(draftDocument)) {
        commitDraftDocument();
      } else {
        setDraftDocument(null);
      }
    }

    setActiveDocumentId(documentId);
  };

  const renameDocument = (documentId: string, title: string) => {
    snapshotDocument(documents.find((document) => document.id === documentId && !document.deletedAt));

    commitDocuments((current) =>
      current.map((document) =>
        document.id === documentId && !document.deletedAt
          ? { ...document, title: title.trim() || "Untitled", updatedAt: new Date().toISOString() }
          : document,
      ),
    );
  };

  const deleteDocument = (documentId: string) => {
    const idsToDelete = new Set([documentId, ...getDescendantDocumentIds(documents, documentId)]);
    const nextActiveDocumentId = idsToDelete.has(activeDocumentId ?? "")
      ? documents.find((document) => !document.deletedAt && !idsToDelete.has(document.id))?.id ?? null
      : activeDocumentId;
    const now = new Date().toISOString();

    commitDocuments(
      (current) =>
        current.map((document) =>
          idsToDelete.has(document.id) ? { ...document, deletedAt: now, updatedAt: now } : document,
        ),
      { immediate: true },
    );
    commitKnowledgeIndex((current) => removeDocumentsFromKnowledgeIndex(current, idsToDelete));
    deleteDocumentsFromRemoteKnowledge(idsToDelete);
    setActiveDocumentId(nextActiveDocumentId);
    setExpandedDocumentIds((current) => {
      const next = new Set(current);
      for (const id of idsToDelete) next.delete(id);
      return next;
    });
  };

  const restoreDocument = (documentId: string) => {
    const idsToRestore = new Set([documentId, ...getDescendantDocumentIds(documents, documentId)]);
    const now = new Date().toISOString();

    commitDocuments(
      (current) =>
        current.map((document) => {
          if (!idsToRestore.has(document.id)) return document;

          const parentDocument = document.parentId ? current.find((item) => item.id === document.parentId) : null;
          const parentStillDeleted = parentDocument?.deletedAt && !idsToRestore.has(parentDocument.id);

          return {
            ...document,
            parentId: parentStillDeleted ? null : document.parentId,
            deletedAt: null,
            updatedAt: now,
          };
        }),
      { immediate: true },
    );
    setActiveDocumentId(documentId);
    setTrashOpen(false);
  };

  const permanentlyDeleteDocument = (documentId: string) => {
    const idsToDelete = new Set([documentId, ...getDescendantDocumentIds(documents, documentId)]);
    const nextActiveDocumentId = idsToDelete.has(activeDocumentId ?? "")
      ? documents.find((document) => !document.deletedAt && !idsToDelete.has(document.id))?.id ?? null
      : activeDocumentId;

    commitDocuments((current) => current.filter((document) => !idsToDelete.has(document.id)), { immediate: true });
    commitDocumentVersions((current) => removeDocumentVersions(current, idsToDelete));
    commitKnowledgeIndex((current) => removeDocumentsFromKnowledgeIndex(current, idsToDelete));
    deleteDocumentsFromRemoteKnowledge(idsToDelete);
    setActiveDocumentId(nextActiveDocumentId);
  };

  const toggleDocument = (documentId: string) => {
    setExpandedDocumentIds((current) => {
      const next = new Set(current);
      if (next.has(documentId)) next.delete(documentId);
      else next.add(documentId);
      return next;
    });
  };

  const reorderDocuments = (activeId: string, overId: string) => {
    const activeDocument = visibleDocuments.find((document) => document.id === activeId);
    const overDocument = visibleDocuments.find((document) => document.id === overId);

    if (!activeDocument || !overDocument || activeDocument.parentId !== overDocument.parentId) return;

    const siblings = getChildDocuments(visibleDocuments, activeDocument.parentId);
    const oldIndex = siblings.findIndex((document) => document.id === activeId);
    const newIndex = siblings.findIndex((document) => document.id === overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const reorderedSiblings = arrayMove(siblings, oldIndex, newIndex);
    const sortOrderById = new Map(reorderedSiblings.map((document, index) => [document.id, index]));

    commitDocuments((current) =>
      current.map((document) =>
        sortOrderById.has(document.id)
          ? {
              ...document,
              sortOrder: sortOrderById.get(document.id) ?? document.sortOrder,
              updatedAt: new Date().toISOString(),
            }
          : document,
      ),
    );
  };

  const updateDocumentContent = (sourceDocumentId: string, payload: EditorChangePayload) => {
    // 内容更新必须按来源 documentId 写入，避免切换页面或防抖回调把内容写到当前选中文档。
    if (sourceDocumentId === activeDraftDocumentId) {
      setDraftDocument((current) =>
        current && sourceDocumentId === current.id
          ? {
              ...current,
              contentJson: payload.json,
              contentText: payload.text,
            }
          : current,
      );
      return;
    }

    snapshotDocument(documents.find((document) => document.id === sourceDocumentId && !document.deletedAt));

    commitDocuments((current) =>
      current.map((document) =>
        document.id === sourceDocumentId && !document.deletedAt
          ? {
              ...document,
              contentJson: payload.json,
              contentText: payload.text,
              updatedAt: new Date().toISOString(),
              knowledgeStatus: document.knowledgeStatus === "indexed" ? "outdated" : document.knowledgeStatus ?? "none",
            }
          : document,
      ),
    );
  };

  const updateDocumentMeta = (documentId: string, updates: DocumentMetaUpdate) => {
    const now = new Date().toISOString();

    commitDocuments((current) =>
      current.map((document) => {
        if (document.id !== documentId || document.deletedAt) return document;

        const shouldMarkKnowledgeOutdated =
          !("knowledgeStatus" in updates) &&
          document.knowledgeStatus === "indexed" &&
          ("summary" in updates || "tags" in updates);

        return {
          ...document,
          ...updates,
          knowledgeStatus: shouldMarkKnowledgeOutdated ? "outdated" : updates.knowledgeStatus ?? document.knowledgeStatus,
          updatedAt: now,
        };
      }),
    );
  };

  const setDocumentKnowledgeStatus = (documentId: string, knowledgeStatus: DocumentItem["knowledgeStatus"]) => {
    const now = new Date().toISOString();

    commitDocuments(
      (current) =>
        current.map((document) =>
          document.id === documentId && !document.deletedAt ? { ...document, knowledgeStatus, updatedAt: now } : document,
        ),
      { immediate: true },
    );
  };

  const syncDocumentToKnowledge = (documentId: string) => {
    const document = visibleDocuments.find((item) => item.id === documentId);
    if (!document || document.knowledgeStatus === "pending") return;

    setDocumentKnowledgeStatus(documentId, "pending");
    commitKnowledgeSyncLogs((current) =>
      appendKnowledgeSyncLog(current, createKnowledgeSyncLog(document, "pending", "文档已加入知识库同步队列。")),
    );

    // 先保留本地索引用于离线兜底，同时把文档同步到后端 LangChain RAG 引擎。
    window.setTimeout(() => {
      void (async () => {
        const payload = buildDocumentKnowledgeIndex(document);

        if (payload.chunks.length === 0) {
          setDocumentKnowledgeStatus(documentId, "failed");
          commitKnowledgeSyncLogs((current) =>
            appendKnowledgeSyncLog(current, createKnowledgeSyncLog(document, "failed", "同步失败：没有可入库的标题或正文内容。")),
          );
          return;
        }

        commitKnowledgeIndex((current) => upsertDocumentKnowledgeIndex(current, payload));

        try {
          const response = await fetch("/api/knowledge/index", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              documents: [document],
            }),
          });
          const remoteResult = await response.json().catch(() => null);

          if (!response.ok) {
            throw new Error(typeof remoteResult?.error === "string" ? remoteResult.error : "后端 RAG 入库失败。");
          }

          const remoteMessage =
            typeof remoteResult?.message === "string"
              ? remoteResult.message
              : "后端 RAG 未返回同步详情。";

          setDocumentKnowledgeStatus(documentId, "indexed");
          commitKnowledgeSyncLogs((current) =>
            appendKnowledgeSyncLog(
              current,
              createKnowledgeSyncLog(
                document,
                "success",
                `同步成功：本地生成 ${payload.chunks.length} 个知识片段。${remoteMessage}`,
              ),
            ),
          );
        } catch (error) {
          setDocumentKnowledgeStatus(documentId, "failed");
          commitKnowledgeSyncLogs((current) =>
            appendKnowledgeSyncLog(
              current,
              createKnowledgeSyncLog(
                document,
                "failed",
                error instanceof Error ? error.message : "同步失败：后端 RAG 入库异常。",
              ),
            ),
          );
        }
      })();
    }, 900);
  };

  const syncAllKnowledgeDocuments = () => {
    getKnowledgeSyncCandidates(visibleDocuments, knowledgeIndex).forEach((document, index) => {
      window.setTimeout(() => syncDocumentToKnowledge(document.id), index * 150);
    });
  };

  const generateDocumentMetadata = async (documentId: string) => {
    const document = documents.find((item) => item.id === documentId && !item.deletedAt);
    if (!document) throw new Error("当前文档不存在。");

    const title = document.title.trim();
    const contentText = document.contentText?.trim() ?? "";
    if (!title && !contentText) throw new Error("文档标题和正文都为空，无法生成摘要与标签。");

    const response = await fetch("/api/document/metadata", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        contentText,
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error ?? "AI 生成失败，请稍后重试。");
    }

    const summary = typeof payload?.summary === "string" ? payload.summary : "";
    const tags = Array.isArray(payload?.tags) ? payload.tags.filter((tag: unknown): tag is string => typeof tag === "string") : [];
    if (!summary && tags.length === 0) throw new Error("AI 没有返回可用的摘要或标签。");

    updateDocumentMeta(documentId, {
      summary,
      tags,
    });
  };

  const restoreDocumentVersion = (versionId: string) => {
    const version = documentVersions.find((item) => item.id === versionId);
    if (!version) return;

    snapshotDocument(documents.find((document) => document.id === version.documentId && !document.deletedAt), { force: true });

    commitDocuments(
      (current) =>
        current.map((document) =>
          document.id === version.documentId && !document.deletedAt
            ? {
                ...document,
                title: version.title,
                contentJson: cloneDocumentContent(version.contentJson),
                contentText: version.contentText,
                updatedAt: new Date().toISOString(),
                knowledgeStatus: document.knowledgeStatus === "indexed" ? "outdated" : document.knowledgeStatus ?? "none",
              }
            : document,
        ),
      { immediate: true },
    );
    setEditorRevisionByDocumentId((current) => ({
      ...current,
      [version.documentId]: (current[version.documentId] ?? 0) + 1,
    }));
    setActiveDocumentId(version.documentId);
  };

  const updateDraftTitle = (title: string) => {
    setDraftDocument((current) => (current ? { ...current, title } : current));
  };

  if (!workspaceReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="text-sm text-muted-foreground">正在打开 DocFlow AI...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DocumentSidebar
        documents={sidebarDocuments}
        allDocuments={visibleDocuments}
        knowledgeIndex={knowledgeIndex}
        activeDocumentId={activeDocumentId}
        workspaceActive={!activeDocument && !activeDraftDocument}
        expandedDocumentIds={expandedDocumentIds}
        documentFilter={documentFilter}
        filteredDocumentCount={directFilteredDocuments.length}
        onCreateRoot={() => openTemplatePicker(null)}
        onCreateChild={openTemplatePicker}
        onOpenDashboard={openDashboard}
        onOpenSyncCenter={() => setSyncCenterOpen(true)}
        onFilterChange={setDocumentFilter}
        onToggle={toggleDocument}
        onSelect={selectDocument}
        onRename={renameDocument}
        onDelete={deleteDocument}
        onReorder={reorderDocuments}
        deletedCount={deletedDocuments.length}
        onOpenTrash={() => setTrashOpen(true)}
      />

      {activeDraftDocument ? (
        <DocumentEditorPage
          document={activeDraftDocument}
          saveStatus={saveStatus}
          isDraft
          onTitleChange={updateDraftTitle}
          onContentChange={updateDocumentContent}
        />
      ) : activeDocument ? (
        <DocumentEditorPage
          document={activeDocument}
          saveStatus={saveStatus}
          onTitleChange={(title) => renameDocument(activeDocument.id, title)}
          onContentChange={updateDocumentContent}
          versions={activeDocumentVersions}
          onRestoreVersion={restoreDocumentVersion}
          onMetaChange={updateDocumentMeta}
          onSyncKnowledge={syncDocumentToKnowledge}
          onOpenSyncCenter={() => setSyncCenterOpen(true)}
          onGenerateMetadata={generateDocumentMetadata}
          editorKey={String(editorRevisionByDocumentId[activeDocument.id] ?? 0)}
        />
      ) : (
        <WorkspaceDashboard
          documents={visibleDocuments}
          onCreateDocument={() => openTemplatePicker(null)}
          onOpenDocument={selectDocument}
          onApplyFilter={applyDashboardFilter}
          onOpenSyncCenter={() => setSyncCenterOpen(true)}
          onSyncAllKnowledge={syncAllKnowledgeDocuments}
        />
      )}
      <DocumentTemplatePicker open={templatePickerOpen} onOpenChange={setTemplatePickerOpen} onSelect={createDocument} />
      <KnowledgeSyncCenter
        open={syncCenterOpen}
        documents={visibleDocuments}
        knowledgeIndex={knowledgeIndex}
        logs={knowledgeSyncLogs}
        onOpenChange={setSyncCenterOpen}
        onOpenDocument={(documentId) => {
          setSyncCenterOpen(false);
          selectDocument(documentId);
        }}
        onSyncDocument={syncDocumentToKnowledge}
        onSyncAll={syncAllKnowledgeDocuments}
      />
      <DocumentTrashDialog
        open={trashOpen}
        documents={deletedDocuments}
        onOpenChange={setTrashOpen}
        onRestore={restoreDocument}
        onPermanentlyDelete={permanentlyDeleteDocument}
      />
    </div>
  );
}
