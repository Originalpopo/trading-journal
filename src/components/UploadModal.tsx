import { useState } from "react";
import { Import } from "lucide-react";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import SaveRow from "./SaveRow";
import Button from "@/components/Button";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPasteSubmit: (historyText: string, logText: string) => void;
}

export function UploadModal({ isOpen, onClose, onPasteSubmit }: UploadModalProps) {
  const [pasteText, setPasteText] = useState("");
  const [logText, setLogText] = useState("");
  const close = () => {
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

  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-50 p-4" style={{ outline: 'none', border: 'none' }} onClick={close}>
      <div className="bg-card border-0 bg-clip-padding rounded-popup w-full max-w-2xl p-6 shadow-raised max-h-[90vh] overflow-y-auto" style={{ outline: 'none', border: 'none', backgroundClip: 'padding-box', transform: 'translateZ(0)', backfaceVisibility: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-title font-black text-ink mb-4 tracking-tight">Import</h3>

        {/* Paste from TradingView. Backup, restore and clearing live in Settings > Data & Backup. */}
        <div className="mb-3 border border-line rounded-box">
          <p className="px-4 py-3 text-body font-bold text-ink">Paste from TradingView</p>
          <div className="px-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-caption font-bold text-ink-muted mb-1">History tab</p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste the History tab here..."
                rows={4}
                className="w-full bg-surface border border-line rounded-box px-4 py-3 text-body font-semibold text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-line transition resize-y"
              />
            </div>
            <div>
              <p className="text-caption font-bold text-ink-muted mb-1">Notifications log tab</p>
              <textarea
                value={logText}
                onChange={(e) => setLogText(e.target.value)}
                placeholder="Paste the Notifications log tab here..."
                rows={4}
                className="w-full bg-surface border border-line rounded-box px-4 py-3 text-body font-semibold text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-line transition resize-y"
              />
            </div>
          </div>
          {pasteText.trim() && !logText.trim() ? (
            <p className="text-caption font-semibold text-ink-faint mt-3">No log: entry times and first stop may be off.</p>
          ) : logText.trim() && !pasteText.trim() ? (
            <p className="text-caption font-semibold text-ink-faint mt-3">Log only: updates trades already in the journal.</p>
          ) : null}
          <SaveRow isDirty={!!pasteText.trim() || !!logText.trim()} isSaving={false} onSave={handleSubmit} label="Import" icon={Import} />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
