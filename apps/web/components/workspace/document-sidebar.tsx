import { Button } from "@/components/tailwind/ui/button";
import { DocumentFilterPanel } from "@/components/workspace/document-filter-panel";
import { DocumentSearchPanel } from "@/components/workspace/document-search-panel";
import { DocumentTree } from "@/components/workspace/document-tree";
import { KnowledgeAssistant } from "@/components/workspace/knowledge-assistant";
import type { DocumentFilter } from "@/lib/document-filters";
import type { DocumentItem } from "@/lib/documents";
import type { KnowledgeIndexStore } from "@/lib/knowledge-base";
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { LayoutDashboard, PanelLeftClose, PanelLeftOpen, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

interface DocumentSidebarProps {
  documents: DocumentItem[];
  allDocuments: DocumentItem[];
  knowledgeIndex: KnowledgeIndexStore;
  activeDocumentId: string | null;
  expandedDocumentIds: Set<string>;
  documentFilter: DocumentFilter;
  filteredDocumentCount: number;
  onCreateRoot: () => void;
  onCreateChild: (parentId: string) => void;
  onOpenDashboard: () => void;
  onOpenSyncCenter: () => void;
  onFilterChange: (filter: DocumentFilter) => void;
  onToggle: (documentId: string) => void;
  onSelect: (documentId: string) => void;
  onRename: (documentId: string, title: string) => void;
  onDelete: (documentId: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  deletedCount: number;
  onOpenTrash: () => void;
}

export function DocumentSidebar({
  documents,
  allDocuments,
  knowledgeIndex,
  activeDocumentId,
  expandedDocumentIds,
  documentFilter,
  filteredDocumentCount,
  onCreateRoot,
  onCreateChild,
  onOpenDashboard,
  onOpenSyncCenter,
  onFilterChange,
  onToggle,
  onSelect,
  onRename,
  onDelete,
  onReorder,
  deletedCount,
  onOpenTrash,
}: DocumentSidebarProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    onReorder(String(active.id), String(over.id));
  };

  if (sidebarCollapsed) {
    return (
      <aside className="flex h-screen w-12 shrink-0 flex-col items-center border-r bg-[#fbfbfa] py-4 dark:bg-background">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => setSidebarCollapsed(false)}
          title="展开文档栏"
        >
          <PanelLeftOpen className="h-4 w-4" />
          <span className="sr-only">展开文档栏</span>
        </button>

        <div className="mt-4 grid gap-2">
          <SidebarRailButton title="工作台" onClick={onOpenDashboard}>
            <LayoutDashboard className="h-4 w-4" />
          </SidebarRailButton>
          <SidebarRailButton title="新建页面" onClick={onCreateRoot}>
            <Plus className="h-4 w-4" />
          </SidebarRailButton>
          <SidebarRailButton title={deletedCount ? `垃圾桶 (${deletedCount})` : "垃圾桶"} onClick={onOpenTrash}>
            <Trash2 className="h-4 w-4" />
          </SidebarRailButton>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-screen w-72 shrink-0 flex-col border-r bg-[#fbfbfa] dark:bg-background">
      <div className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <button type="button" className="min-w-0 text-left text-sm font-semibold hover:text-foreground" onClick={onOpenDashboard}>
            DocFlow AI
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground"
            onClick={() => setSidebarCollapsed(true)}
            title="收起文档栏"
          >
            <PanelLeftClose className="h-4 w-4" />
            <span className="sr-only">收起文档栏</span>
          </Button>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">企业知识库</div>
      </div>

      <div className="px-3 pb-3">
        <Button variant="ghost" className="h-8 w-full justify-start gap-2 px-2 text-muted-foreground" onClick={onCreateRoot}>
          <Plus className="h-4 w-4" />
          新建页面
        </Button>
        <Button variant="ghost" className="h-8 w-full justify-start gap-2 px-2 text-muted-foreground" onClick={onOpenTrash}>
          <Trash2 className="h-4 w-4" />
          垃圾桶{deletedCount ? ` (${deletedCount})` : ""}
        </Button>
        <div className="mt-2">
          <DocumentSearchPanel documents={documents} activeDocumentId={activeDocumentId} onSelect={onSelect} />
        </div>
        <div className="mt-2">
          <DocumentFilterPanel
            documents={allDocuments}
            filter={documentFilter}
            filteredCount={filteredDocumentCount}
            onFilterChange={onFilterChange}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {documents.length ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <DocumentTree
              documents={documents}
              activeDocumentId={activeDocumentId}
              expandedDocumentIds={expandedDocumentIds}
              onToggle={onToggle}
              onSelect={onSelect}
              onCreateChild={onCreateChild}
              onRename={onRename}
              onDelete={onDelete}
            />
          </DndContext>
        ) : (
          <div className="px-2 py-6 text-sm text-muted-foreground">
            {allDocuments.length ? "没有符合筛选条件的文档" : "暂无文档"}
          </div>
        )}
      </div>

      <div className="border-t px-3 py-3">
        <KnowledgeAssistant
          knowledgeIndex={knowledgeIndex}
          onOpenDocument={onSelect}
          onOpenSyncCenter={onOpenSyncCenter}
        />
      </div>
    </aside>
  );
}

function SidebarRailButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      onClick={onClick}
      title={title}
    >
      {children}
      <span className="sr-only">{title}</span>
    </button>
  );
}
