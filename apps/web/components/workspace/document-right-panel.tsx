"use client";

import { DocumentOutline } from "@/components/workspace/document-outline";
import { DocumentPropertiesPanel } from "@/components/workspace/document-properties-panel";
import type { DocumentItem, DocumentMetaUpdate } from "@/lib/documents";
import { cn } from "@/lib/utils";
import { FileSliders, ListTree } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

type RightPanelTab = "properties" | "outline";

interface DocumentRightPanelProps {
  document?: DocumentItem;
  contentJson: any;
  wordCount: number;
  onMetaChange?: (updates: DocumentMetaUpdate) => void;
  onSyncKnowledge?: () => void;
}

export function DocumentRightPanel({
  document,
  contentJson,
  wordCount,
  onMetaChange,
  onSyncKnowledge,
}: DocumentRightPanelProps) {
  const [activeTab, setActiveTab] = useState<RightPanelTab>("properties");

  return (
    <aside className="hidden h-screen w-72 shrink-0 flex-col border-l bg-[#fbfbfa] xl:flex dark:bg-background">
      <div className="border-b px-4 pb-3 pt-4">
        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted/70 p-1">
          <PanelTabButton active={activeTab === "properties"} onClick={() => setActiveTab("properties")}>
            <FileSliders className="h-3.5 w-3.5" />
            属性
          </PanelTabButton>
          <PanelTabButton active={activeTab === "outline"} onClick={() => setActiveTab("outline")}>
            <ListTree className="h-3.5 w-3.5" />
            大纲
          </PanelTabButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {activeTab === "properties" ? (
          <DocumentPropertiesPanel
            document={document}
            wordCount={wordCount}
            onChange={onMetaChange}
            onSyncKnowledge={onSyncKnowledge}
          />
        ) : (
          <DocumentOutline contentJson={contentJson} />
        )}
      </div>
    </aside>
  );
}

function PanelTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-7 items-center justify-center gap-1.5 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
        active && "bg-background text-foreground shadow-sm",
      )}
    >
      {children}
    </button>
  );
}
