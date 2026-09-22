import { RELAX_WEIGHT, type Schedule, type Violation } from "../lib/solver";
import { itemLabel, percent } from "../lib/view/format";
import { preferredViolations, relaxedViolations } from "../lib/view/summary";
import { AlertIcon, InfoIcon } from "./ui";

/**
 * Broken relaxed requirements first (warning), then item / metric / weight /
 * penalty, then the "Ưu tiên" items that were not met.
 */
export function ScoreBreakdown({ schedule, relaxed }: { schedule: Schedule; relaxed: string[] }) {
  const broken = relaxedViolations(schedule, relaxed);
  const missed = preferredViolations(schedule, relaxed);
  return (
    <div className="space-y-3">
      {broken.length > 0 && (
        <ViolationBox
          tone="peach"
          title="Vi phạm yêu cầu bắt buộc (đã nới)"
          note="Không có lịch nào đáp ứng hết nên các yêu cầu này đã được nới. Các môn sau không đạt:"
          violations={broken}
        />
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Chi tiết điểm phạt</caption>
          <thead className="text-xs text-ctp-subtext">
            <tr>
              <th scope="col" className="py-2 pr-2 font-medium">Tiêu chí</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Mức vi phạm</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Trọng số</th>
              <th scope="col" className="py-2 pl-2 text-right font-medium">Điểm phạt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ctp-surface0">
            {schedule.breakdown.map((row) => (
              <tr key={row.item} className={row.weight === 0 ? "text-ctp-subtext" : ""}>
                <th scope="row" className="py-2 pr-2 font-normal">
                  {itemLabel(row.item)}
                  {row.weight === RELAX_WEIGHT && <span className="ml-1 text-xs text-ctp-peach">(bắt buộc, đã nới)</span>}
                </th>
                <td className="px-2 py-2 text-right tabular-nums">{percent(row.metric)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{row.weight}</td>
                <td className="py-2 pl-2 text-right tabular-nums">{row.penalty.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-ctp-surface1 font-semibold">
              <th scope="row" colSpan={3} className="py-2 pr-2 text-left">
                Tổng điểm phạt
              </th>
              <td className="py-2 pl-2 text-right tabular-nums">{schedule.penalty.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {missed.length > 0 && <ViolationBox tone="blue" title="Chưa đạt ưu tiên" violations={missed} />}
    </div>
  );
}

function ViolationBox({ tone, title, note, violations }: { tone: "peach" | "blue"; title: string; note?: string; violations: Violation[] }) {
  const look = tone === "peach" ? "border-ctp-peach/40 bg-ctp-peach/10 text-ctp-peach" : "border-ctp-blue/40 bg-ctp-blue/10 text-ctp-blue";
  const Icon = tone === "peach" ? AlertIcon : InfoIcon;
  return (
    <div className={`rounded-xl border p-3 text-sm ${look}`}>
      <p className="flex items-center gap-2 font-semibold">
        <Icon className="size-4 shrink-0" />
        {title}
      </p>
      {note && <p className="mt-1 text-ctp-text">{note}</p>}
      <ul className="mt-1 space-y-0.5 text-ctp-text">
        {violations.map((v) => (
          <li key={v.item}>
            <span className="font-semibold">{itemLabel(v.item)}</span>: {v.courses.join(", ")}
          </li>
        ))}
      </ul>
    </div>
  );
}
