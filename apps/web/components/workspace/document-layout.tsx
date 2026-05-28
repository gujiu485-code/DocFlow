"use client";

import type { EditorChangePayload } from "@/components/tailwind/advanced-editor";
import { DocumentEditorPage } from "@/components/workspace/document-editor-page";
import { DocumentSidebar } from "@/components/workspace/document-sidebar";
import { EmptyDocumentState } from "@/components/workspace/empty-document-state";
import {
  createDraftDocument,
  getDescendantDocumentIds,
  getChildDocuments,
  loadActiveDocumentId,
  loadDocuments,
  loadExpandedDocumentIds,
  isDraftDocumentEmpty,
  saveActiveDocumentId,
  saveDocuments,
  saveExpandedDocumentIds,
  materializeDraftDocument,
  type DraftDocument,
  type DocumentItem,
  type SaveStatusValue,
} from "@/lib/documents";
import { useDebouncedCallback } from "use-debounce";
import { useEffect, useMemo, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";

export function DocumentLayout() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [expandedDocumentIds, setExpandedDocumentIds] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<SaveStatusValue>("saved");
  const [draftDocument, setDraftDocument] = useState<DraftDocument | null>(null);
  const [previousDocumentId, setPreviousDocumentId] = useState<string | null>(null);

  const persistDocuments = useDebouncedCallback((nextDocuments: DocumentItem[]) => {
    try {
      saveDocuments(nextDocuments);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, 500);

  useEffect(() => {
    const loadedDocuments = loadDocuments();
    const loadedActiveId = loadActiveDocumentId();
    const loadedExpandedIds = loadExpandedDocumentIds();
    const nextActiveId = loadedDocuments.some((document) => document.id === loadedActiveId)
      ? loadedActiveId
      : loadedDocuments[0]?.id ?? null;

    setDocuments(loadedDocuments);
    setActiveDocumentId(nextActiveId);
    setExpandedDocumentIds(loadedExpandedIds);
  }, []);

  useEffect(() => {
    saveActiveDocumentId(activeDocumentId);
  }, [activeDocumentId]);

  useEffect(() => {
    saveExpandedDocumentIds(expandedDocumentIds);
  }, [expandedDocumentIds]);

  const visibleDocuments = useMemo(() => documents, [documents]);
  const activeDocument = documents.find((document) => document.id === activeDocumentId) ?? null;
  const activeDraftDocument = draftDocument;
  const activeDraftDocumentId = activeDraftDocument?.id ?? null;

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
      const fallbackId = previousDocumentId && documents.some((document) => document.id === previousDocumentId) ? previousDocumentId : null;
      setDraftDocument(null);
      setActiveDocumentId(fallbackId);
      return null;
    }

    const siblingCount = documents.filter((document) => document.parentId === nextDraftDocument.parentId).length;
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

  const createDocument = (parentId: string | null = null) => {
    if (draftDocument && !isDraftDocumentEmpty(draftDocument)) {
      commitDraftDocument();
    }

    setPreviousDocumentId(activeDocumentId);
    setActiveDocumentId(null);
    setDraftDocument(createDraftDocument(parentId));

    if (parentId) {
      setExpandedDocumentIds((current) => new Set(current).add(parentId));
    }
  };

  const selectDocument = (documentId: string) => {
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
    commitDocuments((current) =>
      current.map((document) =>
        document.id === documentId ? { ...document, title: title.trim() || "Untitled", updatedAt: new Date().toISOString() } : document,
      ),
    );
  };

  const deleteDocument = (documentId: string) => {
    const idsToDelete = new Set([documentId, ...getDescendantDocumentIds(documents, documentId)]);
    const nextActiveDocumentId = idsToDelete.has(activeDocumentId ?? "")
      ? documents.find((document) => !idsToDelete.has(document.id))?.id ?? null
      : activeDocumentId;

    commitDocuments((current) => current.filter((document) => !idsToDelete.has(document.id)));
    setActiveDocumentId(nextActiveDocumentId);
    setExpandedDocumentIds((current) => {
      const next = new Set(current);
      for (const id of idsToDelete) next.delete(id);
      return next;
    });
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
    const activeDocument = documents.find((document) => document.id === activeId);
    const overDocument = documents.find((document) => document.id === overId);

    if (!activeDocument || !overDocument || activeDocument.parentId !== overDocument.parentId) return;

    const siblings = getChildDocuments(documents, activeDocument.parentId);
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

    commitDocuments((current) =>
      current.map((document) =>
        document.id === sourceDocumentId
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

  const updateDraftTitle = (title: string) => {
    setDraftDocument((current) => (current ? { ...current, title } : current));
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DocumentSidebar
        documents={visibleDocuments}
        activeDocumentId={activeDocumentId}
        expandedDocumentIds={expandedDocumentIds}
        onCreateRoot={() => createDocument(null)}
        onCreateChild={createDocument}
        onToggle={toggleDocument}
        onSelect={selectDocument}
        onRename={renameDocument}
        onDelete={deleteDocument}
        onReorder={reorderDocuments}
      />

      {activeDraftDocument ? (
        <DocumentEditorPage
          document={activeDraftDocument}
          saveStatus={saveStatus}
          isDraft
          onBack={commitDraftDocument}
          onTitleChange={updateDraftTitle}
          onContentChange={updateDocumentContent}
        />
      ) : activeDocument ? (
        <DocumentEditorPage
          document={activeDocument}
          saveStatus={saveStatus}
          onTitleChange={(title) => renameDocument(activeDocument.id, title)}
          onContentChange={updateDocumentContent}
        />
      ) : (
        <main className="h-screen min-w-0 flex-1">
          <EmptyDocumentState onCreateDocument={() => createDocument(null)} />
        </main>
      )}
    </div>
  );
}
