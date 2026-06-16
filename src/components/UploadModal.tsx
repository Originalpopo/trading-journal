import { useState } from "react";
import { Upload, Trash2, Download } from "lucide-react";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPasteSubmit: (text: string) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDBRestoreUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearDatabase: () => void;
  onDownloadDatabase: () => void;
}

export function UploadModal({ isOpen, onClose, onPasteSubmit, onFileUpload, onDBRestoreUpload, onClearDatabase, onDownloadDatabase }: UploadModalProps) {
  const [pasteText, setPasteText] = useState("");

  if (!isOpen) return null;

  const handleSubmit = () => {
    onPasteSubmit(pasteText);
    setPasteText("");
    onClose();
  };

  const handleClose = () => {
    setPasteText("");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-white outline-none rounded-2xl w-full max-w-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-extrabold text-slate-800 mb-4 tracking-tight">Upload Database</h3>
        
        {/* Paste Text Section */}
        <div className="mb-3">
          <label className="block text-sm font-bold text-slate-700 mb-2">Option 1: Paste cTrader/MT4 Data</label>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste your history data here..."
            rows={4}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition resize-y mb-3"
          />
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={!pasteText.trim()}
              className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold rounded-xl transition shadow-lg shadow-orange-200"
            >
              Import Text
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-3">
          <div className="h-px bg-slate-200 flex-1"></div>
          <span className="text-slate-400 font-bold text-sm uppercase tracking-wider">OR</span>
          <div className="h-px bg-slate-200 flex-1"></div>
        </div>

        {/* Upload CSV Section */}
        <div className="mb-3">
          <label className="block text-sm font-bold text-slate-700 mb-2">Option 2: Upload CSV File</label>
          <label className="cursor-pointer bg-slate-50 border-2 border-dashed border-slate-300 hover:border-orange-500 hover:bg-orange-50 text-slate-600 px-4 py-4 rounded-xl font-bold transition flex flex-col items-center justify-center gap-3">
            <Upload className="w-8 h-8 text-slate-400" />
            <span>Click to browse or drag and drop CSV</span>
            <input 
              type="file" 
              accept=".csv" 
              className="hidden" 
              onChange={(e) => {
                onFileUpload(e);
                onClose();
              }} 
            />
          </label>
        </div>

        <div className="flex items-center gap-4 mb-3">
          <div className="h-px bg-slate-200 flex-1"></div>
          <span className="text-slate-400 font-bold text-sm uppercase tracking-wider">OR</span>
          <div className="h-px bg-slate-200 flex-1"></div>
        </div>

        {/* Restore DB Section */}
        <div className="mb-3">
          <label className="block text-sm font-bold text-slate-700 mb-2">Option 3: Restore Database (JSON)</label>
          <label className="cursor-pointer bg-slate-50 border-2 border-dashed border-slate-300 hover:border-orange-500 hover:bg-orange-50 text-slate-600 px-4 py-4 rounded-xl font-bold transition flex flex-col items-center justify-center gap-3">
            <Upload className="w-8 h-8 text-slate-400" />
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
          <div className="h-px bg-slate-200 flex-1"></div>
          <span className="text-slate-400 font-bold text-sm uppercase tracking-wider">Database Actions</span>
          <div className="h-px bg-slate-200 flex-1"></div>
        </div>

        <div className="flex gap-4 mb-3">
          <button
            onClick={() => {
              if (window.confirm("Are you sure you want to clear the database?")) {
                onClearDatabase();
                onClose();
              }
            }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-xl transition border border-red-200 hover:border-red-300 shadow-sm"
          >
            <Trash2 className="w-5 h-5" />
            <span>Clear Database</span>
          </button>
          
          <button
            onClick={() => {
              onDownloadDatabase();
              onClose();
            }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-orange-50 text-orange-500 font-bold rounded-xl transition border border-orange-500 hover:border-orange-600 shadow-sm"
          >
            <Download className="w-5 h-5" />
            <span>Download Backup</span>
          </button>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            onClick={handleClose}
            className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
