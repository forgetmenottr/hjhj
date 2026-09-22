import { RELAX_WEIGHT, type Schedule } from "../lib/solver";
import { itemLabel, percent } from "../lib/view/format";

/** Item / metric / weight / penalty, then the violated constraints. */
export function ScoreBreakdown({ schedule }: { schedule: Schedule }) {
  return (
    <div className="space-y-3">
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
      {schedule.violations.length > 0 && (
        <div className="rounded-xl bg-ctp-red/10 p-3 text-sm">
          <p className="font-semibold text-ctp-red">Vi phạm</p>
          <ul className="mt-1 space-y-0.5">
            {schedule.violations.map((v) => (
              <li key={v.item}>
                {itemLabel(v.item)}: {v.courses.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
