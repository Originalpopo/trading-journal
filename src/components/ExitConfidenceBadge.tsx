import { AlertTriangle } from "lucide-react";
import type { ExitTimeConfidence } from "@/store/useJournalStore";

// Flags exit times that did not come straight from the broker data.
export default function ExitConfidenceBadge({ confidence }: { confidence?: ExitTimeConfidence }) {
  if (confidence === 'estimated') {
    return <span title="Exit time estimated from a TP/SL placed after entry" className="text-[9px] font-bold text-stone-400">≈ est.</span>;
  }
  if (confidence === 'uncertain') {
    return (
      <span title="The broker data has no reliable exit time for this trade (SL hit with no TP). Check it and edit the exit time by hand." className="inline-flex items-center gap-0.5 text-[9px] font-bold text-red-900">
        <AlertTriangle className="w-3 h-3" /> check
      </span>
    );
  }
  return null;
}
