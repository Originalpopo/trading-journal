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
  - No see-through versions of these (`/50`, `/60`...), except the dark backdrop behind a popup (`stone-900/50`), a loading veil over content (`bg-surface/50`), a coloured shadow or glow (`shadow-accent/20`, a soft glow around the Active DD gauge or the target flame), and the small baht line under a dollar figure in a table: `font-normal text-ink-faint opacity-70` (not bold), the same for real baht and ≈ estimates.
  - Charts draw on a canvas and can't use the utilities: they get the colours from `themeColor(name, alpha?)` in `src/lib/themeColors.ts` (never a hex or rgba written in), so a theme changes them too. Faded only to these levels: lines 45%, their labels 70%, hatching 35%, the Balance grey `rgba(0,0,0,0.03)`.
- **Text (every page, including new ones)**: seven text styles, each for one job, named in `src/app/globals.css` (`--text-*` in `@theme`, used as `text-label`, `text-figure` ...). New code uses only these names, never `text-xs/sm/lg...` or `text-[10px]`; every page uses them since 2026-11-17. All of them are shown at `/design` (a hidden page, no menu link).

  | Job | Name | Size | Usually written with |
  |---|---|---|---|
  | Page title, the most prominent figure | `text-display` | 30px | `font-black tracking-tight` |
  | A big figure in a card | `text-figure` | 24px | `font-black tracking-tight` |
  | A card's or popup's title | `text-title` | 18px | `font-black` |
  | Main text, buttons, tabs | `text-body` | 14px | `font-bold` / `font-semibold` |
  | Table text, secondary text | `text-small` | 12px | `font-bold` / `font-semibold` |
  | Small notes, the label inside a small button | `text-caption` | 11px | `font-bold` / `font-semibold` |
  | The small capitals above a figure, table heads | `text-label` | 10px | `font-bold uppercase tracking-widest` |

  - A name gives the size and line height only. Write the weight and letter spacing beside it, as in the last column, so the same job looks the same everywhere.
  - Weights: only `font-normal`, `font-semibold`, `font-bold`, `font-black` (no `font-medium`, `font-extrabold`).
  - One weight per element: don't add a `font-*` to a class string that already has one (e.g. a shared `TD` constant); the winner would be decided by CSS order, not by the code.
  - Phone fields stay 16px (the rule in globals.css that stops iPhone zooming in); don't fight it.
- **Corners (every page, including new ones)**: five corner names, each for one job, in `src/app/globals.css` (`--radius-*`), plus Tailwind's `rounded-full` for circles, bars and pills. The bigger the thing, the rounder. Never `rounded`, `rounded-sm/md/lg/xl/2xl/3xl` or `rounded-[..]`; a side form uses the same names (`rounded-tl-box`, `rounded-t-popup`).

  | Job | Name | Corner |
  |---|---|---|
  | Small badges (SL/TP, LIMIT), small buttons in a strip, small fields in a table, check boxes | `rounded-tag` | 6px |
  | Title-line buttons, selects, page numbers, the sliding switch | `rounded-control` | 8px |
  | Big buttons (Save, Cancel), tabs, fields, a box inside a card, dropdown menus | `rounded-box` | 12px |
  | A card on the page, a panel inside a popup | `rounded-card` | 20px |
  | Popups, the side menu | `rounded-popup` | 24px |

  - One exception: the side menu's page buttons keep `rounded-2xl` (16px), the shape the menu's notch was drawn around.
- **Shadows (every page, including new ones)**: only two, both soft (the user doesn't like sharp or spread-out shadows), in `src/app/globals.css` (`--shadow-*`). Never `shadow-sm/md/lg/xl/2xl` or a written-out `shadow-[..]`.

  | Job | Name |
  |---|---|
  | Resting on the page: cards, buttons and fields on the page, the sliding switch's pill | `shadow-card` |
  | Lifted above it: the main button (Save), the chosen tab, dropdown menus, chart balloons, popups | `shadow-raised` |

  - A colour class beside one tints it (`shadow-raised shadow-accent-line` under the orange Save button); that is the only way to colour a shadow.
  - Kept as they are, as effects rather than shadows: the glows around the Active DD gauge and the target flame, the line under the Import table's sticky head, the Balance grey in Performance, the well of the DD gauge (`shadow-inner`), and the weather icon's `drop-shadow-md`.
- **Shared pieces (every page, including new ones)**: cards, buttons and fields come from three files; don't hand-build them. All are shown at `/design` (Pieces tab).
  - `src/components/Card.tsx`: `<Card>` or `className={cardClass("extra", padding)}` for a card (white, `border-line`, `rounded-card`, `shadow-card`). Padding `normal` (20px on a phone, 24px from md, the default), `compact` (16px, small figure cards) or `none` (the content sets its own, e.g. a wide table or the calendar). `<CardTitle>` for the orange-dot title in small spaced capitals.
  - `src/components/Button.tsx`: `<Button variant size icon>`. Variants: `primary` (orange, the one main action: Save, Import, Start), `secondary` (grey: Cancel, Close, Back), `outline` (orange border), `danger` (deletes or clears), `plain` (white extra action). Sizes: `md` in a card or popup, `sm` in a filter strip or table row. `<IconButton icon label size>` for icon-only buttons; `lg` is a popup's close (X). Orange buttons have no orange shadow. The title line keeps `HeaderButton`, tabs `PillTabs`, choices `SlidingSwitch`.
  - `src/components/Field.tsx`: `<Input>`, `<Select>`, `<Textarea>`, or `fieldClass(size)` on a hand-written field. `md` for forms (grey, `rounded-box`), `sm` for a filter strip (white, `rounded-control`). `<FieldLabel>` for the small-capitals name above a field.
  - Left as they are, being special controls rather than these pieces: the calendar's day cells, table-row edit/delete icons, the History bulk-edit strip, filter chips, pagination, the side menu, the PIN pad, the History/Performance filter selects that are full-width on a phone, the Notes search box (icon inside), and the Add Entry popup's fields (the md field with `px-3`, so XAUUSD and SELL fit on a phone).
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

