# Trading Journal Project Guidelines

<!-- BEGIN:nextjs-agent-rules -->
## Next.js Guidelines
This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## UI Guidelines
- **Color Palette**:
  - Main Orange: Always use `orange-400` (e.g. สีส้มหลัก)
  - Main Red: Always use `red-900` (e.g. สีแดงหลัก)
- **Checklists**: When rendering Checklists in the UI (e.g. popups, details), always use this styling convention:
  - Selected state: Orange theme (`bg-orange-50`, `text-orange-400`, `border-orange-200`) with a Check icon (e.g. `CheckCircle2`).
  - Unselected state: Light stone theme (`bg-stone-50`, `text-stone-400`, `border-stone-200`, `opacity-70`) with a Cross icon (e.g. `XCircle`).
- **Checklist items**: The only checklist item recorded is "On Plan" (`CHECKLIST_NAMES` in `src/lib/checklists.ts`). Older trades may still carry retired tags (Follow, Reversal, Entry 1st, Entry 2nd) in their data; keep them untouched and don't show them.
- **Page title line (every page, including new ones)**: Start the page with `<PageHeader title="...">` from `src/components/PageHeader.tsx` as the first child of the page's `space-y-6` wrapper. Do not hand-build the title row or add margins around it.
  - Its height is fixed (one 36px line), so the first card always starts 24px below it: 32px / 92px from the top on a computer, 16px / 76px on a phone. Every page must measure the same.
  - It never wraps to a second line, on any screen, unless the user asks for that on a given page. If a long title would push the buttons down on a phone, pass `shortTitle` (e.g. "Statement").
  - Buttons on the right use `<HeaderButton>`: icon + label from `md` up, the icon alone (36px square) on a phone. Give each button on a page an icon that tells it apart from the others (use `phoneIcon` when two share the desktop icon). `variant`: `primary` (orange, the main action), `secondary` (grey), `outline` (orange border), `plain` (white, e.g. "+").
  - Figures or status on the right (Calendar's month figures, the weather icons) must also fit the line on a phone: show fewer or one at a time rather than wrapping.
  - Check new or changed pages at 390px and desktop before handing them over.
- **Checklists in History Table**: Every checklist item has a unique Lucide icon ("On Plan" uses `ClipboardCheck`). The History table's "On Plan" column renders the icon of each item in `CHECKLIST_NAMES` side by side.
  - If a checklist is selected for that trade, render its specific icon in orange (`text-orange-400`).
  - If a checklist is not selected, render its specific icon in a muted color (`text-stone-300`).

