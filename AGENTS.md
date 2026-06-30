<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## UI Guidelines
- **Checklists**: When rendering Checklists in the UI (e.g. popups, details), always use this styling convention:
  - Selected state: Orange theme (`bg-orange-50`, `text-orange-400`, `border-orange-200`) with a Check icon (e.g. `CheckCircle2`).
  - Unselected state: Light stone theme (`bg-stone-50`, `text-stone-400`, `border-stone-200`, `opacity-70`) with a Cross icon (e.g. `XCircle`).
- **Checklists in History Table**: When a new checklist item is introduced to the system, it must be assigned a unique Lucide icon. The "Checklists" column in the History table must render the icons for all available checklists horizontally side-by-side.
  - If a checklist is selected for that trade, render its specific icon in orange (`text-orange-400`).
  - If a checklist is not selected, render its specific icon in a muted color (`text-stone-300`).
