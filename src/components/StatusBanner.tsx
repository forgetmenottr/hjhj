import type { ReactNode } from "react";
import type { SolveOutcome, SolverStatus } from "../app/state";
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

/** Solver diagnostics come from the library (in English) and are shown as-is. */
function Diagnostics({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div>
      <p className="text-ctp-subtext">Chi tiết từ bộ xếp lịch:</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 break-words">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

/** Running / error / ok / relaxed / infeasible, plus a "stale" notice. Announced politely. */
export function StatusBanner({
  status,
  outcome,
  error,
  stale,
  onCancel,
  onRerun,
}: {
  status: SolverStatus;
  outcome: SolveOutcome | null;
  error: string | null;
  stale: boolean;
  onCancel: () => void;
  onRerun: () => void;
}) {
  const result = outcome?.result;
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
  } else if (result?.status === "ok") {
    main = (
      <Banner tone="green" icon={<CheckIcon className="size-5 text-ctp-green" />} title={`Tìm được ${result.schedules.length} lịch không trùng giờ, đáp ứng mọi yêu cầu bắt buộc.`}>
        <Diagnostics lines={result.diagnostics} />
      </Banner>
    );
  } else if (result?.status === "relaxed") {
    main = (
      <Banner tone="peach" icon={<AlertIcon className="size-5 text-ctp-peach" />} title="Không thể đáp ứng mọi yêu cầu bắt buộc cùng lúc.">
        <p>
          Các yêu cầu sau đã tạm chuyển thành ưu tiên (bị trừ điểm rất nặng nếu vi phạm):{" "}
          <strong>{result.relaxed.map(itemLabel).join(", ")}</strong>. Xem mục “Vi phạm” của từng lịch.
        </p>
        <Diagnostics lines={result.diagnostics} />
      </Banner>
    );
  } else if (result?.status === "infeasible") {
    main = (
      <Banner tone="red" icon={<AlertIcon className="size-5 text-ctp-red" />} title="Không có lịch nào phù hợp.">
        <p>Mọi cách chọn nhóm đều bị trùng giờ hoặc bị loại. Hãy bớt yêu cầu hoặc đổi môn.</p>
        <Diagnostics lines={result.diagnostics} />
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
    <div role="status" aria-live="polite" className="space-y-3">
      {main}
      {stale && status !== "running" && (
        <Banner tone="yellow" icon={<InfoIcon className="size-5 text-ctp-yellow" />} title="Kết quả đã cũ — chạy lại">
          <p>Danh sách môn hoặc yêu cầu đã thay đổi sau lần xếp lịch này.</p>
          <Button variant="primary" onClick={onRerun}>
            <RefreshIcon className="size-4" /> Chạy lại
          </Button>
        </Banner>
      )}
      {outcome && outcome.maskWarnings.length > 0 && (
        <Banner tone="yellow" icon={<AlertIcon className="size-5 text-ctp-yellow" />} title="Cảnh báo khi dựng lịch">
          <ul className="list-disc space-y-1 pl-5">
            {outcome.maskWarnings.map((w, i) => (
              <li key={i}>
                {w.courseCode}
                {w.groupId && `:${w.groupId}`} — {w.message}
              </li>
            ))}
          </ul>
        </Banner>
      )}
    </div>
  );
}
