import TailwindAdvancedEditor, { type EditorChangePayload } from "@/components/tailwind/advanced-editor";
import { DocumentOutline } from "@/components/workspace/document-outline";
import { DocumentTitleInput } from "@/components/workspace/document-title-input";
import { DocumentVersionHistory } from "@/components/workspace/document-version-history";
import { SaveStatus } from "@/components/workspace/save-status";
import type { DocumentVersion } from "@/lib/document-versions";
import type { DocumentItem, DraftDocument, SaveStatusValue } from "@/lib/documents";
import { Button } from "@/components/tailwind/ui/button";
import { ArrowLeft, Maximize2 } from "lucide-react";

interface DocumentEditorPageProps {
  document: DocumentItem | DraftDocument;
  saveStatus: SaveStatusValue;
  onTitleChange: (title: string) => void;
  onContentChange: (documentId: string, payload: EditorChangePayload) => void;
  isDraft?: boolean;
  onBack?: () => void;
  versions?: DocumentVersion[];
  onRestoreVersion?: (versionId: string) => void;
  editorKey?: string;
}

export function DocumentEditorPage({
  document,
  saveStatus,
  onTitleChange,
  onContentChange,
  isDraft = false,
  onBack,
  versions = [],
  onRestoreVersion,
  editorKey,
}: DocumentEditorPageProps) {
  const documentId = document.id;

  return (
    <main className="relative flex h-screen min-w-0 flex-1 bg-background">
      <div className="absolute right-6 top-5 z-20 flex items-center gap-2">
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

      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-8 pb-24 pt-20 sm:px-12">
          {onBack && (
            <Button variant="ghost" size="sm" className="mb-5 gap-2 px-2 text-muted-foreground" onClick={() => onBack()}>
              {isDraft ? <Maximize2 className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
              返回
            </Button>
          )}
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
      <DocumentOutline contentJson={document.contentJson} />
    </main>
  );
}
