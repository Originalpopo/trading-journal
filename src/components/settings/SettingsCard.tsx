"use client";

import { useId, useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

// The white card every Settings group sits in: icon, title and a line on what it is for. It starts folded to
// its header (the line cut to one row) and opens with a click on the header; any number can be open at once.
// A folded card keeps its contents, so an unsaved edit is still there when it is opened again.
export default function SettingsCard({ icon: Icon, title, description, children }: {
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const bodyId = useId();
  return (
    <div className="bg-white rounded-2xl shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        aria-expanded={isOpen}
        aria-controls={bodyId}
        className="w-full flex items-center gap-3 p-5 md:px-8 text-left rounded-2xl hover:bg-surface transition-colors"
      >
        <div className="w-10 h-10 shrink-0 rounded-xl bg-accent-soft flex items-center justify-center">
          <Icon className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-ink">{title}</h3>
          <p className={`text-sm text-ink-muted font-medium ${isOpen ? "" : "line-clamp-1"}`}>{description}</p>
        </div>
        <ChevronDown className={`w-5 h-5 shrink-0 text-ink-faint transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      <div id={bodyId} hidden={!isOpen} className="px-5 pb-5 md:px-8 md:pb-8">
        <div className="pt-6 border-t border-line-soft">{children}</div>
      </div>
    </div>
  );
}

export const SETTINGS_INPUT = "w-full bg-surface border border-line rounded-xl px-4 py-3 text-sm font-bold text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-line transition placeholder:font-medium";
