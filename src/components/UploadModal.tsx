import { useState } from "react";
import { Upload, Trash2, Download } from "lucide-react";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import BackupReminder from "./BackupReminder";

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
  useEscapeToClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = () => {
    onPasteSubmit(pasteText, logText);
    setPasteText("");
    setLogText("");
    onClose();
  };

  const handleClose = () => {
    setPasteText("");
    setLogText("");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-50 p-4" style={{ outline: 'none', border: 'none' }} onClick={onClose}>
      <div className="bg-white border-0 bg-clip-padding rounded-2xl w-full max-w-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto" style={{ outline: 'none', border: 'none', backgroundClip: 'padding-box', transform: 'translateZ(0)', backfaceVisibility: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-extrabold text-stone-950 mb-4 tracking-tight">Upload Database</h3>
        
        {/* Paste Text Section */}
        <div className="mb-3">
          <label className="block text-sm font-bold text-stone-950 mb-2">Option 1: Paste from TradingView</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <p className="text-[11px] font-bold text-stone-500 mb-1">History tab</p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste the History tab here..."
                rows={4}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium text-stone-950 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 transition resize-y"
              />
            </div>
            <div>
              <p className="text-[11px] font-bold text-stone-500 mb-1">Notifications log tab <span className="font-medium text-stone-400">(today only)</span></p>
              <textarea
                value={logText}
                onChange={(e) => setLogText(e.target.value)}
                placeholder="Paste the Notifications log tab here..."
                rows={4}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium text-stone-950 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 transition resize-y"
              />
            </div>
          </div>
          {pasteText.trim() && !logText.trim() ? (
            <p className="text-[11px] font-bold text-red-900 mb-3">No Notifications log: entry times will be when the orders were placed, and a stop that was moved will have no first stop. You can still fix those in the preview.</p>
          ) : logText.trim() && !pasteText.trim() ? (
            <p className="text-[11px] font-medium text-stone-400 mb-3">Log only: it is checked against trades already in the journal and fixes their fill times and first stop. It has no P&L, so trades not in the journal yet need the History tab.</p>
          ) : (
            <p className="text-[11px] font-medium text-stone-400 mb-3">Paste both. The log adds what the history leaves out: when each entry really filled, and where the stop was before it was moved.</p>
          )}
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={!pasteText.trim() && !logText.trim()}
              className="px-6 py-2.5 bg-orange-400 hover:bg-orange-500 disabled:bg-orange-300 text-white font-bold rounded-xl transition shadow-lg shadow-orange-200"
            >
              {pasteText.trim() && !logText.trim() ? "Parse without log" : !pasteText.trim() && logText.trim() ? "Check log against journal" : "Parse Data"}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-3">
          <div className="h-px bg-stone-200 flex-1"></div>
          <span className="text-stone-400 font-bold text-sm uppercase tracking-wider">OR</span>
          <div className="h-px bg-stone-200 flex-1"></div>
        </div>

        {/* Restore DB Section */}
        <div className="mb-3">
          <label className="block text-sm font-bold text-stone-950 mb-2">Option 2: Restore Database (JSON)</label>
          <label className="cursor-pointer bg-stone-50 border-2 border-dashed border-stone-300 hover:border-orange-400 hover:bg-orange-50 text-stone-600 px-4 py-4 rounded-xl font-bold transition flex flex-col items-center justify-center gap-3">
            <Upload className="w-8 h-8 text-stone-400" />
            <span>Click to browse or drag and drop JSON backup</span>
            <input 
              type="file" 
              accept=".json" 
              className="hidden" 
              onChange={(e) => {
                onDBRestoreUpload(e);
                onClose();
              }} 
            />
          </label>
        </div>

        <div className="flex items-center gap-4 mb-3">
          <div className="h-px bg-stone-200 flex-1"></div>
          <span className="text-stone-400 font-bold text-sm uppercase tracking-wider">Database Actions</span>
          <div className="h-px bg-stone-200 flex-1"></div>
        </div>

        <div className="flex gap-4 mb-2">
          <button
            onClick={() => {
              if (window.confirm("Are you sure you want to clear the database?")) {
                onClearDatabase();
                onClose();
              }
            }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold rounded-xl transition border border-stone-200 hover:border-stone-300 shadow-sm"
          >
            <Trash2 className="w-5 h-5" />
            <span>Clear Database</span>
          </button>
          
          <button
            onClick={() => {
              onDownloadDatabase();
              onClose();
            }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-orange-50 text-orange-400 font-bold rounded-xl transition border border-orange-400 hover:border-orange-500 shadow-sm"
          >
            <Download className="w-5 h-5" />
            <span>Download Backup</span>
          </button>
        </div>
        <div className="flex justify-end mb-3 min-h-[15px]">
          <BackupReminder />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-stone-100">
          <button
            onClick={handleClose}
            className="px-6 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold rounded-xl transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
