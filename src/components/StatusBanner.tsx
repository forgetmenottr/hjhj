import type { ReactNode, Ref } from "react";
import { diagnosticText, timeWarningText } from "../app/messages";
import type { SolveOutcome, SolverStatus } from "../app/state";
import type { SolverDiagnostic } from "../lib/solver";
import { itemLabel } from "../lib/view/format";
import { AlertIcon, Button, CheckIcon, InfoIcon, RefreshIcon, Spinner } from "./ui";

type Tone = "green" | "peach" | "red" | "yellow" | "neutral";

const TONES: Record<Tone, string> = {
  green: "border-ctp-green/40 bg-ctp-green/10",
  peach: "border-ctp-peach/40 bg-ctp-peach/10",
  red: "border-ctp-red/40 bg-ctp-red/10",
  yellow: "border-ctp-yellow/40 bg-ctp-yellow/10",
  neutral: "border-ctp-surface1 bg-ctp-mantle",
};

function Banner({ tone, icon, title, children }: { tone: Tone; icon: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className={`rounded-2xl border p-4 ${TONES[tone]}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          <p className="font-semibold">{title}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Solver diagnostics, in Vietnamese (the library's English text if a code is unknown). */
function Diagnostics({ items }: { items: SolverDiagnostic[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="text-ctp-subtext">Chi tiết từ bộ xếp lịch:</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 break-words">
        {items.map((item, i) => (
          <li key={i}>{diagnosticText(item)}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Running / error / ok / relaxed / infeasible, plus a "stale" notice. Announced
 * politely; focusable (tabIndex -1) so focus can land here when the control
 * that started a re-run disappears.
 */
export function StatusBanner({
  ref,
  status,
  outcome,
  error,
  stale,
  hasAutoLocks,
  quiet = false,
  onCancel,
  onRerun,
  onUndoAutoLocks,
}: {
  ref?: Ref<HTMLDivElement>;
  status: SolverStatus;
  outcome: SolveOutcome | null;
  error: string | null;
  stale: boolean;
  /** Some locks were added by "Đã đầy"; an infeasible result then offers to drop them. */
  hasAutoLocks: boolean;
  /** Step 5: only running / error / nothing-fits are worth a banner there. */
  quiet?: boolean;
  onCancel: () => void;
  onRerun: () => void;
  onUndoAutoLocks: () => void;
}) {
  const result = outcome?.result;
  const details = result?.diagnosticDetails;
  let main: ReactNode = null;

  if (status === "running") {
    main = (
      <Banner tone="neutral" icon={<Spinner className="size-5 text-ctp-mauve" />} title="Đang xếp lịch…">
        <Button variant="secondary" onClick={onCancel}>
          Huỷ
        </Button>
      </Banner>
    );
  } else if (status === "error") {
    main = (
      <Banner tone="red" icon={<AlertIcon className="size-5 text-ctp-red" />} title="Không xếp được lịch">
        <p>{error}</p>
        <Button variant="secondary" onClick={onRerun}>
          <RefreshIcon className="size-4" /> Chạy lại
        </Button>
      </Banner>
    );
  } else if (quiet && result?.status !== "infeasible") {
    main = null;
  } else if (result?.status === "ok") {
    main = (
      <Banner tone="green" icon={<CheckIcon className="size-5 text-ctp-green" />} title={`Tìm được ${result.schedules.length} lịch không trùng giờ, đáp ứng mọi yêu cầu bắt buộc.`}>
        <Diagnostics items={details} />
      </Banner>
    );
  } else if (result?.status === "relaxed") {
    main = (
      <Banner tone="peach" icon={<AlertIcon className="size-5 text-ctp-peach" />} title="Không thể đáp ứng mọi yêu cầu bắt buộc cùng lúc.">
        <p>
          Các yêu cầu sau đã tạm chuyển thành ưu tiên (bị trừ điểm rất nặng nếu vi phạm):{" "}
          <strong>{result.relaxed.map(itemLabel).join(", ")}</strong>. Lịch vi phạm có dấu ⚠ trên thẻ lịch; chi tiết ở phần điểm.
        </p>
        <Diagnostics items={details} />
      </Banner>
    );
  } else if (result?.status === "infeasible" && hasAutoLocks) {
    main = (
      <Banner tone="red" icon={<AlertIcon className="size-5 text-ctp-red" />} title="Không tìm được nhóm thay thế khi giữ nguyên các môn khác">
        <p>Các môn còn lại đang được giữ nguyên nhóm (khoá tự động khi bạn bấm “Đã đầy”), và không còn nhóm nào khác của môn này xếp vừa.</p>
        <Button variant="primary" onClick={onUndoAutoLocks}>
          <RefreshIcon className="size-4" /> Thử lại, không giữ các môn khác
        </Button>
        <Diagnostics items={details} />
      </Banner>
    );
  } else if (result?.status === "infeasible") {
    main = (
      <Banner tone="red" icon={<AlertIcon className="size-5 text-ctp-red" />} title="Không có lịch nào phù hợp.">
        <p>Mọi cách chọn nhóm đều bị trùng giờ hoặc bị loại. Hãy bỏ bớt nhóm đã khoá / đã loại, bớt yêu cầu hoặc đổi môn.</p>
        <Diagnostics items={details} />
      </Banner>
    );
  } else {
    main = (
      <Banner tone="neutral" icon={<InfoIcon className="size-5 text-ctp-subtext" />} title="Chưa có kết quả.">
        <p className="text-ctp-subtext">Bấm “Xếp lịch” ở bước 3 để bắt đầu.</p>
      </Banner>
    );
  }

  return (
    <div ref={ref} tabIndex={-1} role="status" aria-live="polite" className="space-y-3 focus:outline-none">
      {main}
      {stale && !quiet && status !== "running" && (
        <Banner tone="yellow" icon={<InfoIcon className="size-5 text-ctp-yellow" />} title="Kết quả đã cũ — chạy lại">
          <p>Danh sách môn hoặc yêu cầu đã thay đổi sau lần xếp lịch này.</p>
          <Button variant="primary" onClick={onRerun}>
            <RefreshIcon className="size-4" /> Chạy lại
          </Button>
        </Banner>
      )}
      {!quiet && outcome && outcome.maskWarnings.length > 0 && (
        <Banner tone="yellow" icon={<AlertIcon className="size-5 text-ctp-yellow" />} title="Cảnh báo khi dựng lịch">
          <ul className="list-disc space-y-1 pl-5">
            {outcome.maskWarnings.map((w, i) => (
              <li key={i}>
                {w.courseCode}
                {w.groupId && ` ${w.groupId}`} — {timeWarningText(w)}
              </li>
            ))}
          </ul>
        </Banner>
      )}
    </div>
  );
}
