import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Bold,
  Code,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Minus,
  Plus,
  Quote,
  Trash2,
} from "lucide-react";
import { EditorContent, type Editor } from "@tiptap/react";
import { cn } from "@/lib/utils";
import type { Note } from "@/types";

interface WorkspaceEditorProps {
  activeNote: Note | null;
  titleDraft: string;
  isLoading: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;
  editor: Editor | null;
  onTitleChange: (value: string) => void;
  onTitleBlur: () => void;
  onMoveToTrash: () => void;
  onCreateNote: () => void;
}

interface ToolbarButton {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}

function buildToolbarButtons(editor: Editor): ToolbarButton[] {
  return [
    {
      label: "H1",
      icon: <Heading1 className="w-4 h-4" />,
      active: editor.isActive("heading", { level: 1 }),
      onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: "H2",
      icon: <Heading2 className="w-4 h-4" />,
      active: editor.isActive("heading", { level: 2 }),
      onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "H3",
      icon: <Heading3 className="w-4 h-4" />,
      active: editor.isActive("heading", { level: 3 }),
      onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: "Bold",
      icon: <Bold className="w-4 h-4" />,
      active: editor.isActive("bold"),
      onClick: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: "Italic",
      icon: <Italic className="w-4 h-4" />,
      active: editor.isActive("italic"),
      onClick: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "Bullet",
      icon: <List className="w-4 h-4" />,
      active: editor.isActive("bulletList"),
      onClick: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numbered",
      icon: <ListOrdered className="w-4 h-4" />,
      active: editor.isActive("orderedList"),
      onClick: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Code",
      icon: <Code className="w-4 h-4" />,
      active: editor.isActive("codeBlock"),
      onClick: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: "Quote",
      icon: <Quote className="w-4 h-4" />,
      active: editor.isActive("blockquote"),
      onClick: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "Divider",
      icon: <Minus className="w-4 h-4" />,
      active: false,
      onClick: () => editor.chain().focus().setHorizontalRule().run(),
    },
  ];
}

export function WorkspaceEditor({
  activeNote,
  titleDraft,
  isLoading,
  isSaving,
  lastSavedAt,
  editor,
  onTitleChange,
  onTitleBlur,
  onMoveToTrash,
  onCreateNote,
}: WorkspaceEditorProps) {
  if (!activeNote) {
    return (
      <div className="h-full border border-[#262626] bg-[#0A0A0A] flex items-center justify-center">
        <div className="flex flex-col items-center text-center p-16">
          <div className="w-16 h-16 border border-[#262626] flex items-center justify-center mb-8">
            <FileText className="w-8 h-8 text-[#737373]" />
          </div>
          <h3 className="text-4xl font-bold tracking-tighter mb-4 text-[#FAFAFA]">
            VOID.
          </h3>
          <p className="text-sm font-bold tracking-[0.2em] text-[#737373] uppercase mb-8">
            NO NOTE SELECTED
          </p>
          <motion.button
            whileHover="hover"
            initial="initial"
            onClick={onCreateNote}
            className="group relative inline-flex items-center gap-2 overflow-hidden bg-transparent px-6 py-4 text-xs font-bold tracking-[0.2em] text-[#FAFAFA] uppercase"
          >
            <span className="relative z-10 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              CREATE NOTE
            </span>
            <motion.div
              variants={{
                initial: { scaleX: 0, originX: 0 },
                hover: { scaleX: 1, originX: 0 },
              }}
              transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
              className="absolute inset-x-0 bottom-0 h-[2px] bg-[#FF3D00]"
            />
            <motion.div
              variants={{
                initial: { scaleX: 1, originX: 1 },
                hover: { scaleX: 0, originX: 1 },
              }}
              transition={{ duration: 0.4, ease: [0.25, 0, 0, 1] }}
              className="absolute inset-x-0 bottom-0 h-[1px] bg-[#262626]"
            />
          </motion.button>
        </div>
      </div>
    );
  }

  const toolbarButtons = editor ? buildToolbarButtons(editor) : [];

  return (
    <div className="h-full border border-[#262626] bg-[#0A0A0A] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#262626] flex items-center justify-between gap-4">
        <input
          value={titleDraft}
          onChange={(event) => onTitleChange(event.target.value)}
          onBlur={onTitleBlur}
          className="flex-1 bg-transparent border-none outline-none text-2xl font-bold tracking-tighter text-[#FAFAFA] placeholder:text-[#262626] uppercase"
          placeholder="NOTE TITLE"
        />

        <div className="shrink-0 flex items-center gap-4">
          <span className="text-[10px] font-bold tracking-widest text-[#737373] uppercase border border-[#262626] px-3 py-1">
            {activeNote.subject || "GENERAL"}
          </span>
          <span className="text-[10px] font-bold tracking-widest text-[#737373] uppercase border border-[#262626] px-3 py-1">
            {activeNote.sourceType}
          </span>
          <span className="text-[10px] font-bold tracking-widest uppercase min-w-[80px] text-right">
            {isSaving ? (
              <span className="text-[#FF3D00]">SAVING...</span>
            ) : lastSavedAt ? (
              <span className="text-[#FAFAFA]">SAVED ✓</span>
            ) : (
              <span className="text-[#737373]">NOT SAVED</span>
            )}
          </span>
          <button
            onClick={onMoveToTrash}
            className="flex items-center gap-2 px-4 py-2 border border-[#262626] text-[10px] font-bold tracking-widest text-[#737373] uppercase hover:text-[#FF3D00] hover:border-[#FF3D00] transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            TRASH
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 flex-wrap px-6 py-3 border-b border-[#262626] bg-[#0A0A0A]">
        {toolbarButtons.map((button) => (
          <button
            key={button.label}
            type="button"
            title={button.label}
            onClick={button.onClick}
            className={cn(
              "h-10 px-3 text-[10px] font-bold tracking-widest uppercase border transition-all duration-150 inline-flex items-center gap-2",
              button.active
                ? "bg-[#FAFAFA] text-[#0A0A0A] border-[#FAFAFA]"
                : "bg-transparent text-[#737373] border-[#262626] hover:text-[#FAFAFA] hover:border-[#FAFAFA]",
            )}
          >
            {button.icon}
            <span className="hidden lg:inline">{button.label}</span>
          </button>
        ))}
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-4 bg-[#262626] w-3/4" />
            <div className="h-4 bg-[#262626] w-1/2" />
            <div className="h-4 bg-[#262626] w-2/3" />
            <div className="h-4 bg-[#262626] w-1/3" />
          </div>
        ) : (
          <EditorContent 
            editor={editor} 
            className="prose prose-invert prose-sm max-w-none
              prose-headings:font-bold prose-headings:tracking-tighter prose-headings:text-[#FAFAFA] prose-headings:uppercase
              prose-p:text-[#FAFAFA] prose-p:leading-relaxed
              prose-strong:text-[#FAFAFA] prose-strong:font-bold
              prose-em:text-[#FAFAFA]
              prose-code:text-[#FF3D00] prose-code:bg-[#262626] prose-code:px-1 prose-code:py-0.5
              prose-pre:bg-[#1A1A1A] prose-pre:border prose-pre:border-[#262626]
              prose-blockquote:border-l-2 prose-blockquote:border-[#FF3D00] prose-blockquote:text-[#737373] prose-blockquote:italic
              prose-ul:text-[#FAFAFA] prose-ol:text-[#FAFAFA]
              prose-li:marker:text-[#FF3D00]
              prose-hr:border-[#262626]
              prose-a:text-[#FF3D00] prose-a:no-underline hover:prose-a:underline
            "
          />
        )}
      </div>
    </div>
  );
}