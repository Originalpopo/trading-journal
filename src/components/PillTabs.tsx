import type { LucideIcon } from "lucide-react";

export interface PillTab<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
}

// The site's tab bar (Settings, the Add Entry popup): orange pill for the open tab, icon + label
// from `md` up and the icon alone on a phone. `onWhite` for a bar on a white card or popup.
export default function PillTabs<T extends string>({ tabs, value, onChange, onWhite = false, className = "" }: {
  tabs: readonly PillTab<T>[];
  value: T;
  onChange: (id: T) => void;
  onWhite?: boolean;
  className?: string;
}) {
  return (
    <div role="tablist" className={`flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] ${className}`}>
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          aria-label={label}
          title={label}
          onClick={() => onChange(id)}
          ref={value === id ? (el) => el?.scrollIntoView({ block: "nearest", inline: "nearest" }) : undefined}
          className={`flex-1 md:flex-none shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition whitespace-nowrap ${
            value === id
              ? "bg-accent text-white shadow-md shadow-accent-line"
              : onWhite
                ? "bg-surface-2 text-ink-muted hover:text-accent"
                : "bg-white text-ink-muted hover:text-accent shadow-sm"
          }`}
        >
          <Icon className="w-4 h-4" />
          <span className="hidden md:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
