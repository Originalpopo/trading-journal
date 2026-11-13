"use client";

import { useLayoutEffect, useRef, useState } from "react";

// A row of buttons where one is chosen, on a grey strip: a white pill sits behind the chosen one and slides over to
// the one picked. Every such choice in the app uses it: the Performance chart measure (W/L, RR...), the Dashboard's
// chart range, the Notes period, the Simulation setup.
export default function SlidingSwitch<T extends string>({ options, value, onChange, label, buttonClass = "min-w-10 px-2.5" }: {
  options: readonly { value: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string; // for screen readers, e.g. "Chart range"
  buttonClass?: string; // width and padding of each button
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  // No slide on the first placing (or after a resize): the pill appears in place.
  const [canSlide, setCanSlide] = useState(false);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const place = () => {
      const button = strip.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(value)}"]`);
      if (button) setPill({ left: button.offsetLeft, width: button.offsetWidth });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(strip);
    const frame = requestAnimationFrame(() => setCanSlide(true));
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [value]);

  return (
    <div ref={stripRef} className="relative flex bg-surface-2 p-0.5 rounded-lg shrink-0" role="group" aria-label={label}>
      {pill && (
        <span
          aria-hidden
          className={`absolute top-0.5 bottom-0.5 rounded-md bg-card shadow-sm ${canSlide ? "transition-[left,width] duration-300 ease-out motion-reduce:transition-none" : ""}`}
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          data-value={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          title={o.title}
          className={`relative h-7 ${buttonClass} text-[11px] font-bold rounded-md transition-colors ${
            value === o.value ? "text-ink" : "text-ink-faint hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
