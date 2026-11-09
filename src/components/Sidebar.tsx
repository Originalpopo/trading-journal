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
  Flame,
  Settings,
  Receipt,
  FileText,
  Eye,
  EyeOff,
  Ellipsis
} from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { clearDatabase, downloadDatabase, restoreDatabase } from "@/lib/dbActions";
import { UploadModal } from "./UploadModal";
import { BackupDueDot } from "./BackupReminder";
import BulkImportModal from "./BulkImportModal";
import { RAIL_COLLAPSED_PX, RAIL_EXPANDED_PX } from "./pageEdge";

export default function Sidebar() {
  const pathname = usePathname();
  const { initializeListeners, trades, funding, dayNotes, weekNotes, preferences, isPrivacyMode, setIsPrivacyMode } = useJournalStore();
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [tvRawText, setTvRawText] = useState("");
  const [tvLogText, setTvLogText] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // How far the sidebar's right edge is from the window's left, for the page beside it (pageEdge.ts).
  useEffect(() => {
    document.documentElement.style.setProperty('--rail', `${isCollapsed ? RAIL_COLLAPSED_PX : RAIL_EXPANDED_PX}px`);
  }, [isCollapsed]);

  useEffect(() => {
    const unsubscribe = initializeListeners();
    return () => unsubscribe();
  }, [initializeListeners]);

  const onPasteSubmit = (text: string, logText: string) => {
    setTvRawText(text);
    setTvLogText(logText);
    setIsBulkImportOpen(true);
  };

  // Restoring and clearing say when they finish or fail with their own alerts (dbActions).
  const onDBRestoreUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (text) {
        restoreDatabase(
          text,
          undefined,
          (result) => {
            alert(`Successfully restored ${result.trades} trades, ${result.funding} funding entries, ${result.notes} day notes, ${result.weekNotes} week notes${result.preferences ? ', and your settings (balance checks, statement details)' : ''}.`);
          }
        );
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const onClearDatabase = () => {
    clearDatabase(trades, funding, dayNotes, weekNotes);
  };

  const onDownloadDatabase = () => {
    downloadDatabase(trades, funding, dayNotes, weekNotes, preferences);
  };

  const navItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    // Same order as the phone's bottom bar (MOBILE_PRIMARY): Dashboard, History, Calendar, Performance.
    { name: "History", href: "/history", icon: History },
    { name: "Calendar", href: "/calendar", icon: Calendar },
    { name: "Performance", href: "/performance", icon: TrendingUp },
    { name: "Notes", href: "/notes", icon: StickyNote },
    { name: "Simulation", href: "/simulation", icon: FlaskConical },
    { name: "Tax Report", href: "/report", icon: Receipt },
    { name: "Statement", href: "/statement", icon: FileText },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  // Phones have no room for a side rail: the four everyday pages sit in a bottom bar, the rest behind "More".
  const MOBILE_PRIMARY = ["/", "/history", "/calendar", "/performance"];
  const mobilePrimary = MOBILE_PRIMARY.map(href => navItems.find(item => item.href === href)!);
  const mobileMore = navItems.filter(item => !MOBILE_PRIMARY.includes(item.href));
  const isMoreActive = isMoreOpen || mobileMore.some(item => item.href === pathname);

  return (
    <>
    {/* A card floating over the page's left side: away from the window's edges, rounded, with a soft shadow. The
        page runs on under it to the window's edge, so its grey bands reach there too. */}
    <aside className={`print:hidden bg-white rounded-3xl fixed top-4 bottom-4 left-4 shadow-[0_10px_40px_-8px_rgba(28,25,23,0.12)] hidden md:flex flex-col shrink-0 overflow-y-auto z-50 transition-all duration-300 ${isCollapsed ? "w-20" : "w-64"}`}>
      <div className={`p-6 pb-8 flex items-center ${isCollapsed ? "justify-center px-4" : "gap-2"}`}>
        <button 
          onClick={(e) => {
            e.preventDefault();
            setIsCollapsed(!isCollapsed);
          }}
          className="cursor-pointer hover:opacity-80 transition flex-shrink-0 focus:outline-none"
        >
          <Flame className="w-9 h-9 text-accent" strokeWidth={1.5} />
        </button>
        {!isCollapsed && (
          <Link href="/" className="cursor-pointer hover:opacity-80 transition flex-shrink-0 overflow-hidden">
            <h1 className="text-2xl font-extrabold text-ink tracking-tight whitespace-nowrap">
              Trade<span className="text-accent">Journal</span>
            </h1>
          </Link>
        )}
      </div>

      {/* Settings is not in the list: it sits at the very bottom, in the list's own style. */}
      <nav className={`flex-1 space-y-2 ${isCollapsed ? "px-2" : "px-4"}`}>
        {navItems.filter(item => item.href !== "/settings").map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link key={item.name} href={item.href} title={isCollapsed ? item.name : undefined}>
              <button
                className={`flex items-center transition-all w-full text-left rounded-xl ${
                  isCollapsed ? "justify-center py-3 px-0" : "gap-3 px-4 py-3"
                } ${
                  isActive
                    ? "bg-accent-soft text-accent font-bold"
                    : "text-ink-muted hover:text-ink hover:bg-surface font-semibold"
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isCollapsed && isActive ? "scale-110" : ""}`} />
                {!isCollapsed && <span className="whitespace-nowrap overflow-hidden">{item.name}</span>}
              </button>
            </Link>
          );
        })}
      </nav>

      {/* Import above Privacy Mode, both in boxes. */}
      <div className={`px-4 py-2 mt-auto flex flex-col gap-2 ${isCollapsed ? "items-center" : ""}`}>
        <button
          title="Import & Backup"
          onClick={() => setIsUploadModalOpen(true)}
          className={`relative bg-white border border-line hover:border-accent-line hover:text-accent text-ink-muted rounded-lg text-sm font-bold transition shadow-sm flex items-center justify-center gap-2 ${
            isCollapsed ? "w-10 h-10 p-0 shrink-0" : "w-full px-4 py-2"
          }`}
        >
          <Upload className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>Import</span>}
          <BackupDueDot />
        </button>
        <button
          title={isPrivacyMode ? "Show Data" : "Privacy Mode"}
          onClick={() => setIsPrivacyMode(!isPrivacyMode)}
          className={`flex items-center justify-center gap-2 text-sm font-bold rounded-lg transition shadow-sm border ${
            isPrivacyMode
              ? 'bg-accent-soft text-accent border-accent-line'
              : 'bg-white border-line text-ink-muted hover:border-accent-line hover:text-accent'
          } ${isCollapsed ? "w-10 h-10 p-0 shrink-0" : "w-full px-4 py-2"}`}
        >
          {isPrivacyMode ? <EyeOff className="w-4 h-4 shrink-0" /> : <Eye className="w-4 h-4 shrink-0" />}
          {!isCollapsed && <span>Privacy Mode</span>}
        </button>
      </div>

      <div className={`pt-2 pb-4 border-t border-line-soft ${isCollapsed ? "px-2" : "px-4"}`}>
        <Link
          href="/settings"
          title={isCollapsed ? "Settings" : undefined}
          className={`flex items-center transition-all w-full rounded-xl ${
            isCollapsed ? "justify-center py-3 px-0" : "gap-3 px-4 py-3"
          } ${
            pathname === "/settings"
              ? "bg-accent-soft text-accent font-bold"
              : "text-ink-muted hover:text-ink hover:bg-surface font-semibold"
          }`}
        >
          <Settings className={`w-5 h-5 shrink-0 ${isCollapsed && pathname === "/settings" ? "scale-110" : ""}`} />
          {!isCollapsed && <span className="whitespace-nowrap overflow-hidden">Settings</span>}
        </Link>
      </div>
    </aside>

    {isMoreOpen && (
      <div className="md:hidden print:hidden fixed inset-0 z-40 bg-stone-900/50" onClick={() => setIsMoreOpen(false)}>
        <div
          className="absolute inset-x-0 bottom-0 bg-white rounded-t-3xl px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-3 gap-2">
            {mobileMore.filter(item => item.href !== "/settings").map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsMoreOpen(false)}
                  className={`flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl text-[11px] transition ${
                    isActive ? "bg-accent-soft text-accent font-bold" : "bg-surface text-ink-muted font-semibold"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.name}
                </Link>
              );
            })}
            <button
              onClick={() => { setIsMoreOpen(false); setIsUploadModalOpen(true); }}
              className="relative flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl text-[11px] bg-surface text-ink-muted font-semibold transition"
            >
              <Upload className="w-5 h-5" />
              Import
              <BackupDueDot />
            </button>
            <button
              onClick={() => setIsPrivacyMode(!isPrivacyMode)}
              className={`flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl text-[11px] transition ${
                isPrivacyMode ? "bg-accent-soft text-accent font-bold" : "bg-surface text-ink-muted font-semibold"
              }`}
            >
              {isPrivacyMode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              Privacy
            </button>
            <Link
              href="/settings"
              onClick={() => setIsMoreOpen(false)}
              className={`flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl text-[11px] transition ${
                pathname === "/settings" ? "bg-accent-soft text-accent font-bold" : "bg-surface text-ink-muted font-semibold"
              }`}
            >
              <Settings className="w-5 h-5" />
              Settings
            </Link>
          </div>
        </div>
      </div>
    )}

    {/* Like the sidebar on a computer: a card floating above the page's bottom, away from the screen's edges,
        rounded, with a soft shadow. */}
    <nav className="md:hidden print:hidden fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 bg-white rounded-3xl shadow-[0_10px_40px_-8px_rgba(28,25,23,0.18)]">
      {/* The page being shown sits on an orange pill, as in the sidebar. */}
      <div className="grid grid-cols-5 h-16 p-1.5 gap-1">
        {mobilePrimary.map((item) => {
          const isActive = !isMoreOpen && pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setIsMoreOpen(false)}
              className={`flex flex-col items-center justify-center gap-1 rounded-2xl text-[10px] transition ${
                isActive ? "bg-accent-soft text-accent font-bold" : "text-ink-faint font-semibold"
              }`}
            >
              <Icon className="w-5 h-5" />
              {item.name}
            </Link>
          );
        })}
        <button
          onClick={() => setIsMoreOpen(!isMoreOpen)}
          className={`flex flex-col items-center justify-center gap-1 rounded-2xl text-[10px] transition ${
            isMoreActive ? "bg-accent-soft text-accent font-bold" : "text-ink-faint font-semibold"
          }`}
        >
          <Ellipsis className="w-5 h-5" />
          More
        </button>
      </div>
    </nav>

      {/* Outside the aside: it is display:none on phones, which would hide these popups too. */}
      <UploadModal
        isOpen={isUploadModalOpen} 
        onClose={() => setIsUploadModalOpen(false)} 
        onPasteSubmit={onPasteSubmit} 
        onDBRestoreUpload={onDBRestoreUpload}
        onClearDatabase={onClearDatabase}
        onDownloadDatabase={onDownloadDatabase}
      />
      {isBulkImportOpen && (
        <BulkImportModal 
          isOpen={isBulkImportOpen}
          onClose={() => setIsBulkImportOpen(false)}
          initialRawText={tvRawText}
          initialLogText={tvLogText}
        />
      )}
    </>
  );
}
