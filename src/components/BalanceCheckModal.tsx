"use client";

import { useState } from "react";
import { X, CheckCircle2, AlertTriangle } from "lucide-react";
import SaveRow from "./SaveRow";
import { useJournalStore } from "@/store/useJournalStore";
import { reconcileBalance, localTimestamp, toCheckRecord } from "@/lib/reconcile";
import { hasFractionOfCent } from "@/lib/money";
import { formatNumber } from "@/lib/utils";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { IconButton } from "@/components/Button";
import { fieldClass } from "@/components/Field";

interface BalanceCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
}


// The user types the balance the broker shows; the journal's own balance at that moment must equal it.
export default function BalanceCheckModal({ isOpen, onClose }: BalanceCheckModalProps) {
  const trades = useJournalStore(state => state.trades);
  const funding = useJournalStore(state => state.funding);
  const savedCheck = useJournalStore(state => state.preferences.balanceCheck);
  const history = useJournalStore(state => state.preferences.balanceCheckHistory);
  const saveBalanceCheck = useJournalStore(state => state.saveBalanceCheck);

  const [balance, setBalance] = useState("");
  const [time, setTime] = useState(() => localTimestamp());
  const [isSaving, setIsSaving] = useState(false);

  useEscapeToClose(isOpen, onClose);

  if (!isOpen) return null;

  const parsedBalance = parseFloat(balance);
  const hasMoreThanCents = hasFractionOfCent(balance);
  const isValid = Number.isFinite(parsedBalance) && !hasMoreThanCents && !!time;
  const checkTime = time.length === 16 ? `${time}:00` : time;
  const result = isValid ? reconcileBalance({ time: checkTime, balance: parsedBalance }, trades, funding) : null;
  const savedResult = savedCheck ? reconcileBalance(savedCheck, trades, funding) : null;

  const handleSave = async () => {
    if (!isValid) return;
    setIsSaving(true);
    try {
      await saveBalanceCheck(toCheckRecord({ time: checkTime, balance: parsedBalance }, trades, funding));
      setBalance("");
      onClose();
    } catch {
      alert("Failed to save the balance check.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-[100] p-4 animate-fadeIn" onClick={onClose}>
      <div className="bg-card border-0 rounded-popup w-full max-w-md p-6 md:p-8 shadow-raised relative" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-line-soft">
          <h3 className="text-figure font-black text-ink tracking-tight">Check against broker</h3>
          <IconButton icon={X} label="Close" size="lg" onClick={onClose} />
        </div>

        <p className="text-small text-ink-muted font-semibold mb-5">
          กรอกยอด <span className="font-bold text-ink">Balance</span> ที่โบรกเกอร์แสดงตอนนี้ (ไม่ใช่ Equity ซึ่งรวมเทรดที่ยังเปิดอยู่)
          ระบบจะรวมเงินฝาก เงินถอน และกำไรขาดทุนของทุกเทรดจนถึงเวลานั้น สองยอดต้องตรงกันถึงเซนต์
        </p>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-label font-bold text-ink-faint uppercase tracking-widest mb-1">Broker balance ($)</label>
            <input type="number" step="0.01" autoFocus value={balance} onChange={(e) => setBalance(e.target.value)}
              className={fieldClass("md")} />
          </div>
          <div>
            <label className="block text-label font-bold text-ink-faint uppercase tracking-widest mb-1">As of</label>
            <input type="datetime-local" step="1" value={time} onChange={(e) => setTime(e.target.value)}
              className={fieldClass("md")} />
          </div>
        </div>

        {hasMoreThanCents && (
          <p className="text-small font-bold text-loss mb-5">Enter the balance with at most two decimals.</p>
        )}

        {result && (
          <div className={`rounded-box border p-4 mb-5 ${result.matches ? 'bg-accent-soft border-accent-line' : 'bg-loss-soft border-loss-line'}`}>
            <div className="flex justify-between text-small font-bold text-ink-muted">
              <span>Journal balance ({result.tradeCount} trades)</span>
              <span className="text-ink">${formatNumber(result.journalBalance)}</span>
            </div>
            <div className="flex justify-between text-small font-bold text-ink-muted mt-1">
              <span>Broker balance</span>
              <span className="text-ink">${formatNumber(result.brokerBalance)}</span>
            </div>
            <div className={`flex items-center gap-2 mt-3 pt-3 border-t text-body font-black ${result.matches ? 'text-accent border-accent-line' : 'text-loss border-loss-line'}`}>
              {result.matches ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {result.matches
                ? 'ตรงกับโบรกเกอร์ถึงเซนต์'
                : `ยอดใน journal ${result.difference > 0 ? 'สูงกว่า' : 'ต่ำกว่า'}โบรกเกอร์ $${formatNumber(Math.abs(result.difference))}`}
            </div>
            {!result.matches && (
              <p className="text-caption font-semibold text-loss mt-2">
                {result.difference > 0
                  ? 'ลองหา: เทรดที่ขาดทุนหรือการถอนเงินที่ยังไม่ได้ลงใน journal, เทรดที่ลงซ้ำ 2 ครั้ง, หรือค่าธรรมเนียม/ค่า swap ที่โบรกเกอร์หักไป'
                  : 'ลองหา: เทรดที่กำไรหรือการฝากเงินที่ยังไม่ได้ลงใน journal, หรือการถอนเงินที่ลงซ้ำ 2 ครั้ง'}
              </p>
            )}
          </div>
        )}

        {savedCheck && savedResult && (
          <p className="text-caption font-semibold text-ink-faint mb-3">
            Last saved check: ${formatNumber(savedCheck.balance)} as of {savedCheck.time.replace('T', ' ')} ·{' '}
            {savedResult.matches ? 'matches' : `off by $${formatNumber(Math.abs(savedResult.difference))}`}
          </p>
        )}

        {history && history.length > 0 && (
          <div className="mb-5">
            <p className="text-label font-bold text-ink-faint uppercase tracking-widest mb-1">History ({history.length})</p>
            <div className="max-h-32 overflow-y-auto border border-line-soft rounded-control divide-y divide-line-soft">
              {[...history].reverse().map((h, i) => (
                <div key={`${h.time}-${i}`} className="flex items-center justify-between px-3 py-1.5 text-caption font-semibold text-ink-muted">
                  <span>{h.time.replace('T', ' ')}</span>
                  <span className="text-ink">${formatNumber(h.balance)}</span>
                  <span className={h.difference === 0 ? 'text-accent' : 'text-loss'}>
                    {h.difference === 0 ? 'matched' : `journal ${h.difference > 0 ? '+' : '-'}$${formatNumber(Math.abs(h.difference))}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <SaveRow isDirty={balance.trim() !== ""} canSave={isValid} isSaving={isSaving} onSave={handleSave} />
      </div>
    </div>
  );
}
