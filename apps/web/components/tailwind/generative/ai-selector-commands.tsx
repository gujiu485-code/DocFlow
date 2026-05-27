import { FileText, HelpCircle, Languages, ListChecks, RefreshCcwDot, ShieldAlert, Sparkles } from "lucide-react";
import { useEditor } from "novel";
import { CommandGroup, CommandItem, CommandSeparator } from "../ui/command";

const options = [
  {
    value: "summary",
    label: "总结文档",
    description: "提炼核心结论、关键要点和建议",
    icon: FileText,
  },
  {
    value: "todos",
    label: "提取待办",
    description: "整理负责人、事项、时间和优先级",
    icon: ListChecks,
  },
  {
    value: "faq",
    label: "生成 FAQ",
    description: "面向团队成员生成常见问答",
    icon: HelpCircle,
  },
  {
    value: "formal",
    label: "优化为正式表达",
    description: "改成更清晰克制的企业文档语气",
    icon: RefreshCcwDot,
  },
  {
    value: "risks",
    label: "检查风险点",
    description: "发现责任、时间、流程和合规风险",
    icon: ShieldAlert,
  },
  {
    value: "translate",
    label: "翻译成英文",
    description: "保留结构，生成商务英文版本",
    icon: Languages,
  },
];

interface AISelectorCommandsProps {
  onSelect: (value: string, option: string) => void;
}

const AISelectorCommands = ({ onSelect }: AISelectorCommandsProps) => {
  const { editor } = useEditor();

  const getTargetMarkdown = () => {
    const { empty } = editor.state.selection;

    if (empty) {
      return editor.storage.markdown.getMarkdown();
    }

    const slice = editor.state.selection.content();
    return editor.storage.markdown.serializer.serialize(slice.content);
  };

  return (
    <>
      <CommandGroup heading="快捷操作" className="px-2 py-2">
        {options.map((option) => (
          <CommandItem
            onSelect={() => {
              onSelect(getTargetMarkdown(), option.value);
            }}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
            key={option.value}
            value={option.value}
          >
            <option.icon className="h-4 w-4 text-purple-500" />
            <span className="text-sm">{option.label}</span>
          </CommandItem>
        ))}
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading="续写" className="px-2 py-2">
        <CommandItem
          onSelect={() => {
            onSelect(getTargetMarkdown(), "continue");
          }}
          value="continue"
          className="gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
        >
          <Sparkles className="h-4 w-4 text-purple-500" />
          <span className="text-sm">基于上下文续写</span>
        </CommandItem>
      </CommandGroup>
    </>
  );
};

export default AISelectorCommands;
