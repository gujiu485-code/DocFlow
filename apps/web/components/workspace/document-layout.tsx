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

const filterDocumentTree = (documents: DocumentItem[], query: string) => {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return documents;

  const matchedIds = new Set<string>();
  for (const document of documents) {
    const matched =
      document.title.toLowerCase().includes(keyword) || (document.contentText ?? "").toLowerCase().includes(keyword);

    if (matched) {
      matchedIds.add(document.id);
      let parentId = document.parentId;
      while (parentId) {
        matchedIds.add(parentId);
        parentId = documents.find((item) => item.id === parentId)?.parentId ?? null;
      }
    }
  }

  return documents.filter((document) => matchedIds.has(document.id));
};

export function DocumentLayout() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [expandedDocumentIds, setExpandedDocumentIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
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

  const visibleDocuments = useMemo(() => filterDocumentTree(documents, query), [documents, query]);
  const activeDocument = documents.find((document) => document.id === activeDocumentId) ?? null;
  const activeDraftDocument = draftDocument;

  const commitDocuments = (updater: (current: DocumentItem[]) => DocumentItem[]) => {
    setDocuments((current) => {
      const nextDocuments = updater(current);
      setSaveStatus("saving");
      persistDocuments(nextDocuments);
      return nextDocuments;
    });
  };

  const commitDraftDocument = (nextDraftDocument = draftDocument) => {
    if (!nextDraftDocument || !nextDraftDocument.title.trim()) {
      const fallbackId = previousDocumentId && documents.some((document) => document.id === previousDocumentId) ? previousDocumentId : null;
      setDraftDocument(null);
      setActiveDocumentId(fallbackId);
      return null;
    }

    const siblingCount = documents.filter((document) => document.parentId === nextDraftDocument.parentId).length;
    const nextDocument = materializeDraftDocument(nextDraftDocument, siblingCount);

    commitDocuments((current) => [...current, nextDocument]);
    setDraftDocument(null);
    setActiveDocumentId(nextDocument.id);

    if (nextDocument.parentId) {
      setExpandedDocumentIds((current) => new Set(current).add(nextDocument.parentId));
    }

    return nextDocument;
  };

  const createDocument = (parentId: string | null = null) => {
    if (draftDocument?.title.trim()) {
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
      if (draftDocument.title.trim()) {
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

  const updateActiveContent = (payload: EditorChangePayload) => {
    if (draftDocument) {
      const nextDraftDocument = {
        ...draftDocument,
        contentJson: payload.json,
        contentText: payload.markdown,
      };

      if (nextDraftDocument.title.trim()) {
        commitDraftDocument(nextDraftDocument);
      } else {
        setDraftDocument(nextDraftDocument);
      }
      return;
    }

    if (!activeDocumentId) return;

    commitDocuments((current) =>
      current.map((document) =>
        document.id === activeDocumentId
          ? {
              ...document,
              contentJson: payload.json,
              contentText: payload.markdown,
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
        query={query}
        onQueryChange={setQuery}
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
          onContentChange={updateActiveContent}
        />
      ) : activeDocument ? (
        <DocumentEditorPage
          document={activeDocument}
          saveStatus={saveStatus}
          onTitleChange={(title) => renameDocument(activeDocument.id, title)}
          onContentChange={updateActiveContent}
        />
      ) : (
        <main className="h-screen min-w-0 flex-1">
          <EmptyDocumentState onCreateDocument={() => createDocument(null)} />
        </main>
      )}
    </div>
  );
}
