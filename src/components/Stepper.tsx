import type { Step } from "../app/state";
import { STEP_LABELS } from "../lib/view/format";
import { CheckIcon } from "./ui";

const STEPS: Step[] = [1, 2, 3, 4, 5];

/** 1 Dán dữ liệu · 2 Kiểm tra · 3 Yêu cầu · 4 Kết quả · 5 Đăng ký. Disabled steps cannot be entered yet. */
export function Stepper({ current, enabled, onSelect }: { current: Step; enabled: (step: Step) => boolean; onSelect: (step: Step) => void }) {
  return (
    <nav aria-label="Các bước">
      <ol className="grid grid-cols-5 gap-1 md:gap-3">
        {STEPS.map((step) => {
          const active = step === current;
          const done = step < current;
          return (
            <li key={step}>
              <button
                type="button"
                onClick={() => onSelect(step)}
                disabled={!active && !enabled(step)}
                aria-current={active ? "step" : undefined}
                className="group flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 text-center disabled:cursor-not-allowed md:flex-row md:gap-2 md:px-3 md:text-left"
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                    active
                      ? "bg-ctp-mauve text-ctp-crust"
                      : done
                        ? "bg-ctp-surface1 text-ctp-text group-hover:bg-ctp-surface2"
                        : "border border-ctp-surface2 text-ctp-subtext group-enabled:group-hover:border-ctp-mauve"
                  }`}
                >
                  {done ? <CheckIcon className="size-4" /> : step}
                </span>
                <span className={`text-xs leading-tight md:text-sm ${active ? "font-semibold text-ctp-text" : "text-ctp-subtext"}`}>
                  {STEP_LABELS[step]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
