import { useState } from "react";
import { Upload, Trash2, Download, ChevronDown, Import } from "lucide-react";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import BackupReminder from "./BackupReminder";
import SaveRow from "./SaveRow";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPasteSubmit: (historyText: string, logText: string) => void;
  onDBRestoreUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearDatabase: () => void;
  onDownloadDatabase: () => void;
}

export function UploadModal({ isOpen, onClose, onPasteSubmit, onDBRestoreUpload, onClearDatabase, onDownloadDatabase }: UploadModalProps) {
  const [pasteText, setPasteText] = useState("");
  const [logText, setLogText] = useState("");
  // Accordion: one section open at a time, the paste section by default.
  const [openSection, setOpenSection] = useState<"paste" | "restore" | "actions">("paste");

  const close = () => {
    setOpenSection("paste");
    onClose();
  };
  useEscapeToClose(isOpen, close);

  if (!isOpen) return null;

  const handleSubmit = () => {
    onPasteSubmit(pasteText, logText);
    setPasteText("");
    setLogText("");
    close();
  };

  const handleClose = () => {
    setPasteText("");
    setLogText("");
    close();
  };

  // `extra` sits beside the chevron.
  const sectionHeader = (section: "paste" | "restore" | "actions", title: string, extra?: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setOpenSection(section)}
      aria-expanded={openSection === section}
      className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-bold text-ink text-left"
    >
      <span>{title}</span>
      <span className="ml-auto">{extra}</span>
      <ChevronDown className={`w-4 h-4 shrink-0 text-ink-faint transition-transform ${openSection === section ? "rotate-180" : ""}`} />
    </button>
  );

  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-50 p-4" style={{ outline: 'none', border: 'none' }} onClick={close}>
      <div className="bg-white border-0 bg-clip-padding rounded-2xl w-full max-w-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto" style={{ outline: 'none', border: 'none', backgroundClip: 'padding-box', transform: 'translateZ(0)', backfaceVisibility: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-extrabold text-ink mb-4 tracking-tight">Import & Backup</h3>

        {/* Paste Text Section */}
        <div className="mb-3 border border-line rounded-xl">
          {sectionHeader("paste", "Paste from TradingView")}
          {openSection === "paste" && (
          <div className="px-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-bold text-ink-muted mb-1">History tab</p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste the History tab here..."
                rows={4}
                className="w-full bg-surface border border-line rounded-xl px-4 py-3 text-sm font-medium text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-orange-400/20 transition resize-y"
              />
            </div>
            <div>
              <p className="text-[11px] font-bold text-ink-muted mb-1">Notifications log tab</p>
              <textarea
                value={logText}
                onChange={(e) => setLogText(e.target.value)}
                placeholder="Paste the Notifications log tab here..."
                rows={4}
                className="w-full bg-surface border border-line rounded-xl px-4 py-3 text-sm font-medium text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-orange-400/20 transition resize-y"
              />
            </div>
          </div>
          {pasteText.trim() && !logText.trim() ? (
            <p className="text-[11px] font-medium text-ink-faint mt-3">No log: entry times and first stop may be off.</p>
          ) : logText.trim() && !pasteText.trim() ? (
            <p className="text-[11px] font-medium text-ink-faint mt-3">Log only: updates trades already in the journal.</p>
          ) : null}
          <SaveRow isDirty={!!pasteText.trim() || !!logText.trim()} isSaving={false} onSave={handleSubmit} label="Import" icon={Import} />
          </div>
          )}
        </div>

        {/* Database Actions Section */}
        <div className="mb-3 border border-line rounded-xl">
          {sectionHeader("actions", "Database actions", <BackupReminder />)}
          {openSection === "actions" && (
          <div className="px-4 pb-4">
        <div className="flex gap-4">
          <button
            onClick={() => {
              if (window.confirm("Are you sure you want to clear the database?")) {
                onClearDatabase();
                close();
              }
            }}
            title="Clear Database"
            aria-label="Clear Database"
            className="shrink-0 flex items-center justify-center px-4 py-3 bg-surface-2 hover:bg-stone-200 text-stone-600 rounded-xl transition border border-line hover:border-stone-300 shadow-sm"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          
          <button
            onClick={() => {
              onDownloadDatabase();
              close();
            }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-accent-soft text-accent font-bold rounded-xl transition border border-accent hover:border-accent-strong shadow-sm"
          >
            <Download className="w-5 h-5" />
            <span className="whitespace-nowrap">Download Backup</span>
          </button>
        </div>
          </div>
          )}
        </div>

        {/* Restore DB Section */}
        <div className="mb-3 border border-line rounded-xl">
          {sectionHeader("restore", "Restore from backup (JSON)")}
          {openSection === "restore" && (
          <div className="px-4 pb-4">
          <label className="cursor-pointer bg-surface border-2 border-dashed border-stone-300 hover:border-accent hover:bg-accent-soft text-stone-600 px-4 py-4 rounded-xl font-bold transition flex flex-col items-center justify-center gap-3">
            <Upload className="w-8 h-8 text-ink-faint" />
            <span>Click to browse or drag and drop JSON backup</span>
            <input 
              type="file" 
              accept=".json" 
              className="hidden" 
              onChange={(e) => {
                onDBRestoreUpload(e);
                close();
              }} 
            />
          </label>
          </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button
            onClick={handleClose}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-surface-2 text-stone-600 hover:bg-stone-200 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
