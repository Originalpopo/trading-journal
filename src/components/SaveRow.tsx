import { Save, type LucideIcon } from "lucide-react";

export const CANCEL_BUTTON = "px-6 py-2.5 bg-surface-2 hover:bg-line text-ink-muted font-bold rounded-xl transition";
export const SAVE_BUTTON = "px-6 py-2.5 bg-accent hover:bg-accent-strong disabled:bg-accent-line text-white font-bold rounded-xl transition shadow-lg shadow-accent-line flex items-center gap-2";

// The site's standard Save button for a card of fields on a page (see AGENTS.md), at its bottom right.
// Hidden, with the card's bottom edge pulled up, until something in the card is changed; then the
// edge slides down and the button appears.
// `canSave` is false while a changed value isn't valid yet (e.g. a 3-digit PIN).
export default function SaveRow({ isDirty, canSave = true, isSaving, onSave, onCancel, submit = false, label = "Save", busyLabel = "Saving...", icon: Icon = Save }: {
  isDirty: boolean;
  canSave?: boolean;
  isSaving: boolean;
  onSave?: () => void;
  submit?: boolean; // a form's submit button instead of onSave
  onCancel?: () => void; // a Cancel button beside Save, for throwing away what was typed
  label?: string; // "Save" unless the action is something else, e.g. "Import"
  busyLabel?: string;
  icon?: LucideIcon;
}) {
  const isOpen = isDirty || isSaving;
  return (
    <div inert={!isOpen} className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
      <div className="overflow-hidden">
        <div className={`flex justify-end gap-3 pt-6 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0"}`}>
          {onCancel && (
            <button type="button" onClick={onCancel} disabled={isSaving} className={CANCEL_BUTTON}>
              Cancel
            </button>
          )}
          <button
            type={submit ? "submit" : "button"}
            onClick={submit ? undefined : onSave}
            disabled={isSaving || !canSave}
            className={SAVE_BUTTON}
          >
            <Icon className="w-4 h-4" />
            {isSaving ? busyLabel : label}
          </button>
        </div>
      </div>
    </div>
  );
}
