"use client";

import { useJournalStore, Note } from "@/store/useJournalStore";
import { useState, useEffect, useRef } from "react";
import { NoteFormModal, ReadNoteModal, getNoteIconSvg } from "@/components/NoteModals";
import { Plus } from "lucide-react";

function formatNoteDate(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hrs = Math.floor(min / 60);
  const days = Math.floor(hrs / 24);
  const weeks = Math.floor(days / 7);
  if (sec < 60) return `${sec}s ago`;
  if (min < 60) return `${min}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function truncateThaiText(text: string, maxLength: number) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
    const segments = segmenter.segment(text);
    let result = '';
    for (const { segment } of segments) {
      if (result.length + segment.length > maxLength) break;
      result += segment;
    }
    if (result.length === 0) return text.substring(0, maxLength) + '...';
    return result + '...';
  }
  
  return text.substring(0, maxLength) + '...';
}

export default function NotesPage() {
  const { notes, isLoading, deleteNote } = useJournalStore();
  const [currentPage, setCurrentPage] = useState(1);
  const [notesPerPage, setNotesPerPage] = useState(8);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateRows = (height: number) => {
      const rowHeight = 76; // Approximate height of a note row
      let calculatedRows = Math.floor(height / rowHeight);
      if (calculatedRows < 5) calculatedRows = 5;
      if (calculatedRows > 50) calculatedRows = 50;
      setNotesPerPage(calculatedRows);
    };

    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (entry.target === container) {
          updateRows(entry.contentRect.height);
        }
      }
    });

    observer.observe(container);
    if (container.clientHeight > 0) {
      updateRows(container.clientHeight);
    }

    return () => observer.disconnect();
  }, []);

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isReadModalOpen, setIsReadModalOpen] = useState(false);
  const [noteToEdit, setNoteToEdit] = useState<Note | null>(null);
  const [noteToRead, setNoteToRead] = useState<Note | null>(null);

  const totalPages = Math.max(1, Math.ceil(notes.length / notesPerPage));
  const paginatedNotes = notes.slice((currentPage - 1) * notesPerPage, currentPage * notesPerPage);

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    const pages = [];
    pages.push(
      <button key="prev" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}
        className="px-3 py-1.5 border border-stone-200 rounded-lg text-[11px] font-bold text-stone-600 disabled:opacity-50">
        Prev
      </button>
    );

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
        pages.push(
          <button key={i} onClick={() => handlePageChange(i)}
            className={`px-3 py-1.5 border border-stone-200 rounded-lg text-[11px] font-bold ${i === currentPage ? 'bg-orange-400 text-white border-orange-400' : 'text-stone-600 hover:bg-stone-50'}`}>
            {i}
          </button>
        );
      } else if (i === currentPage - 2 || i === currentPage + 2) {
        pages.push(<span key={`dots-${i}`} className="px-2 text-stone-300">...</span>);
      }
    }

    pages.push(
      <button key="next" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}
        className="px-3 py-1.5 border border-stone-200 rounded-lg text-[11px] font-bold text-stone-600 disabled:opacity-50">
        Next
      </button>
    );

    return <div className="flex flex-wrap gap-1.5">{pages}</div>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[500px]">
        <p className="text-stone-500 font-semibold animate-pulse">Loading notes...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 flex flex-col min-h-[500px] h-[calc(100vh-2rem)] md:h-[calc(100vh-4rem)]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-3xl font-extrabold text-stone-950 tracking-tight">Notes</h2>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button 
            onClick={() => { setNoteToEdit(null); setIsFormModalOpen(true); }}
            className="bg-orange-400 hover:bg-orange-500 text-white border border-transparent px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm flex items-center justify-center gap-2 h-9 w-32">
            <Plus className="w-3.5 h-3.5" />
            Add Note
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 overflow-hidden flex-1 flex flex-col">
        {totalPages > 1 && (
          <div className="flex justify-end mb-4 border-b border-stone-100 pb-4 shrink-0">
            {renderPagination()}
          </div>
        )}
        <div ref={containerRef} className="flex-1 overflow-auto">
          <div className="flex flex-col divide-y divide-stone-100">
          {notes.length === 0 ? (
            <div className="py-8 text-center text-stone-400 font-semibold">
              No notes found. Click "Add Note" to create one.
            </div>
          ) : (
            paginatedNotes.map(note => {
              const safeTitle = note.title || 'Untitled';
              const safeContent = note.content || '';
              return (
                <div 
                  key={note.id} 
                  className="py-4 px-2 hover:bg-stone-50 transition cursor-pointer flex gap-4 items-start" 
                  onClick={() => { setNoteToRead(note); setIsReadModalOpen(true); }}
                >
                  <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center shrink-0 text-stone-400 mt-1">
                    {getNoteIconSvg(note.icon || 'note')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <h4 className="text-sm font-bold text-stone-900 truncate pr-4">{safeTitle}</h4>
                      <span className="text-xs font-semibold text-stone-400 shrink-0">{formatNoteDate(note.date)}</span>
                    </div>
                    <p className="text-sm text-stone-500 truncate">{truncateThaiText(safeContent, 100)}</p>
                  </div>
                </div>
              );
            })
          )}
          </div>
        </div>
      </div>

      <NoteFormModal 
        isOpen={isFormModalOpen} 
        onClose={() => setIsFormModalOpen(false)} 
        noteToEdit={noteToEdit} 
      />

      <ReadNoteModal 
        isOpen={isReadModalOpen} 
        onClose={() => setIsReadModalOpen(false)} 
        note={noteToRead} 
        onEdit={(note) => { setNoteToEdit(note); setIsFormModalOpen(true); }}
        onDelete={async (id) => await deleteNote(id)}
      />
    </div>
  );
}
