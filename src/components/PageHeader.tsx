import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// Every page starts with this title line, the first thing inside the page's `space-y-6` wrapper.
// It is always one 36px line: title on the left, the page's buttons or figures on the right,
// so the first card sits 24px below it on every page (32/92px from the top on a computer, 16/76px on a phone).
// Nothing in it wraps to a second line; on phones its buttons shrink to icons (HeaderButton).
export default function PageHeader({ title, shortTitle, children }: {
  title: string;
  // Shown instead of `title` on phones when the full title would push the buttons onto a second line.
  shortTitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 h-9">
      <h2 className="text-3xl font-extrabold text-ink tracking-tight whitespace-nowrap">
        {shortTitle ? <><span className="md:hidden">{shortTitle}</span><span className="hidden md:inline">{title}</span></> : title}
      </h2>
      {children && <div className="flex items-center gap-2 md:gap-4 shrink-0">{children}</div>}
    </div>
  );
}

const VARIANTS = {
  // The page's main action.
  primary: 'bg-accent hover:bg-accent-strong disabled:bg-orange-200 text-white border border-transparent shadow-sm',
  // A second action beside a primary one.
  secondary: 'bg-surface-2 hover:bg-stone-200 disabled:opacity-50 text-stone-600 border border-transparent',
  // A lighter action in the orange family.
  outline: 'bg-white hover:bg-accent-soft disabled:opacity-50 text-accent border border-accent-line shadow-sm',
  // A small extra action, such as "+".
  plain: 'bg-white border border-line hover:border-orange-300 hover:text-accent disabled:opacity-50 text-ink-muted shadow-sm',
};

// A title-line button: icon and label on a computer, the icon alone (36px square) on a phone.
// The label stays as its tooltip and accessible name, so give buttons on one page icons that tell them apart.
export function HeaderButton({ icon: Icon, phoneIcon: PhoneIcon, label, title, variant = 'secondary', iconOnly = false, className = '', onClick, disabled, children }: {
  icon: LucideIcon;
  // A different icon for the phone, when the computer icon alone would not tell two buttons apart.
  phoneIcon?: LucideIcon;
  label: string;
  title?: string;
  variant?: keyof typeof VARIANTS;
  // An icon on every screen, for an action that needs no words (such as "+").
  iconOnly?: boolean;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={label}
      className={`relative h-9 w-9 ${iconOnly ? '' : 'md:w-auto md:px-4'} rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    >
      {PhoneIcon ? <><PhoneIcon className="md:hidden w-4 h-4" /><Icon className="hidden md:block w-4 h-4" /></> : <Icon className="w-4 h-4" />}
      {!iconOnly && <span className="hidden md:inline">{label}</span>}
      {children}
    </button>
  );
}
