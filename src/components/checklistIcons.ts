import { ClipboardCheck, type LucideIcon } from "lucide-react";
import { CHECKLIST_NAMES } from "@/lib/checklists";

// The icon of each checklist item, shared by every place that draws one.
export const CHECKLIST_ICONS: Record<(typeof CHECKLIST_NAMES)[number], LucideIcon> = {
  'On Plan': ClipboardCheck,
};
