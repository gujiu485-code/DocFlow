import TailwindAdvancedEditor, { type EditorChangePayload } from "@/components/tailwind/advanced-editor";
import { DocumentTitleInput } from "@/components/workspace/document-title-input";
import { SaveStatus } from "@/components/workspace/save-status";
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
}

export function DocumentEditorPage({
  document,
  saveStatus,
  onTitleChange,
  onContentChange,
  isDraft = false,
  onBack,
}: DocumentEditorPageProps) {
  const documentId = document.id;

  return (
    <main className="relative h-screen min-w-0 flex-1 overflow-y-auto bg-background">
      <div className="absolute right-6 top-5 z-20">
        {!isDraft && <SaveStatus status={saveStatus} />}
      </div>

      <div className="mx-auto max-w-screen-lg px-12 pb-24 pt-20">
        {onBack && (
          <Button variant="ghost" size="sm" className="mb-6 gap-2 px-2 text-muted-foreground" onClick={() => onBack()}>
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
        />
        <div className="mt-8">
          <TailwindAdvancedEditor
            documentId={documentId}
            content={"contentJson" in document ? document.contentJson : undefined}
            showMeta={false}
            syncUpdates={isDraft}
            onChange={(payload) => onContentChange(documentId, payload)}
          />
        </div>
      </div>
    </main>
  );
}
