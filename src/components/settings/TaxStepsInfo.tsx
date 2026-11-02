import { Landmark } from "lucide-react";
import { THAI_TAX_STEPS } from "@/lib/taxReport";
import { formatNumber } from "@/lib/utils";
import SettingsCard from "./SettingsCard";

const baht = (n: number) => formatNumber(n).replace(/\.00$/, "");

// The tax steps the Tax Report's estimate uses. Shown, not editable, so the estimate can't drift by accident.
export default function TaxStepsInfo() {
  const rows = THAI_TAX_STEPS.map(([upper, rate], i) => ({ from: i === 0 ? 0 : THAI_TAX_STEPS[i - 1][0], upper, rate }));

  return (
    <SettingsCard
      icon={Landmark}
      title="Tax Steps"
      description="อัตราภาษีเงินได้บุคคลธรรมดาแบบขั้นบันได ที่ Tax Report ใช้คำนวณช่อง Est. tax (ประมาณการเพื่อกันเงินไว้ ไม่ใช่ยอดยื่นจริง) ดูได้อย่างเดียว"
    >
      <div className="overflow-hidden border border-stone-100 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-400">
            <tr>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest">Net income (฿)</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest">Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-50">
            {rows.map(({ from, upper, rate }) => (
              <tr key={upper}>
                <td className="px-4 py-2.5 font-semibold text-stone-600 tabular-nums">
                  {upper === Infinity ? `over ${baht(from)}` : `${baht(from === 0 ? 0 : from + 1)} – ${baht(upper)}`}
                </td>
                <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${rate === 0 ? "text-orange-400" : "text-stone-950"}`}>
                  {rate === 0 ? "exempt" : `${Math.round(rate * 100)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SettingsCard>
  );
}
