import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// The site's buttons (see "Shared pieces" in AGENTS.md). The title line keeps its own HeaderButton.
const VARIANTS = {
  // The one main action of a card or popup: Save, Import, Run.
  primary: "bg-accent hover:bg-accent-strong disabled:bg-accent-line text-white",
  // A second action beside it: Cancel, Close, Back.
  secondary: "bg-surface-2 hover:bg-line disabled:opacity-50 text-ink-muted",
  // A lighter action in the orange family.
  outline: "bg-card hover:bg-accent-soft disabled:opacity-50 text-accent border border-accent-line",
  // Something that deletes or clears.
  danger: "bg-loss-soft hover:bg-card disabled:opacity-50 text-loss border border-loss-line",
  // A small extra action on a white card, such as "Add".
  plain: "bg-card hover:border-accent-line hover:text-accent disabled:opacity-50 text-ink-muted border border-line shadow-card",
};

const SIZES = {
  // In a card or popup.
  md: "px-5 py-2.5 rounded-box text-body gap-2",
  // In a strip of filters or a table row.
  sm: "h-8 px-3 rounded-control text-small gap-1.5",
};

export default function Button({ variant = "secondary", size = "md", icon: Icon, className = "", children, type = "button", ...rest }: {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  icon?: LucideIcon;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center font-bold transition disabled:cursor-not-allowed ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {Icon && <Icon className={size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} />}
      {children}
    </button>
  );
}

// A button that is only an icon: close (X), edit, delete, arrows. `label` is its tooltip and accessible name.
// sm: in a table row · md: on a card · lg: a popup's close (X) at its top right
const ICON_SIZES = {
  sm: { pad: "p-1", icon: "w-3.5 h-3.5" },
  md: { pad: "p-1.5", icon: "w-4 h-4" },
  lg: { pad: "p-1", icon: "w-6 h-6" },
};

export function IconButton({ icon: Icon, label, size = "md", className = "", type = "button", ...rest }: {
  icon: LucideIcon;
  label: string;
  size?: keyof typeof ICON_SIZES;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button
      type={type}
      title={label}
      aria-label={label}
      className={`inline-flex items-center justify-center rounded-tag text-ink-faint hover:text-ink hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition ${ICON_SIZES[size].pad} ${className}`}
      {...rest}
    >
      <Icon className={ICON_SIZES[size].icon} />
    </button>
  );
}
