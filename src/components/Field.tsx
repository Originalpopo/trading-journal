import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// The site's fields (see "Shared pieces" in AGENTS.md). On a phone every field is 16px (globals.css), so iPhone
// doesn't zoom in on it.
const SIZES = {
  // A form: Settings, Add Entry, the Simulation setup.
  md: "w-full bg-surface border border-line rounded-box px-4 py-3 text-body font-bold focus:ring-2 focus:ring-accent-line placeholder:font-semibold",
  // A strip of filters or a table row.
  sm: "h-8 bg-card border border-line rounded-control px-2.5 text-small font-bold shadow-card",
};
const BASE = "text-ink placeholder:text-ink-disabled focus:outline-none focus:border-accent transition disabled:opacity-50";

export const fieldClass = (size: keyof typeof SIZES = "md") => `${BASE} ${SIZES[size]}`;

export function Input({ size = "md", className = "", ...rest }: { size?: keyof typeof SIZES } & Omit<InputHTMLAttributes<HTMLInputElement>, "size">) {
  return <input className={`${fieldClass(size)} ${className}`} {...rest} />;
}

export function Select({ size = "md", className = "", children, ...rest }: { size?: keyof typeof SIZES; children: ReactNode } & Omit<SelectHTMLAttributes<HTMLSelectElement>, "size">) {
  return <select className={`${fieldClass(size)} cursor-pointer ${className}`} {...rest}>{children}</select>;
}

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${fieldClass("md")} font-semibold resize-none ${className}`} {...rest} />;
}

// A field's name above it, in small spaced capitals, with an optional note under the field.
export function FieldLabel({ label, note, children }: { label: string; note?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-label font-bold text-ink-faint uppercase tracking-widest">{label}</span>
      {children}
      {note && <span className="block text-small font-semibold text-ink-faint">{note}</span>}
    </label>
  );
}
