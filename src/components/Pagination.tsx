"use client";

// Page buttons under a long table, as on the History page: Prev, the first and last page, the ones around the
// current page (with "..." between), Next. Nothing when everything fits on one page.
export default function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
  if (pageCount <= 1) return null;
  const items: React.ReactNode[] = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || (i >= page - 1 && i <= page + 1)) {
      items.push(
        <button key={i} type="button" onClick={() => onChange(i)} aria-current={i === page ? "page" : undefined}
          className={`px-3 py-1.5 border border-line rounded-lg text-[11px] font-bold ${i === page ? "bg-accent text-white" : "text-ink-muted hover:bg-surface"}`}>
          {i}
        </button>
      );
    } else if (i === page - 2 || i === page + 2) {
      items.push(<span key={`dots-${i}`} className="px-2 text-ink-disabled">...</span>);
    }
  }
  return (
    <div className="flex flex-wrap justify-center gap-1">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page === 1}
        className="px-3 py-1.5 border border-line rounded-lg text-[11px] font-bold text-ink-muted disabled:opacity-50">Prev</button>
      {items}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page === pageCount}
        className="px-3 py-1.5 border border-line rounded-lg text-[11px] font-bold text-ink-muted disabled:opacity-50">Next</button>
    </div>
  );
}
