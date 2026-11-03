import { useEffect, useRef, useState } from "react";
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
  Mic,
  Minus,
  Plus,
  Quote,
  Trash2,
} from "lucide-react";
import { EditorContent, type Editor } from "@tiptap/react";
import { cn } from "@/lib/utils";
import type { Note } from "@/types";
import axios from "@/lib/axios";
import { mergeChunkTranscript, promptTail } from "@/lib/streamingTranscribe";

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
  // Voice dictation: reuses the streaming voice pipeline (AudioWorklet PCM
  // capture -> /voice/transcribe/chunk -> word-level stitching). The live
  // transcript builds in the strip below the toolbar; on stop the final
  // text is inserted into the TipTap document.
  const [dictationSupported] = useState(
    () =>
      typeof window !== "undefined" &&
      !!(
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      ) &&
      !!navigator.mediaDevices?.getUserMedia,
  );
  const [isDictating, setIsDictating] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [interimText, setInterimText] = useState("");
  const [dictationError, setDictationError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dictatingRef = useRef(false);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const accumRef = useRef("");
  const doneRef = useRef(false);

  const cleanupDictation = () => {
    if (!dictatingRef.current && !audioCtxRef.current) return;
    try {
      workletNodeRef.current?.port.postMessage("stop");
    } catch {
      /* noop */
    }
    try {
      workletNodeRef.current?.disconnect();
    } catch {
      /* noop */
    }
    try {
      sourceNodeRef.current?.disconnect();
    } catch {
      /* noop */
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => undefined);
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current = null;
    workletNodeRef.current = null;
    sourceNodeRef.current = null;
    streamRef.current = null;
    dictatingRef.current = false;
    setMicLevel(0);
  };

  const handleWorkletMessage = (e: MessageEvent) => {
    const msg = e.data as {
      type: string;
      rms?: number;
      seq?: number;
      pcm?: ArrayBuffer;
      final?: boolean;
    };
    if (msg.type === "level") {
      setMicLevel(msg.rms ?? 0);
      return;
    }
    if (msg.type === "done") {
      doneRef.current = true;
      return;
    }
    if (msg.type === "chunk" && msg.pcm != null && msg.seq != null) {
      const { seq, pcm, final: isFinal } = msg;
      chainRef.current = chainRef.current
        .then(() => uploadChunk(seq, pcm))
        .catch((err) => console.error("Dictation chunk upload failed:", err))
        .then(() => {
          if (isFinal) doneRef.current = true;
        });
    }
  };

  const uploadChunk = async (seq: number, pcm: ArrayBuffer) => {
    const prompt = promptTail(accumRef.current);
    const response = await axios.post(
      `/voice/transcribe/chunk?seq=${seq}&prompt=${encodeURIComponent(prompt)}`,
      pcm,
      {
        headers: { "Content-Type": "application/octet-stream" },
        timeout: 60000,
      },
    );
    const text = (response.data?.transcript as string | undefined)?.trim();
    if (response.data?.success && text) {
      accumRef.current = mergeChunkTranscript(accumRef.current, text);
      setInterimText(accumRef.current);
    }
  };

  const insertDictatedText = (text: string) => {
    if (!editor) return;
    // Inserted as a text node (not parsed HTML) so dictated punctuation
    // like "a < b" can never break the document. At a live cursor when
    // the editor has focus, otherwise appended at the end with a space.
    const node = { type: "text", text };
    if (editor.isFocused) {
      editor.chain().focus().insertContent(node).run();
    } else {
      editor
        .chain()
        .focus(editor.state.doc.content.size)
        .insertContent({ type: "text", text: ` ${text}` })
        .run();
    }
  };

  const startDictation = async () => {
    try {
      setDictationError(null);
      setInterimText("");
      setMicLevel(0);
      accumRef.current = "";
      doneRef.current = false;
      chainRef.current = Promise.resolve();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new AC({ sampleRate: 16000 });
        await ctx.audioWorklet.addModule("/whisper-capture.worklet.js");
        const src = ctx.createMediaStreamSource(stream);
        const node = new AudioWorkletNode(ctx, "whisper-capture");
        node.port.onmessage = handleWorkletMessage;
        src.connect(node);
        audioCtxRef.current = ctx;
        workletNodeRef.current = node;
        sourceNodeRef.current = src;
        dictatingRef.current = true;
        setIsDictating(true);
      } catch (err) {
        console.error("Dictation worklet failed to start:", err);
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setDictationError("DICTATION FAILED TO START — TRY AGAIN");
      }
    } catch (err) {
      console.error("Dictation mic error:", err);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setIsDictating(false);
      const name = (err as { name?: string }).name;
      setDictationError(
        name === "NotAllowedError"
          ? "MICROPHONE ACCESS DENIED — ALLOW MIC ACCESS AND TRY AGAIN"
          : name === "NotFoundError"
            ? "NO MICROPHONE FOUND — CONNECT A MIC AND TRY AGAIN"
            : name === "NotReadableError"
              ? "MICROPHONE IN USE BY ANOTHER APP — CLOSE IT AND TRY AGAIN"
              : "MICROPHONE FAILED TO START — TRY AGAIN",
      );
    }
  };

  const stopDictation = async () => {
    setIsDictating(false);
    setIsFinishing(true);
    try {
      workletNodeRef.current?.port.postMessage("flush");
      // The worklet posts "done" after the final chunk is enqueued, so
      // draining the chain afterwards covers every chunk.
      const deadline = Date.now() + 5000;
      while (!doneRef.current && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      await chainRef.current;
      const finalText = accumRef.current.trim();
      if (!finalText) {
        setDictationError("RECORDING TOO SHORT — TRY RECORDING AGAIN");
      } else {
        setDictationError(null);
        insertDictatedText(finalText);
      }
    } catch (err) {
      console.error("Dictation stop error:", err);
      setDictationError("DICTATION FAILED — TRY AGAIN");
    } finally {
      cleanupDictation();
      setIsFinishing(false);
      setInterimText("");
    }
  };

  const toggleDictation = () => {
    if (isDictating) stopDictation();
    else startDictation();
  };

  // Unmount: never leave the mic live.
  useEffect(() => {
    return () => {
      cleanupDictation();
    };
  }, []);

  // Switching notes mid-dictation: stop silently rather than inserting the
  // transcript into the wrong note.
  const activeNoteId = activeNote?._id;
  useEffect(() => {
    return () => {
      if (dictatingRef.current) cleanupDictation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNoteId]);

  if (!activeNote) {
    return (
      <div className="h-full border border-[#262626] bg-[#0A0A0A] flex items-center justify-center">
        <div className="flex flex-col items-center text-center p-16">
          <div className="w-16 h-16 border border-[#262626] flex items-center justify-center mb-8">
            <FileText className="w-8 h-8 text-[#8a8a8a]" />
          </div>
          <h3 className="text-4xl font-bold tracking-tighter mb-4 text-[#FAFAFA]">
            VOID.
          </h3>
          <p className="text-sm font-bold tracking-[0.2em] text-[#8a8a8a] uppercase mb-8">
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
  const dictateDisabled = !dictationSupported || isFinishing || !editor;

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
          <span className="text-label font-bold tracking-widest text-[#8a8a8a] uppercase border border-[#262626] px-3 py-1">
            {activeNote.subject || "GENERAL"}
          </span>
          <span className="text-label font-bold tracking-widest text-[#8a8a8a] uppercase border border-[#262626] px-3 py-1">
            {activeNote.sourceType}
          </span>
          <span className="text-label font-bold tracking-widest uppercase min-w-[80px] text-right">
            {isSaving ? (
              <span className="text-[#FF3D00]">SAVING...</span>
            ) : lastSavedAt ? (
              <span className="text-[#FAFAFA]">SAVED ✓</span>
            ) : (
              <span className="text-[#8a8a8a]">NOT SAVED</span>
            )}
          </span>
          <button
            onClick={onMoveToTrash}
            className="flex items-center gap-2 px-4 py-2 border border-[#262626] text-label font-bold tracking-widest text-[#8a8a8a] uppercase hover:text-[#FF3D00] hover:border-[#FF3D00] transition-colors"
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
              "h-10 px-3 text-label font-bold tracking-widest uppercase border transition-all duration-150 inline-flex items-center gap-2",
              button.active
                ? "bg-[#FAFAFA] text-[#0A0A0A] border-[#FAFAFA]"
                : "bg-transparent text-[#8a8a8a] border-[#262626] hover:text-[#FAFAFA] hover:border-[#FAFAFA]",
            )}
          >
            {button.icon}
            <span className="hidden lg:inline">{button.label}</span>
          </button>
        ))}
        <button
          key="dictate"
          type="button"
          title={
            dictationSupported
              ? "DICTATE"
              : "VOICE DICTATION NOT SUPPORTED IN THIS BROWSER"
          }
          onClick={() => {
            if (!dictateDisabled) toggleDictation();
          }}
          className={cn(
            "h-10 px-3 text-label font-bold tracking-widest uppercase border transition-all duration-150 inline-flex items-center gap-2",
            isDictating
              ? "bg-[#FF3D00] text-[#0A0A0A] border-[#FF3D00]"
              : "bg-transparent text-[#8a8a8a] border-[#262626] hover:text-[#FAFAFA] hover:border-[#FAFAFA]",
            dictateDisabled && "opacity-30 cursor-not-allowed",
          )}
        >
          <Mic className="w-4 h-4" />
          <span className="hidden lg:inline">
            {isDictating ? "STOP" : "DICTATE"}
          </span>
        </button>
      </div>

      {/* Dictation strip: live level + interim transcript while dictating */}
      {(isDictating || isFinishing || dictationError) && (
        <div className="px-6 py-3 border-b border-[#262626] bg-[#0A0A0A]">
          {(isDictating || isFinishing) && (
            <div className="h-[3px] w-full bg-[#161616] mb-2" aria-hidden>
              <div
                className={`h-full transition-[width] duration-100 ${micLevel > 0.65 ? "bg-[#FF3D00]" : "bg-[#00E676]"}`}
                style={{ width: `${Math.min(100, micLevel * 350)}%` }}
              />
            </div>
          )}
          {dictationError ? (
            <p className="text-label font-bold tracking-[0.2em] uppercase text-[#FF3D00]">
              {dictationError}
            </p>
          ) : (
            <p className="text-sm font-mono text-[#8a8a8a] leading-relaxed">
              {isFinishing ? "TRANSCRIBING..." : interimText || "LISTENING..."}
            </p>
          )}
        </div>
      )}

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
              prose-blockquote:border-l-2 prose-blockquote:border-[#FF3D00] prose-blockquote:text-[#8a8a8a] prose-blockquote:italic
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
