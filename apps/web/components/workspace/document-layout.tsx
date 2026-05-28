"use client";

import type { EditorChangePayload } from "@/components/tailwind/advanced-editor";
import { DocumentEditorPage } from "@/components/workspace/document-editor-page";
import { DocumentSidebar } from "@/components/workspace/document-sidebar";
import { DocumentTemplatePicker } from "@/components/workspace/document-template-picker";
import { DocumentTrashDialog } from "@/components/workspace/document-trash-dialog";
import { EmptyDocumentState } from "@/components/workspace/empty-document-state";
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
  const [templateParentId, setTemplateParentId] = useState<string | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [documentVersions, setDocumentVersions] = useState<DocumentVersion[]>([]);
  const [editorRevisionByDocumentId, setEditorRevisionByDocumentId] = useState<Record<string, number>>({});

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

  const snapshotDocument = (document: DocumentItem | undefined, options?: { force?: boolean }) => {
    if (!document) return;
    commitDocumentVersions((current) => addDocumentVersion(current, document, options));
  };

  useEffect(() => {
    const loadedDocuments = loadDocuments();
    const loadedActiveId = loadActiveDocumentId();
    const loadedExpandedIds = loadExpandedDocumentIds();
    const availableDocuments = loadedDocuments.filter((document) => !document.deletedAt);
    const nextActiveId = availableDocuments.some((document) => document.id === loadedActiveId)
      ? loadedActiveId
      : availableDocuments[0]?.id ?? null;

    setDocuments(loadedDocuments);
    setActiveDocumentId(nextActiveId);
    setExpandedDocumentIds(loadedExpandedIds);
    setDocumentVersions(loadDocumentVersions());
  }, []);

  useEffect(() => {
    saveActiveDocumentId(activeDocumentId);
  }, [activeDocumentId]);

  useEffect(() => {
    saveExpandedDocumentIds(expandedDocumentIds);
  }, [expandedDocumentIds]);

  const visibleDocuments = useMemo(() => documents.filter((document) => !document.deletedAt), [documents]);
  const deletedDocuments = useMemo(() => documents.filter((document) => document.deletedAt), [documents]);
  const activeDocument = documents.find((document) => document.id === activeDocumentId && !document.deletedAt) ?? null;
  const activeDocumentVersions = activeDocument ? getDocumentVersions(documentVersions, activeDocument.id) : [];
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

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DocumentSidebar
        documents={visibleDocuments}
        activeDocumentId={activeDocumentId}
        expandedDocumentIds={expandedDocumentIds}
        onCreateRoot={() => openTemplatePicker(null)}
        onCreateChild={openTemplatePicker}
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
          versions={activeDocumentVersions}
          onRestoreVersion={restoreDocumentVersion}
          editorKey={String(editorRevisionByDocumentId[activeDocument.id] ?? 0)}
        />
      ) : (
        <main className="h-screen min-w-0 flex-1">
          <EmptyDocumentState onCreateDocument={() => openTemplatePicker(null)} />
        </main>
      )}
      <DocumentTemplatePicker open={templatePickerOpen} onOpenChange={setTemplatePickerOpen} onSelect={createDocument} />
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
