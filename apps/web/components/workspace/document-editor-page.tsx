import TailwindAdvancedEditor, { type EditorChangePayload } from "@/components/tailwind/advanced-editor";
import { DocumentExportMenu } from "@/components/workspace/document-export-menu";
import { DocumentRightPanel } from "@/components/workspace/document-right-panel";
import { DocumentTitleInput } from "@/components/workspace/document-title-input";
import { DocumentVersionHistory } from "@/components/workspace/document-version-history";
import { SaveStatus } from "@/components/workspace/save-status";
import type { DocumentVersion } from "@/lib/document-versions";
import type { DocumentItem, DocumentMetaUpdate, DraftDocument, SaveStatusValue } from "@/lib/documents";

interface DocumentEditorPageProps {
  document: DocumentItem | DraftDocument;
  saveStatus: SaveStatusValue;
  onTitleChange: (title: string) => void;
  onContentChange: (documentId: string, payload: EditorChangePayload) => void;
  isDraft?: boolean;
  versions?: DocumentVersion[];
  onRestoreVersion?: (versionId: string) => void;
  onMetaChange?: (documentId: string, updates: DocumentMetaUpdate) => void;
  onSyncKnowledge?: (documentId: string) => void;
  onOpenSyncCenter?: () => void;
  onGenerateMetadata?: (documentId: string) => Promise<void>;
  editorKey?: string;
}

export function DocumentEditorPage({
  document,
  saveStatus,
  onTitleChange,
  onContentChange,
  isDraft = false,
  versions = [],
  onRestoreVersion,
  onMetaChange,
  onSyncKnowledge,
  onOpenSyncCenter,
  onGenerateMetadata,
  editorKey,
}: DocumentEditorPageProps) {
  const documentId = document.id;
  const persistedDocument = isDraft ? undefined : (document as DocumentItem);
  const wordCount = document.contentText?.trim().length ?? 0;
  const titleLabel = document.title.trim() || "无标题";

  return (
    <main className="flex h-screen min-w-0 flex-1 bg-background">
      <div className="relative min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{isDraft ? "正在新建页面" : titleLabel}</div>
              <div className="truncate text-xs text-muted-foreground">
                {isDraft ? "输入标题或正文后会保存为文档，可从左侧工作台退出" : "文档编辑"}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <DocumentExportMenu document={document} />
              {!isDraft && (
                <>
                  {onRestoreVersion && (
                    <DocumentVersionHistory
                      documentTitle={document.title}
                      versions={versions}
                      onRestore={onRestoreVersion}
                    />
                  )}
                  <SaveStatus status={saveStatus} />
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-[760px] px-8 pb-24 pt-10 sm:px-12">
          <DocumentTitleInput
            title={document.title}
            onChange={onTitleChange}
            onDraftChange={isDraft ? onTitleChange : undefined}
            autoFocus={isDraft}
            commitEmptyTitle={!isDraft}
            placeholder="无标题"
            className="text-[40px] font-bold leading-tight"
          />
          <div className="mt-3">
            <TailwindAdvancedEditor
              documentId={documentId}
              content={"contentJson" in document ? document.contentJson : undefined}
              showMeta={false}
              syncUpdates={isDraft}
              editorKey={editorKey}
              appearance="document"
              onChange={(payload) => onContentChange(documentId, payload)}
            />
          </div>
        </div>
      </div>
      <DocumentRightPanel
        document={persistedDocument}
        contentJson={document.contentJson}
        wordCount={wordCount}
        onMetaChange={onMetaChange ? (updates) => onMetaChange(documentId, updates) : undefined}
        onSyncKnowledge={onSyncKnowledge ? () => onSyncKnowledge(documentId) : undefined}
        onOpenSyncCenter={onOpenSyncCenter}
        onGenerateMetadata={onGenerateMetadata ? () => onGenerateMetadata(documentId) : undefined}
      />
    </main>
  );
}
