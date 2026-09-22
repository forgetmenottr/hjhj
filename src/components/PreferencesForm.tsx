import { useId, useState, type ReactNode } from "react";
import type { Day } from "../lib/parser";
import type { Mode, Preferences } from "../lib/solver";
import { ALL_DAYS, DAY_SHORT } from "../lib/view/format";
import { Button, Card, RefreshIcon } from "./ui";

type Update = (edit: (draft: Preferences) => void) => void;

/** Step 3: group-level constraints (Tắt / Bắt buộc / Ưu tiên) and soft weights. */
export function PreferencesForm({
  prefs,
  onChange,
  onReset,
}: {
  prefs: Preferences;
  onChange: (prefs: Preferences) => void;
  onReset: () => void;
}) {
  const update: Update = (edit) => {
    const draft = structuredClone(prefs);
    edit(draft);
    onChange(draft);
  };
  const toggle = <T,>(list: T[], item: T): T[] => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-semibold">Yêu cầu về nhóm lớp</h2>
        <p className="mt-1 text-sm text-ctp-subtext">
          <strong className="text-ctp-peach">Bắt buộc</strong>: loại nhóm không đạt (nếu không xếp được, yêu cầu tạm chuyển thành ưu tiên).{" "}
          <strong className="text-ctp-blue">Ưu tiên</strong>: vẫn chọn được nhưng bị trừ điểm.
        </p>
      </Card>

      <ConstraintCard title="Cơ sở" hint="Mọi buổi học của nhóm phải ở cơ sở đã chọn." mode={prefs.campuses.mode} onMode={(m) => update((d) => { d.campuses.mode = m; })}>
        <div className="flex flex-wrap gap-2">
          {([1, 2] as const).map((c) => (
            <CheckChip key={c} checked={prefs.campuses.allowed.includes(c)} onChange={() => update((d) => { d.campuses.allowed = toggle(d.campuses.allowed, c); })}>
              CS{c} · {c === 1 ? "Lý Thường Kiệt" : "Dĩ An"}
            </CheckChip>
          ))}
        </div>
      </ConstraintCard>

      <ConstraintCard title="Ngày nghỉ" hint="Nhóm không có buổi học nào vào các ngày được chọn." mode={prefs.daysOff.mode} onMode={(m) => update((d) => { d.daysOff.mode = m; })}>
        <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Ngày muốn nghỉ">
          {ALL_DAYS.map((day: Day) => {
            const on = prefs.daysOff.days.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                onClick={() => update((d) => { d.daysOff.days = toggle(d.daysOff.days, day).sort((a, b) => a - b); })}
                className={`min-h-11 rounded-lg text-sm font-semibold transition-colors ${on ? "bg-ctp-mauve text-ctp-crust" : "bg-ctp-surface0 text-ctp-text hover:bg-ctp-surface1"}`}
              >
                {DAY_SHORT[day]}
              </button>
            );
          })}
        </div>
      </ConstraintCard>

      <ConstraintCard title="Ngôn ngữ" hint="Chỉ chọn nhóm dạy bằng ngôn ngữ được chọn." mode={prefs.language.mode} onMode={(m) => update((d) => { d.language.mode = m; })}>
        <div className="flex flex-wrap gap-2">
          {[
            ["V", "Tiếng Việt"],
            ["TA", "Tiếng Anh"],
          ].map(([code, name]) => (
            <CheckChip key={code} checked={prefs.language.allowed.includes(code)} onChange={() => update((d) => { d.language.allowed = toggle(d.language.allowed, code); })}>
              {code} · {name}
            </CheckChip>
          ))}
        </div>
      </ConstraintCard>

      <ConstraintCard title="Còn chỗ trống" hint="Chỉ chọn nhóm có số đăng ký nhỏ hơn sĩ số." mode={prefs.freeSeats.mode} onMode={(m) => update((d) => { d.freeSeats.mode = m; })} />

      <ConstraintCard
        title="Tránh giảng viên"
        hint="Không chọn nhóm có giảng viên (lý thuyết hoặc thí nghiệm) trùng tên. Không phân biệt hoa thường, có dấu hay không dấu."
        mode={prefs.avoidLecturers.mode}
        onMode={(m) => update((d) => { d.avoidLecturers.mode = m; })}
      >
        <LecturerNames names={prefs.avoidLecturers.names} onChange={(names) => update((d) => { d.avoidLecturers.names = names; })} />
      </ConstraintCard>

      <Card>
        <h2 className="text-lg font-semibold">Mức độ mong muốn</h2>
        <p className="mt-1 text-sm text-ctp-subtext">0 = không quan tâm, 10 = rất quan trọng.</p>
        <div className="mt-4 space-y-5">
          <div>
            <TimeOfDaySelect prefs={prefs} update={update} />
            <WeightSlider
              label="Mức độ cho buổi ưu tiên"
              value={prefs.weights.timeOfDay.weight}
              disabled={prefs.weights.timeOfDay.prefer === "none"}
              onChange={(v) => update((d) => { d.weights.timeOfDay.weight = v; })}
            />
          </div>
          <WeightSlider label="Ít ngày lên trường" value={prefs.weights.fewerDays} onChange={(v) => update((d) => { d.weights.fewerDays = v; })} />
          <WeightSlider label="Lịch gọn (ít tiết trống giữa các buổi)" value={prefs.weights.compactDays} onChange={(v) => update((d) => { d.weights.compactDays = v; })} />
          <WeightSlider label="Không đổi cơ sở trong ngày" value={prefs.weights.noCampusSwitch} onChange={(v) => update((d) => { d.weights.noCampusSwitch = v; })} />
          <WeightSlider label="Tránh tiết 1–2" value={prefs.weights.avoidEarly} onChange={(v) => update((d) => { d.weights.avoidEarly = v; })} />
          <WeightSlider label="Mức ưu tiên cho yêu cầu “Ưu tiên”" value={prefs.weights.preferredItems} onChange={(v) => update((d) => { d.weights.preferredItems = v; })} />
        </div>
        <div className="mt-5 flex justify-end">
          <Button variant="secondary" onClick={onReset}>
            <RefreshIcon className="size-4" />
            Khôi phục mặc định
          </Button>
        </div>
      </Card>
    </div>
  );
}

