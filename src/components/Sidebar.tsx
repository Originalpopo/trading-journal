"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  TrendingUp, 
  Calendar, 
  History, 
  FlaskConical, 
  StickyNote,
  Upload,
  ClipboardPaste,
  Trash2,
  Download,
  Flame,
  Settings
} from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { handleCSVUpload, handlePasteText } from "@/lib/csvParser";
import { clearDatabase, downloadDatabase, restoreDatabase } from "@/lib/dbActions";
import { UploadModal } from "./UploadModal";

export default function Sidebar() {
  const pathname = usePathname();
  const { initializeListeners, trades, funding, notes } = useJournalStore();
  const [statusText, setStatusText] = useState("Initializing...");
  const [statusColor, setStatusColor] = useState("bg-stone-300");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    const unsubscribe = initializeListeners();
    setStatusText("Live");
    setStatusColor("bg-orange-400 shadow-md shadow-orange-400");
    return () => unsubscribe();
  }, [initializeListeners]);

  const onFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    handleCSVUpload(
      file, 
      (status) => {
        setStatusText(status);
        setStatusColor("bg-yellow-500");
      },
      (result) => {
        alert(`Successfully imported ${result.importCount} new trades; Skipped ${result.skipCount} duplicate entries.`);
        setStatusText("Live");
        setStatusColor("bg-orange-400 shadow-md shadow-orange-400");
        e.target.value = '';
      },
      (error) => {
        console.error(error);
        alert("Error parsing CSV");
        setStatusText("Error");
        setStatusColor("bg-stone-500");
        e.target.value = '';
        e.target.value = '';
      }
    );
  };

  const onPasteSubmit = (text: string) => {
    handlePasteText(
      text,
      (status) => {
        setStatusText(status);
        setStatusColor("bg-yellow-500");
      },
      (result) => {
        alert(`Successfully imported ${result.importCount} new trades; Skipped ${result.skipCount} duplicate entries.`);
        setStatusText("Live");
        setStatusColor("bg-orange-400 shadow-md shadow-orange-400");
      },
      (error) => {
        console.error(error);
        alert("Error parsing pasted data.");
        setStatusText("Error");
        setStatusColor("bg-stone-500");
      }
    );
  };

  const onDBRestoreUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (text) {
        restoreDatabase(
          text,
          (status) => {
            setStatusText(status);
            setStatusColor("bg-yellow-500");
          },
          (result) => {
            alert(`Successfully restored ${result.trades} trades, ${result.funding} funding entries, and ${result.notes} notes.`);
            setStatusText("Live");
            setStatusColor("bg-orange-400 shadow-md shadow-orange-400");
          },
          () => {
            setStatusText("Error");
            setStatusColor("bg-stone-500");
          }
        );
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const onClearDatabase = () => {
    clearDatabase(
      trades,
      funding,
      notes,
      (status) => {
        setStatusText(status);
        setStatusColor("bg-stone-500 animate-pulse");
      },
      () => {
        setStatusText("Live");
        setStatusColor("bg-orange-400 shadow-md shadow-orange-400");
      },
      () => {
        setStatusText("Error");
        setStatusColor("bg-stone-500");
      }
    );
  };

  const onDownloadDatabase = () => {
    downloadDatabase(trades, funding, notes);
  };

  const navItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Performance", href: "/performance", icon: TrendingUp },
    { name: "History", href: "/history", icon: History },
    { name: "Calendar", href: "/calendar", icon: Calendar },
    { name: "Simulation", href: "/simulation", icon: FlaskConical },
    { name: "Notes", href: "/notes", icon: StickyNote },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <aside className={`bg-white border-r border-stone-200 flex flex-col shrink-0 overflow-y-auto z-10 transition-all duration-300 ${isCollapsed ? "w-20" : "w-64"}`}>
      <div className={`p-6 pb-8 flex items-center ${isCollapsed ? "justify-center px-4" : "gap-2"}`}>
        <button 
          onClick={(e) => {
            e.preventDefault();
            setIsCollapsed(!isCollapsed);
          }}
          className="cursor-pointer hover:opacity-80 transition flex-shrink-0 focus:outline-none"
        >
          <Flame className="w-9 h-9 text-orange-400" strokeWidth={1.5} />
        </button>
        {!isCollapsed && (
          <Link href="/" className="cursor-pointer hover:opacity-80 transition flex-shrink-0 overflow-hidden">
            <h1 className="text-2xl font-extrabold text-stone-900 tracking-tight whitespace-nowrap">
              Trade<span className="text-orange-400">Journal</span>
            </h1>
          </Link>
        )}
      </div>

      <nav className={`flex-1 space-y-2 ${isCollapsed ? "px-2" : "px-4"}`}>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link key={item.name} href={item.href} title={isCollapsed ? item.name : undefined}>
              <button
                className={`flex items-center transition-all w-full text-left rounded-xl ${
                  isCollapsed ? "justify-center py-3 px-0" : "gap-3 px-4 py-3"
                } ${
                  isActive
                    ? "bg-orange-50 text-orange-400 font-bold"
                    : "text-stone-500 hover:text-stone-950 hover:bg-stone-50 font-semibold"
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isCollapsed && isActive ? "scale-110" : ""}`} />
                {!isCollapsed && <span className="whitespace-nowrap overflow-hidden">{item.name}</span>}
              </button>
            </Link>
          );
        })}
      </nav>

      <div className={`p-4 border-t border-stone-100 flex gap-2 mt-auto ${isCollapsed ? "flex-col items-center" : "flex-col"}`}>
        <button
          title="Upload"
          onClick={() => setIsUploadModalOpen(true)}
          className={`bg-white border border-stone-200 hover:border-orange-200 hover:text-orange-400 text-stone-500 rounded-lg text-sm font-bold transition shadow-sm flex items-center justify-center gap-2 ${
            isCollapsed ? "w-10 h-10 p-0 shrink-0" : "w-full px-4 py-2"
          }`}
        >
          <Upload className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>Upload</span>}
        </button>
        
        {isCollapsed ? (
          <>
            <div 
              className="flex items-center justify-center bg-stone-50 border border-stone-100 rounded-lg w-10 h-10 shrink-0 cursor-help mt-2"
              title={`Database Status: ${statusText}`}
            >
              <span className={`w-3 h-3 rounded-full ${statusColor}`}></span>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-2 mt-2">
            <div className="flex-1 text-xs font-semibold flex items-center justify-center text-stone-600 bg-stone-50 py-2 rounded-lg border border-stone-100 overflow-hidden">
              <span className={`w-2.5 h-2.5 rounded-full mr-2 shrink-0 ${statusColor}`}></span>
              <span className="truncate">{statusText}</span>
            </div>
          </div>
        )}
      </div>
      <UploadModal 
        isOpen={isUploadModalOpen} 
        onClose={() => setIsUploadModalOpen(false)} 
        onPasteSubmit={onPasteSubmit} 
        onFileUpload={onFileUpload}
        onDBRestoreUpload={onDBRestoreUpload}
        onClearDatabase={onClearDatabase}
        onDownloadDatabase={onDownloadDatabase}
      />
    </aside>
  );
}
