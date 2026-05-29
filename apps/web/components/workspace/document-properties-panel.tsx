import { Button } from "@/components/tailwind/ui/button";
import { DocumentMetaInfo } from "@/components/workspace/document-meta-info";
import { DocumentStatusSelect } from "@/components/workspace/document-status-select";
import { DocumentTagInput } from "@/components/workspace/document-tag-input";
import { KnowledgeStatusBadge } from "@/components/workspace/knowledge-status-badge";
import type { DocumentItem, DocumentMetaUpdate } from "@/lib/documents";
import { DatabaseZap, FileSliders } from "lucide-react";
import type { ReactNode } from "react";

interface DocumentPropertiesPanelProps {
  document?: DocumentItem;
  wordCount: number;
  onChange?: (updates: DocumentMetaUpdate) => void;
  onSyncKnowledge?: () => void;
}

export function DocumentPropertiesPanel({ document, wordCount, onChange, onSyncKnowledge }: DocumentPropertiesPanelProps) {
  if (!document) {
    return (
      <div className="rounded-md border border-dashed px-3 py-8 text-center">
        <FileSliders className="mx-auto h-5 w-5 text-muted-foreground" />
        <div className="mt-2 text-sm font-medium">保存后可编辑属性</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">新建草稿转为真实文档后，会在这里显示状态、标签和摘要。</p>
      </div>
    );
  }

  const knowledgeStatus = document.knowledgeStatus ?? "none";

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="text-xs font-medium text-muted-foreground">基础属性</div>
        <PropertyRow label="状态">
          <DocumentStatusSelect value={document.status ?? "draft"} onChange={(status) => onChange?.({ status })} />
        </PropertyRow>
        <PropertyRow label="标签">
          <DocumentTagInput tags={document.tags ?? []} onChange={(tags) => onChange?.({ tags })} />
        </PropertyRow>
      </section>

      <section className="space-y-3">
        <div className="text-xs font-medium text-muted-foreground">摘要</div>
        <textarea
          value={document.summary ?? ""}
          onChange={(event) => onChange?.({ summary: event.target.value })}
          className="min-h-28 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-foreground"
          placeholder="填写这篇文档的简要说明，后续可以接入 AI 自动生成。"
        />
      </section>

      <section className="space-y-3">
        <div className="text-xs font-medium text-muted-foreground">知识库</div>
        <div className="rounded-md border bg-background p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">同步状态</span>
            <KnowledgeStatusBadge status={knowledgeStatus} />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-8 w-full gap-2"
            disabled={knowledgeStatus === "pending"}
            onClick={onSyncKnowledge}
          >
            <DatabaseZap className="h-3.5 w-3.5" />
            {knowledgeStatus === "pending" ? "同步中..." : "同步到知识库"}
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="text-xs font-medium text-muted-foreground">信息</div>
        <DocumentMetaInfo document={document} wordCount={wordCount} />
      </section>
    </div>
  );
}

function PropertyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[56px_minmax(0,1fr)] items-start gap-3">
      <div className="pt-1.5 text-xs text-muted-foreground">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
