"use client";

import { useState, useEffect } from "react";
import { useJournalStore, Note } from "@/store/useJournalStore";
import { Trash2, Edit2 } from "lucide-react";

const ICONS = [
  { id: "note", svg: <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /> },
  { id: "chart", svg: <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /> },
  { id: "smile", svg: <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" /> },
  { id: "sad", svg: <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 16.318A4.486 4.486 0 0 0 12.016 15a4.486 4.486 0 0 0-3.198 1.318M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" /> },
  { id: "alert", svg: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3Z" /> },
  { id: "bulb", svg: <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" /> },
  { id: "up", svg: <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z" /> },
  { id: "down", svg: <path strokeLinecap="round" strokeLinejoin="round" d="M7.498 15.25H4.372c-1.026 0-1.945-.694-2.054-1.715a12.137 12.137 0 0 1-.068-1.285c0-2.848.992-5.464 2.649-7.521C5.287 4.247 5.886 4 6.504 4h4.016a4.5 4.5 0 0 1 1.423.23l3.114 1.04a4.5 4.5 0 0 0 1.423.23h1.294M7.498 15.25c.618 0 .991.724.725 1.282A7.471 7.471 0 0 0 7.5 19.75 2.25 2.25 0 0 0 9.75 22a.75.75 0 0 0 .75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 0 0 2.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384m-10.253 1.5H9.7m8.075-9.75c.01.05.027.1.05.148.593 1.2.925 2.55.925 3.977 0 1.487-.36 2.89-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.774-1.086 1.227-1.918 1.227h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 0 0 .303-.54" /> }
];

export function getNoteIconSvg(iconId: string) {
  const icon = ICONS.find((i) => i.id === iconId) || ICONS[0];
  return (
    <svg className="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
      {icon.svg}
    </svg>
  );
}

interface NoteFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  noteToEdit?: Note | null;
}

export function NoteFormModal({ isOpen, onClose, noteToEdit }: NoteFormModalProps) {
  const { addNote, updateNote } = useJournalStore();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [icon, setIcon] = useState("note");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (noteToEdit) {
        setTitle(noteToEdit.title || "");
        setContent(noteToEdit.content || "");
        setIcon(noteToEdit.icon || "note");
      } else {
        setTitle("");
        setContent("");
        setIcon("note");
      }
    }
  }, [isOpen, noteToEdit]);

  const handleSave = async () => {
    if (!title.trim() && !content.trim()) return;
    setIsSubmitting(true);
    try {
      if (noteToEdit) {
        await updateNote(noteToEdit.id, {
          title: title.trim(),
          content: content.trim(),
          icon,
          updatedAt: new Date().toISOString()
        });
      } else {
        await addNote({
          title: title.trim(),
          content: content.trim(),
          icon,
          date: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      onClose();
    } catch (e) {
      console.error(e);
      alert("Failed to save note");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-50 p-4" style={{ outline: 'none', border: 'none' }} onClick={onClose}>
      <div className="bg-white border-0 bg-clip-padding rounded-2xl w-full max-w-lg p-6 shadow-xl relative" style={{ outline: 'none', border: 'none', backgroundClip: 'padding-box', transform: 'translateZ(0)', backfaceVisibility: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-extrabold text-stone-950 mb-6 tracking-tight">
          {noteToEdit ? "Edit Note" : "Add Note"}
        </h3>
        <div className="space-y-4 border-0 border-transparent" style={{ outline: 'none' }}>
          <div>
            <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1">Title</label>
            <input 
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-2 text-sm font-semibold text-stone-950 focus:outline-none focus:border-orange-400 transition" 
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1">Icon</label>
            <div className="flex flex-wrap gap-2">
              {ICONS.map((i) => (
                <button 
                  key={i.id}
                  onClick={() => setIcon(i.id)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition ${icon === i.id ? 'text-orange-400 bg-orange-50 border-2 border-orange-400' : 'text-stone-400 bg-stone-50 hover:bg-stone-100 border-2 border-transparent'}`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">{i.svg}</svg>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1">Notes</label>
            <textarea 
              value={content} 
              onChange={(e) => setContent(e.target.value)} 
              rows={8} 
              className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-2 text-sm font-semibold text-stone-950 focus:outline-none focus:border-orange-400 transition resize-y"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button onClick={onClose} disabled={isSubmitting} className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold py-3 rounded-xl transition">Cancel</button>
            <button onClick={handleSave} disabled={isSubmitting} className="flex-1 bg-orange-400 hover:bg-orange-500 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-orange-200 disabled:opacity-50">
              {isSubmitting ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ReadNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  note: Note | null;
  onEdit: (note: Note) => void;
  onDelete: (id: string) => void;
}

export function ReadNoteModal({ isOpen, onClose, note, onEdit, onDelete }: ReadNoteModalProps) {
  if (!isOpen || !note) return null;

  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-50 p-4" style={{ outline: 'none', border: 'none' }} onClick={onClose}>
      <div className="bg-white border-0 bg-clip-padding rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col p-6 shadow-xl relative" style={{ outline: 'none', border: 'none', backgroundClip: 'padding-box', transform: 'translateZ(0)', backfaceVisibility: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4 shrink-0">
          <div>
            <h3 className="text-xl font-extrabold text-stone-950 tracking-tight leading-tight">{note.title || 'Untitled'}</h3>
            <div className="text-sm font-semibold text-stone-400 mt-1">
              {note.date ? new Date(note.date).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 bg-stone-50 hover:bg-stone-100 p-2 rounded-lg transition shrink-0 ml-4">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        <div className="text-stone-950 text-sm leading-relaxed whitespace-pre-wrap flex-1 overflow-y-auto min-h-[100px] mb-4 pr-2 border-0 border-transparent" style={{ outline: 'none' }}>
          {note.content}
        </div>
        <div className="flex items-center justify-between pt-4 mt-6 border-t border-stone-100 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => {
              if (confirm("Are you sure you want to delete this note?")) {
                onDelete(note.id);
                onClose();
              }
            }} className="p-2.5 bg-stone-100 hover:bg-red-50 text-stone-600 hover:text-red-900 rounded-xl transition" title="Delete">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={() => { onClose(); onEdit(note); }} className="flex items-center gap-1.5 text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 px-5 py-2.5 rounded-xl transition">
              <Edit2 className="w-4 h-4" />
              Edit
            </button>
          </div>
          <button onClick={onClose} className="text-xs font-bold text-white bg-stone-900 hover:bg-stone-800 px-6 py-2.5 rounded-xl transition shadow-md shadow-stone-900/20">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