const MODES: { value: Mode; label: string; checked: string }[] = [
  { value: "off", label: "Tắt", checked: "has-checked:bg-ctp-surface2 has-checked:text-ctp-text" },
  { value: "required", label: "Bắt buộc", checked: "has-checked:bg-ctp-peach has-checked:text-ctp-crust" },
  { value: "preferred", label: "Ưu tiên", checked: "has-checked:bg-ctp-blue has-checked:text-ctp-crust" },
];

function ConstraintCard({
  title,
  hint,
  mode,
  onMode,
  children,
}: {
  title: string;
  hint: string;
  mode: Mode;
  onMode: (mode: Mode) => void;
  children?: ReactNode;
}) {
  const name = useId();
  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-0.5 text-sm text-ctp-subtext">{hint}</p>
        </div>
        <fieldset className="shrink-0">
          <legend className="sr-only">Chế độ cho “{title}”</legend>
          <div className="grid grid-cols-3 rounded-xl bg-ctp-base p-1">
            {MODES.map((m) => (
              <label
                key={m.value}
                className={`flex min-h-10 cursor-pointer items-center justify-center rounded-lg px-3 text-sm font-semibold text-ctp-subtext hover:text-ctp-text has-focus-visible:outline-2 has-focus-visible:outline-ctp-lavender ${m.checked}`}
              >
                <input type="radio" name={name} value={m.value} checked={mode === m.value} onChange={() => onMode(m.value)} className="sr-only" />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      {children && <div className={`mt-3 transition-opacity ${mode === "off" ? "opacity-75" : ""}`}>{children}</div>}
    </Card>
  );
}

function CheckChip({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-ctp-surface0 px-3 text-sm hover:bg-ctp-surface1 has-checked:bg-ctp-surface1 has-focus-visible:outline-2 has-focus-visible:outline-ctp-lavender">
      <input type="checkbox" checked={checked} onChange={onChange} className="size-4" />
      {children}
    </label>
  );
}

/** Names, one per line (commas also split). Keeps the typed text so a trailing comma or newline is not eaten. */
function LecturerNames({ names, onChange }: { names: string[]; onChange: (names: string[]) => void }) {
  const id = useId();
  const split = (text: string) => text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const [draft, setDraft] = useState(names.join("\n"));
  // Resync when names change from outside (e.g. "Khôi phục mặc định").
  if (split(draft).join("\n") !== names.join("\n")) setDraft(names.join("\n"));
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        Tên giảng viên (mỗi dòng một tên)
      </label>
      <textarea
        id={id}
        rows={3}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(split(e.target.value));
        }}
        placeholder="Nguyễn Văn A"
        className="mt-1 w-full rounded-xl border border-ctp-surface1 bg-ctp-base p-3 text-sm focus:border-ctp-mauve"
      />
    </div>
  );
}

function TimeOfDaySelect({ prefs, update }: { prefs: Preferences; update: Update }) {
  const id = useId();
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        Buổi ưu tiên
      </label>
      <select
        id={id}
        value={prefs.weights.timeOfDay.prefer}
        onChange={(e) => update((d) => { d.weights.timeOfDay.prefer = e.target.value as Preferences["weights"]["timeOfDay"]["prefer"]; })}
        className="min-h-11 rounded-lg border border-ctp-surface1 bg-ctp-base px-3 text-sm"
      >
        <option value="none">Không</option>
        <option value="morning">Sáng (tiết 1–6)</option>
        <option value="afternoon">Chiều (tiết 7–12)</option>
      </select>
    </div>
  );
}

function WeightSlider({ label, value, onChange, disabled = false }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className={disabled ? "opacity-60" : ""}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm">
          {label}
        </label>
        <output htmlFor={id} className="w-8 rounded-md bg-ctp-surface0 text-center text-sm font-semibold tabular-nums">
          {value}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-11 w-full cursor-pointer disabled:cursor-not-allowed"
      />
    </div>
  );
}
