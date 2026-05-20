import { useRef, type ChangeEvent } from "react";
import { motion } from "framer-motion";
import { Loader2, Plus, Search, Upload, ArrowRight } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { Note } from "@/types";

interface WorkspaceSidebarProps {
  notes: Note[];
  trashNotes: Note[];
  subjects: string[];
  activeNoteId: string | null;
  search: string;
  activeSubject: string | null;
  isLoading: boolean;
  isImportingPdf: boolean;
  onSearchChange: (value: string) => void;
  onSelectSubject: (subject: string | null) => void;
  onSelectNote: (noteId: string) => void;
  onCreateNote: () => void;
  onImportPdf: (file: File) => void;
  onRestoreNote: (noteId: string) => void;
  onDeletePermanently: (noteId: string) => void;
}

export function WorkspaceSidebar({
  notes,
  trashNotes,
  subjects,
  activeNoteId,
  search,
  activeSubject,
  isLoading,
  isImportingPdf,
  onSearchChange,
  onSelectSubject,
  onSelectNote,
  onCreateNote,
  onImportPdf,
  onRestoreNote,
  onDeletePermanently,
}: WorkspaceSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      onImportPdf(selectedFile);
    }
    event.target.value = "";
  };

  return (
    <aside className="w-72 shrink-0 border border-[#262626] bg-[#0A0A0A] flex flex-col overflow-hidden">
      {/* Search */}
      <div className="p-4 border-b border-[#262626]">
        <div className="relative">
          <Search className="w-4 h-4 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="SEARCH NOTES..."
            className="w-full h-10 bg-transparent border border-[#262626] pl-10 pr-4 text-xs font-bold tracking-widest text-[#FAFAFA] placeholder:text-[#262626] focus:outline-none focus:border-[#FAFAFA] transition-colors uppercase"
          />
        </div>
      </div>

      {/* Subject Filters */}
      <div className="px-4 py-3 border-b border-[#262626]">
        <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase mb-3">
          [ FILTERS ]
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSelectSubject(null)}
            className={cn(
              "text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 border transition-all duration-150",
              !activeSubject
                ? "bg-[#FAFAFA] text-[#0A0A0A] border-[#FAFAFA]"
                : "bg-transparent text-[#737373] border-[#262626] hover:text-[#FAFAFA] hover:border-[#FAFAFA]",
            )}
          >
            All
          </button>

          {subjects.map((subject) => (
            <button
              key={subject}
              type="button"
              onClick={() => onSelectSubject(subject)}
              className={cn(
                "text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 border transition-all duration-150",
                activeSubject === subject
                  ? "bg-[#FAFAFA] text-[#0A0A0A] border-[#FAFAFA]"
                  : "bg-transparent text-[#737373] border-[#262626] hover:text-[#FAFAFA] hover:border-[#FAFAFA]",
              )}
            >
              {subject}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-b border-[#262626] flex gap-2">
        <motion.button
          whileHover="hover"
          initial="initial"
          onClick={onCreateNote}
          className="group relative flex-1 inline-flex items-center justify-center gap-2 overflow-hidden bg-transparent px-4 py-3 text-[10px] font-bold tracking-widest text-[#FAFAFA] uppercase"
        >
          <span className="relative z-10 flex items-center gap-2">
            <Plus className="w-4 h-4" />
            NEW
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

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isImportingPdf}
          className="flex items-center gap-2 px-4 py-3 border border-[#262626] text-[10px] font-bold tracking-widest text-[#737373] uppercase hover:text-[#FAFAFA] hover:border-[#FAFAFA] transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          {isImportingPdf ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          PDF
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Notes List */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[#262626]">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">
              [ NOTES ]
            </p>
            <span className="text-[10px] font-bold tracking-widest text-[#FF3D00]">
              {notes.length.toString().padStart(2, "0")}
            </span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="h-16 bg-[#262626] animate-pulse" />
              ))}
            </div>
          ) : notes.length === 0 ? (
            <div className="p-4">
              <p className="text-xs font-bold tracking-widest text-[#737373] uppercase">
                NO NOTES FOUND.
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {notes.map((note) => (
                <button
                  key={note._id}
                  type="button"
                  onClick={() => onSelectNote(note._id)}
                  className={cn(
                    "w-full text-left border p-3 transition-all duration-150 group",
                    activeNoteId === note._id
                      ? "border-[#FF3D00] bg-[#FF3D00]/5"
                      : "border-[#262626] bg-transparent hover:border-[#FAFAFA]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold tracking-wide text-[#FAFAFA] truncate uppercase">
                      {note.title}
                    </p>
                    {activeNoteId === note._id && (
                      <ArrowRight className="w-3 h-3 text-[#FF3D00] shrink-0" />
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold tracking-widest text-[#737373] uppercase">
                      {formatDate(note.createdAt)}
                    </span>
                    <span className="text-[10px] font-bold tracking-widest text-[#737373] uppercase border border-[#262626] px-2 py-0.5">
                      {note.subject || "GENERAL"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Trash Section */}
      <div className="border-t border-[#262626]">
        <div className="px-4 py-3 border-b border-[#262626]">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase">
              [ TRASH ]
            </p>
            <span className="text-[10px] font-bold tracking-widest text-[#737373]">
              {trashNotes.length.toString().padStart(2, "0")}
            </span>
          </div>
        </div>
        
        <div className="max-h-[150px] overflow-y-auto">
          {trashNotes.length === 0 ? (
            <div className="p-4">
              <p className="text-xs font-bold tracking-widest text-[#737373] uppercase">
                EMPTY.
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {trashNotes.map((note) => (
                <div
                  key={note._id}
                  className="border border-[#262626] bg-transparent p-3"
                >
                  <p className="text-xs font-bold tracking-wide text-[#737373] truncate uppercase">
                    {note.title}
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      className="text-[10px] font-bold tracking-widest text-[#FAFAFA] uppercase hover:text-[#FF3D00] transition-colors"
                      onClick={() => onRestoreNote(note._id)}
                    >
                      RESTORE
                    </button>
                    <span className="text-[10px] text-[#262626]">|</span>
                    <button
                      type="button"
                      className="text-[10px] font-bold tracking-widest text-[#737373] uppercase hover:text-[#FF3D00] transition-colors"
                      onClick={() => onDeletePermanently(note._id)}
                    >
                      DELETE
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}