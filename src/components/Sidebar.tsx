"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
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
import { rightNotchFill, rightNotchPath, topNotchFill, topNotchPath } from "./notchPath";
import { useTween } from "./useTween";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  // The page chosen in the sidebar: set the moment a page is clicked, so the notch starts gliding at once instead
  // of waiting for the new page to load; then kept in step with the address.
  const [selected, setSelected] = useState(pathname);
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) { setSeenPath(pathname); setSelected(pathname); }
  // The Google account signed in (the sidebar only shows once signed in): its photo sits at the bottom.
  const [user] = useState(() => auth.currentUser);
  const [photoFailed, setPhotoFailed] = useState(false);
  // First name and the surname's initial only ("Thana P."), and no email: kept private on screen.
  const nameParts = (user?.displayName || "").trim().split(/\s+/).filter(Boolean);
  const shortName = nameParts.length === 0 ? "Account" : nameParts.length === 1 ? nameParts[0] : `${nameParts[0]} ${nameParts[nameParts.length - 1].charAt(0).toUpperCase()}.`;
  const openAccount = () => {
    try { localStorage.setItem("settingsTab", "account"); } catch { }
    window.dispatchEvent(new Event("settings-tab"));
    setSelected("/settings");
    router.push("/settings");
  };
  const { initializeListeners, trades, funding, dayNotes, weekNotes, preferences, isPrivacyMode, setIsPrivacyMode } = useJournalStore();
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [tvRawText, setTvRawText] = useState("");
  const [tvLogText, setTvLogText] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  // The names in the menu wait until the sidebar has finished opening, then appear; on closing they go at once.
  const [showLabels, setShowLabels] = useState(false);
  useEffect(() => {
    if (isCollapsed) { setShowLabels(false); return; }
    const aside = asideRef.current;
    const show = () => setShowLabels(true);
    const onEnd = (e: TransitionEvent) => { if (e.target === aside && e.propertyName === 'width') show(); };
    aside?.addEventListener('transitionend', onEnd);
    const fallback = setTimeout(show, 400); // in case the end of the opening is never reported
    return () => { aside?.removeEventListener('transitionend', onEnd); clearTimeout(fallback); };
  }, [isCollapsed]);

  // The open page sits in a notch cut into the sidebar's right edge, open to the page beside it, on an orange pill.
  // Notch and pill glide together between the pages (Settings included) and follow the menu as it opens or closes.
  // The card itself (white,
  // border, shadow) is drawn as one SVG shape behind the sidebar, so its border and shadow follow the notch.
  const asideRef = useRef<HTMLElement>(null);
  const [navItem, setNavItem] = useTween<{ top: number; left: number; width: number; height: number }>();
  const [asideSize, setAsideSize] = useState<{ w: number; h: number; scroll: number } | null>(null);
  const lastPathRef = useRef(selected);
  const sidebarReadyRef = useRef(false);
  useLayoutEffect(() => {
    const aside = asideRef.current;
    if (!aside) return;
    const pageChanged = selected !== lastPathRef.current;
    lastPathRef.current = selected;
    const place = (glide: boolean) => {
      const a = aside.getBoundingClientRect();
      setAsideSize({ w: a.width, h: a.height, scroll: aside.scrollTop });
      const item = aside.querySelector<HTMLElement>(`[data-nav-href="${selected}"]`);
      if (!item || !a.width) { setNavItem(null, false); return; }
      const r = item.getBoundingClientRect();
      // In the sidebar's own box, as it shows on screen (after scrolling).
      setNavItem({ top: r.top - a.top, left: r.left - a.left, width: r.width, height: r.height }, glide);
    };
    place(pageChanged && sidebarReadyRef.current);
    sidebarReadyRef.current = true;
    const observer = new ResizeObserver(() => place(false));
    observer.observe(aside);
    aside.querySelectorAll('[data-nav-href]').forEach(el => observer.observe(el));
    const onScroll = () => place(false);
    aside.addEventListener('scroll', onScroll);
    return () => { observer.disconnect(); aside.removeEventListener('scroll', onScroll); };
  }, [selected, isCollapsed, setNavItem]);
  // The notch is exactly the open page's button, filled light orange edge to edge (no white rim around it).
  const sidebarNotch = navItem && { top: navItem.top, bottom: navItem.top + navItem.height, left: navItem.left };
  const sidebarPath = asideSize ? rightNotchPath(asideSize.w, asideSize.h, 24, sidebarNotch) : null;
  const sidebarTab = asideSize && sidebarNotch ? rightNotchFill(asideSize.w, asideSize.h, 24, sidebarNotch) : null;

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

  // The phone bar's orange pill slides between its five buttons the same way; the pages inside More don't have one
  // of their own (More holds it for them).
  const barRef = useRef<HTMLDivElement>(null);
  const barKey = isMoreActive ? "more" : pathname;
  const [barItem, setBarItem] = useTween<{ left: number; width: number; top: number; height: number }>();
  const [barSize, setBarSize] = useState<{ w: number; h: number } | null>(null);
  const barReadyRef = useRef(false);
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const place = (glide: boolean) => {
      setBarSize(bar.offsetWidth ? { w: bar.offsetWidth, h: bar.offsetHeight } : null);
      const item = bar.querySelector<HTMLElement>(`[data-bar-key="${barKey}"]`);
      setBarItem(item && item.offsetWidth ? { left: item.offsetLeft, width: item.offsetWidth, top: item.offsetTop, height: item.offsetHeight } : null, glide);
    };
    place(barReadyRef.current);
    barReadyRef.current = true;
    const observer = new ResizeObserver(() => place(false));
    observer.observe(bar);
    return () => observer.disconnect();
  }, [barKey, setBarItem]);
  const barNotch = barItem && { left: barItem.left, right: barItem.left + barItem.width, bottom: barItem.top + barItem.height };
  const barPath = barSize ? topNotchPath(barSize.w, barSize.h, 24, barNotch) : null;
  const barTab = barSize && barNotch ? topNotchFill(barSize.w, barSize.h, 24, barNotch) : null;

  return (
    <>
    {/* A card floating over the page's left side: away from the window's edges, rounded, with a soft shadow. The
        page runs on under it to the window's edge, so its grey bands reach there too. */}
    {asideSize && sidebarPath && (
      <svg
        aria-hidden
        className="print:hidden hidden md:block fixed top-4 left-4 z-50 pointer-events-none overflow-visible"
        width={asideSize.w}
        height={asideSize.h}
        style={{ filter: "drop-shadow(0 10px 18px color-mix(in srgb, var(--ink) 10%, transparent))" }}
      >
        <path d={sidebarPath} className="fill-card stroke-line" strokeWidth={1} />
        {sidebarTab && <path d={sidebarTab} className="fill-accent-soft" />}
      </svg>
    )}
    <aside ref={asideRef} className={`print:hidden rounded-3xl fixed top-4 bottom-4 left-4 hidden md:flex flex-col shrink-0 overflow-y-auto overflow-x-hidden z-50 transition-all duration-300 ${isCollapsed ? "w-20" : "w-64"}`}>
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
        {showLabels && (
          <Link href="/" className="cursor-pointer hover:opacity-80 transition flex-shrink-0 overflow-hidden">
            <h1 className="text-2xl font-extrabold text-ink tracking-tight whitespace-nowrap">
              Trade<span className="text-accent">Journal</span>
            </h1>
          </Link>
        )}
      </div>

      {/* Every page, Settings last (right after Statement). */}
      <nav className={`flex-1 space-y-2 ${isCollapsed ? "px-2" : "px-4"}`}>
        {navItems.map((item) => {
          const isActive = selected === item.href;
          const Icon = item.icon;
          return (
            <Link key={item.name} href={item.href} onClick={() => setSelected(item.href)} title={isCollapsed ? item.name : undefined}>
              <button
                data-nav-href={item.href}
                className={`relative flex items-center transition-all w-full text-left rounded-xl ${
                  isCollapsed ? "justify-center h-11 px-0" : "gap-3 px-4 h-11"
                } ${
                  isActive
                    ? "text-accent font-bold"
                    : "text-ink-muted hover:text-ink hover:bg-surface font-semibold"
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isCollapsed && isActive ? "scale-110" : ""}`} />
                {showLabels && <span className="whitespace-nowrap overflow-hidden">{item.name}</span>}
              </button>
            </Link>
          );
        })}
      </nav>

      {/* Import above Privacy Mode, both in boxes, at the bottom. */}
      <div className={`px-4 py-2 mt-auto flex flex-col gap-2 ${isCollapsed ? "items-center" : ""}`}>
        <button
          title="Import & Backup"
          onClick={() => setIsUploadModalOpen(true)}
          className={`relative bg-accent hover:bg-accent-strong text-white border border-transparent rounded-lg text-sm font-bold transition shadow-sm flex items-center justify-center gap-2 ${
            isCollapsed ? "w-10 h-10 p-0 shrink-0" : "w-full h-10 px-4"
          }`}
        >
          <Upload className="w-4 h-4 shrink-0" />
          {showLabels && <span>Import</span>}
          <BackupDueDot />
        </button>
        <button
          title={isPrivacyMode ? "Show Data" : "Privacy Mode"}
          onClick={() => setIsPrivacyMode(!isPrivacyMode)}
          className={`flex items-center justify-center gap-2 text-sm font-bold rounded-lg transition shadow-sm border ${
            isPrivacyMode
              ? 'bg-accent-soft text-accent border-accent-line'
              : 'bg-card border-line text-ink-muted hover:border-accent-line hover:text-accent'
          } ${isCollapsed ? "w-10 h-10 p-0 shrink-0" : "w-full h-10 px-4"}`}
        >
          {isPrivacyMode ? <EyeOff className="w-4 h-4 shrink-0" /> : <Eye className="w-4 h-4 shrink-0" />}
          {showLabels && <span>Privacy Mode</span>}
        </button>
      </div>

      {/* The Google account in use, as a round photo; pressing it opens Settings at the Account tab. */}
      <div className="mx-4 border-t border-line-soft" />
      <div className={`pt-3 pb-4 ${isCollapsed ? "px-2 flex justify-center" : "px-4"}`}>
        <button
          type="button"
          onClick={openAccount}
          title={shortName}
          className={`flex items-center rounded-xl transition hover:bg-surface ${isCollapsed ? "p-1" : "w-full gap-3 px-2 py-1.5 text-left"}`}
        >
          {user?.photoURL && !photoFailed ? (
            // Google's photo server refuses some requests that carry the page's address, hence no-referrer.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photoURL}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setPhotoFailed(true)}
              className="w-9 h-9 rounded-full object-cover shrink-0 border border-line"
            />
          ) : (
            <span className="w-9 h-9 rounded-full shrink-0 bg-accent-soft text-accent font-bold flex items-center justify-center">
              {(user?.displayName || user?.email || "?").charAt(0).toUpperCase()}
            </span>
          )}
          {showLabels && (
            <span className="min-w-0">
              <span className="block text-sm font-bold text-ink truncate">{shortName}</span>
            </span>
          )}
        </button>
      </div>
    </aside>

    {isMoreOpen && (
      <div className="md:hidden print:hidden fixed inset-0 z-40 bg-stone-900/50" onClick={() => setIsMoreOpen(false)}>
        <div
          className="absolute inset-x-0 bottom-0 bg-card rounded-t-3xl px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] shadow-2xl"
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
    <nav className="md:hidden print:hidden fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 rounded-3xl">
      {barSize && barPath && (
        <svg
          aria-hidden
          className="absolute inset-0 pointer-events-none overflow-visible"
          width={barSize.w}
          height={barSize.h}
          style={{ filter: "drop-shadow(0 10px 18px color-mix(in srgb, var(--ink) 14%, transparent))" }}
        >
          <path d={barPath} className="fill-card stroke-line" strokeWidth={1} />
          {barTab && <path d={barTab} className="fill-accent-soft" />}
        </svg>
      )}
      {/* The page being shown sits in a light orange notch that slides, as in the sidebar. */}
      {/* px-9 keeps the first and last buttons clear of the bar's rounded ends, so their notch has room. */}
      <div ref={barRef} className="relative grid grid-cols-5 h-14 py-1.5 px-9 gap-1">
        {mobilePrimary.map((item) => {
          const isActive = !isMoreOpen && pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setIsMoreOpen(false)}
              data-bar-key={item.href}
              aria-label={item.name}
              title={item.name}
              className={`relative flex items-center justify-center rounded-2xl transition ${
                isActive ? "text-accent" : "text-ink-faint"
              }`}
            >
              {/* Icons only: the bar is a single row of five, names would crowd it. */}
              <Icon className="w-5 h-5" />
            </Link>
          );
        })}
        <button
          onClick={() => setIsMoreOpen(!isMoreOpen)}
          data-bar-key="more"
          aria-label="More"
          title="More"
          className={`relative flex items-center justify-center rounded-2xl transition ${
            isMoreActive ? "text-accent" : "text-ink-faint"
          }`}
        >
          <Ellipsis className="w-5 h-5" />
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
