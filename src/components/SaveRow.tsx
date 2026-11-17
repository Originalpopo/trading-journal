import { Save, type LucideIcon } from "lucide-react";
import Button from "@/components/Button";

// The site's standard Save button for a card of fields on a page (see AGENTS.md), at its bottom right.
// Hidden, with the card's bottom edge pulled up, until something in the card is changed; then the
// edge slides down and the button appears.
// `canSave` is false while a changed value isn't valid yet (e.g. a 3-digit PIN).
export default function SaveRow({ isDirty, canSave = true, isSaving, onSave, onCancel, submit = false, label = "Save", busyLabel = "Saving...", icon = Save }: {
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
            <Button variant="secondary" onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
          )}
          <Button
            variant="primary"
            icon={icon}
            type={submit ? "submit" : "button"}
            onClick={submit ? undefined : onSave}
            disabled={isSaving || !canSave}
          >
            {isSaving ? busyLabel : label}
          </Button>
        </div>
      </div>
    </div>
  );
}
