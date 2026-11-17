import type { ReactNode } from "react";

// The site's card: white, a thin border, the card corner and the resting shadow (see "Shared pieces" in AGENTS.md).
//   normal  — a card holding a section of a page (20px inside on a phone, 24px on a computer)
//   compact — a small card in a grid of figures (16px)
//   none    — a card whose content sets its own room, such as a wide table or the calendar
const PADDING = { normal: "p-5 md:p-6", compact: "p-4", none: "" };
type Padding = keyof typeof PADDING;

export const cardClass = (extra = "", padding: Padding = "normal") =>
  `bg-card border border-line rounded-card shadow-card ${PADDING[padding]} ${extra}`.trim();

export default function Card({ padding = "normal", className = "", children }: {
  padding?: Padding;
  className?: string;
  children?: ReactNode;
}) {
  return <div className={cardClass(className, padding)}>{children}</div>;
}

// A card's title: an orange dot and the name in small spaced capitals. `className` for its margin or place in a row.
export function CardTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={`text-small font-black text-ink uppercase tracking-[0.2em] flex items-center gap-2 ${className}`}>
      <span className="w-2 h-2 bg-accent rounded-full shrink-0" />
      {children}
    </h3>
  );
}
