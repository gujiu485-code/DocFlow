"use client";

import { Command } from "@/components/tailwind/ui/command";

import { useCompletion } from "ai/react";
import { Bot, Send, X } from "lucide-react";
import { addAIHighlight, useEditor } from "novel";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import CrazySpinner from "../ui/icons/crazy-spinner";
import Magic from "../ui/icons/magic";
import { ScrollArea } from "../ui/scroll-area";
import AICompletionCommands from "./ai-completion-command";
import AISelectorCommands from "./ai-selector-commands";

interface AISelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AISelector({ onOpenChange }: AISelectorProps) {
  const { editor } = useEditor();
  const [inputValue, setInputValue] = useState("");

  // useCompletion 来自 Vercel AI SDK，负责请求 /api/generate 并接收流式生成结果。
  // complete(text, { body: { option } }) 会把选中文本和操作类型发送到后端。
  const { completion, complete, isLoading } = useCompletion({
    api: "/api/generate",
    onResponse: (response) => {
      if (response.status === 429) {
        toast.error("今日 AI 请求次数已达上限。");
      }
    },
    onError: (e) => {
      toast.error(e.message);
    },
  });

  const hasCompletion = completion.length > 0;
  const hasInput = inputValue.trim().length > 0;
  const selectedText = useMemo(() => {
    const { from, to, empty } = editor.state.selection;
    if (empty) return "";
    return editor.state.doc.textBetween(from, to, "\n").trim();
  }, [editor.state.selection.from, editor.state.selection.to]);
  const scopeLabel = selectedText ? `已选中 ${selectedText.length} 字` : "未选中文本，将处理全文";
  const previewText = selectedText || editor.getText().trim();

  const getTargetMarkdown = () => {
    const { empty } = editor.state.selection;

    if (empty) {
      return editor.storage.markdown.getMarkdown();
    }

    const slice = editor.state.selection.content();
    return editor.storage.markdown.serializer.serialize(slice.content);
  };

  const handleCustomSubmit = () => {
    if (!hasInput) {
      toast.error("请输入要让 AI 执行的指令");
      return;
    }

    if (completion) {
      complete(completion, {
        body: { option: "zap", command: inputValue },
      }).then(() => setInputValue(""));
      return;
    }

    complete(getTargetMarkdown(), {
      body: { option: "zap", command: inputValue },
    }).then(() => setInputValue(""));
  };

  return (
    <Command className="w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border bg-background shadow-xl">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-purple-100 text-purple-600 dark:bg-purple-950">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">DocFlow AI</div>
            <div className="text-xs text-muted-foreground">{scopeLabel}</div>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onOpenChange(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="border-b bg-muted/20">
        {hasCompletion ? (
          <ScrollArea className="max-h-[220px]">
            <div className="whitespace-pre-wrap p-3 text-sm leading-6">
              {completion}
            </div>
          </ScrollArea>
        ) : isLoading ? (
          <div className="flex h-14 items-center px-3 text-sm font-medium text-purple-500">
            <Magic className="mr-2 h-4 w-4 shrink-0" />
            AI 正在分析
            <div className="ml-2 mt-1">
              <CrazySpinner />
            </div>
          </div>
        ) : (
          <div className="space-y-2 px-3 py-2">
            <div className="text-xs text-muted-foreground">选择快捷操作，或输入自定义指令。</div>
            {previewText && (
              <div className="line-clamp-2 rounded-md bg-background px-2 py-1.5 text-xs leading-5 text-muted-foreground">
                {previewText}
              </div>
            )}
          </div>
        )}
      </div>

      {hasCompletion ? (
        <AICompletionCommands
          onDiscard={() => {
            editor.chain().unsetHighlight().focus().run();
            onOpenChange(false);
          }}
          onApply={() => {
            editor.chain().unsetHighlight().focus().run();
            onOpenChange(false);
          }}
          completion={completion}
        />
      ) : (
        <AISelectorCommands onSelect={(value, option) => complete(value, { body: { option } })} />
      )}

      <div className="border-t p-2">
        <div className="flex gap-2">
          <input
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onFocus={() => addAIHighlight(editor)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleCustomSubmit();
              }
            }}
            className="h-9 flex-1 rounded-md border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-purple-500/30"
            placeholder={hasCompletion ? "继续处理结果..." : "输入指令，回车发送"}
          />
          <Button
            size="icon"
            className="h-9 w-9 bg-purple-500 hover:bg-purple-900"
            disabled={isLoading || !hasInput}
            onClick={handleCustomSubmit}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Command>
  );
}
