# Trading Journal Project Guidelines

<!-- BEGIN:nextjs-agent-rules -->
## Next.js Guidelines
This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## UI Guidelines
- **Color Palette**:
  - Main Orange: Always use `orange-400` (e.g. สีส้มหลัก)
  - Main Red: Always use `red-900` (e.g. สีแดงหลัก)
- **Colours (every page, including new ones)**: three colour families (orange, red, stone grey) plus white, and only the shades below, each for one job. They are named by job in `src/app/globals.css` (`:root` variables, Tailwind utilities like `text-accent`), so a theme can later change them in one place. New code uses the job names; existing pages are being moved over one page at a time, each checked before/after on a computer and at 390px.

  | Job | Name (utility) | Today |
  |---|---|---|
  | Main colour: good side (profit, TP, on plan), main button, the open page | `accent` | `orange-400` |
  | A main-colour button being pointed at (only this) | `accent-strong` | `orange-500` |
  | Light background: the chosen item, a highlighted box | `accent-soft` | `orange-50` |
  | That box's border | `accent-line` | `orange-200` |
  | Bad side: loss, SL, drawdown | `loss` | `red-900` |
  | Its light background / border | `loss-soft` / `loss-line` | `red-50` / `red-200` |
  | Main text, figures, titles | `ink` | `stone-950` |
  | Secondary text, descriptions | `ink-muted` | `stone-500` |
  | Small labels, icons not chosen | `ink-faint` | `stone-400` |
  | Turned off or empty | `ink-disabled` | `stone-300` |
  | Card borders, dividers | `line` | `stone-200` |
  | Light dividers inside a card (rows of a list) | `line-soft` | `stone-100` (same shade as `surface-2`) |
  | A well inside a card (the empty part of a bar) | `surface-2` | `stone-100` |
  | The page, a grey box | `surface` | `stone-50` |
  | Cards | `card` | `white` |

  - No other shades (no `orange-100/300`, `red-400/800/950`, `stone-600/700/800/900`) and no other families (no `slate`, `gray`, green, blue...).
  - No see-through versions of these (`/50`, `/60`...), except the dark backdrop behind a popup (`stone-900/50`), and the small baht line under a dollar figure in a table: `font-normal text-ink-faint opacity-70` (not bold), the same for real baht and ≈ estimates.
  - Charts draw on a canvas and can't use the utilities: they take the same colours, faded only to these levels: lines 45%, their labels 70%, hatching 35%, the Balance grey `rgba(0,0,0,0.03)`.
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
- **Save button in a card of fields (every page, including new ones)**: Use `<SaveRow>` from `src/components/SaveRow.tsx` as the last child of the card. Do not hand-build a Save button for a card.
  - It stays hidden, with the card's bottom edge pulled up, until a value in that card is changed. Then the edge slides down and an active orange "Save" button appears at the bottom right. Changing the value back to what is saved hides it again.
  - Pass `isDirty` (something differs from what is saved), `canSave` (the changed value is valid; while false the button shows faded and can't be pressed), `isSaving`, and `onSave` (or `submit` inside a `<form>`; don't put the form in `space-y-*`, or the hidden row still leaves a gap).
  - The label is just "Save" ("Saving..." while saving), never "Save Settings" or similar. One card, one Save button. When the action is not saving, pass `label`/`icon` for it (e.g. "Import" in the Import & Backup popup).
  - Popups with fields use it too (Add Entry, the Import paste box). The popup's X closes without asking. A popup where typing a little and changing one's mind is common (the day/week note) passes `onCancel`, which shows a Cancel button beside Save, appearing and hiding with it; other popups have no Cancel.
- **Tabs (Settings, the Add Entry popup, and any new ones)**: Use `<PillTabs>` from `src/components/PillTabs.tsx`, not an accordion. Each tab has its own icon; on a phone the tabs show the icon only and share the row equally. Pass `onWhite` when the bar sits on a white card or popup.
- **Checklists in History Table**: Every checklist item has a unique Lucide icon ("On Plan" uses `ClipboardCheck`). The History table's "On Plan" column renders the icon of each item in `CHECKLIST_NAMES` side by side.
  - If a checklist is selected for that trade, render its specific icon in orange (`text-orange-400`).
  - If a checklist is not selected, render its specific icon in a muted color (`text-stone-300`).

