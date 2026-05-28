import { Button } from "@/components/tailwind/ui/button";
import { DocumentSearchPanel } from "@/components/workspace/document-search-panel";
import { DocumentTree } from "@/components/workspace/document-tree";
import type { DocumentItem } from "@/lib/documents";
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Plus, Trash2 } from "lucide-react";

interface DocumentSidebarProps {
  documents: DocumentItem[];
  activeDocumentId: string | null;
  expandedDocumentIds: Set<string>;
  onCreateRoot: () => void;
  onCreateChild: (parentId: string) => void;
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
  activeDocumentId,
  expandedDocumentIds,
  onCreateRoot,
  onCreateChild,
  onToggle,
  onSelect,
  onRename,
  onDelete,
  onReorder,
  deletedCount,
  onOpenTrash,
}: DocumentSidebarProps) {
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

  return (
    <aside className="flex h-screen w-72 shrink-0 flex-col border-r bg-[#fbfbfa] dark:bg-background">
      <div className="px-4 py-4">
        <div className="text-sm font-semibold">DocFlow AI</div>
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
          <div className="px-2 py-6 text-sm text-muted-foreground">暂无文档</div>
        )}
      </div>
    </aside>
  );
}
