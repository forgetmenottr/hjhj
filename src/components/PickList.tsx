import { useState } from "react";
import type { Pick, Schedule } from "../lib/solver";
import { groupIdOf, isFull, itemLabel } from "../lib/view/format";
import { relaxedViolations } from "../lib/view/summary";
import { courseColor } from "./courseColor";
import { Badge, Button, Card, InfoIcon, LockIcon, ToggleButton, UnlockIcon } from "./ui";

export interface PickActions {
  /** Lock (true) or unlock (false) the pick's group. */
  onToggleLock: (courseCode: string, groupId: string, lock: boolean) => void;
  /** "Đã đầy — tìm nhóm khác": exclude the key, keep the other picks, re-run. */
  onMarkFull: (key: string) => void;
}

/** Step 4: the chosen group of each course, with "Giữ nhóm này" and "Đã đầy — tìm nhóm khác". */
export function PickList({
  schedule,
  relaxed,
  courseNames,
  locked,
  autoLocked,
  onToggleLock,
  onMarkFull,
}: PickActions & {
  schedule: Schedule;
  relaxed: string[];
  courseNames: Record<string, string>;
  locked: Record<string, string>;
  autoLocked: string[];
}) {
  // Key whose "equivalent group" hint is open, waiting for confirmation.
  const [confirming, setConfirming] = useState<string | null>(null);
  const broken = relaxedViolations(schedule, relaxed);

  return (
    <Card>
      <h3 className="font-semibold">Nhóm đã chọn</h3>
      <p className="mt-1 text-sm text-ctp-subtext">
        “Giữ nhóm này” để luôn chọn nhóm đó khi xếp lại. Khi đăng ký mà nhóm đã đầy, bấm “Đã đầy” để tìm nhóm khác mà vẫn giữ nguyên các môn còn lại.
      </p>
      <ul className="mt-3 divide-y divide-ctp-surface0">
        {schedule.picks.map((pick, i) => (
          <PickRow
            key={pick.courseCode}
            pick={pick}
            colorIndex={i}
            courseName={courseNames[pick.courseCode] ?? ""}
            isLocked={locked[pick.courseCode] === pick.group.group.id}
            isAuto={autoLocked.includes(pick.group.key)}
            broken={broken.filter((v) => v.courses.includes(pick.courseCode)).map((v) => v.item)}
            confirming={confirming === pick.group.key}
            onConfirm={(open) => setConfirming(open ? pick.group.key : null)}
            onToggleLock={onToggleLock}
            onMarkFull={onMarkFull}
          />
        ))}
      </ul>
    </Card>
  );
}

function PickRow({
  pick,
  colorIndex,
  courseName,
  isLocked,
  isAuto,
  broken,
  confirming,
  onConfirm,
  onToggleLock,
  onMarkFull,
}: PickActions & {
  pick: Pick;
  colorIndex: number;
  courseName: string;
  isLocked: boolean;
  isAuto: boolean;
  /** Relaxed requirements this pick breaks. */
  broken: string[];
  confirming: boolean;
  onConfirm: (open: boolean) => void;
}) {
  const group = pick.group.group;
  const key = pick.group.key;
  const alternatives = pick.alternatives.map(groupIdOf);
  const context = ` (${pick.courseCode} ${group.id})`;
  const proceed = () => {
    onConfirm(false);
    onMarkFull(key);
  };
  // With equivalent groups, first say that one of them can be registered instead.
  const onFull = () => (alternatives.length > 0 ? onConfirm(!confirming) : proceed());

  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0" style={courseColor(colorIndex)} data-pick={key}>
      <span className="course-dot mt-1.5 size-3 shrink-0 rounded-full" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="truncate">
          <span className="font-semibold">{pick.courseCode}</span>
          <span className="text-ctp-subtext"> · {courseName}</span>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-2">
          <span className="font-mono text-base font-bold">{group.id}</span>
          <span className="text-ctp-subtext">
            {group.registered}/{group.capacity}
          </span>
          {isFull(group) && <Badge tone="red">Đầy</Badge>}
          <Badge tone={group.language === "TA" ? "blue" : "neutral"}>{group.language}</Badge>
          {isLocked && (
            <Badge tone="mauve">
              <LockIcon className="size-3.5" />
              {isAuto ? "Khoá tự động" : "Đã khoá"}
            </Badge>
          )}
          {broken.map((item) => (
            <Badge key={item} tone="peach">
              ⚠ {itemLabel(item)}
            </Badge>
          ))}
        </p>
        {alternatives.length > 0 && <p className="mt-0.5 text-ctp-subtext">hoặc {alternatives.join(", ")}</p>}

        <div className="mt-2 flex flex-wrap gap-2">
          <ToggleButton
            pressed={isLocked}
            onClick={() => onToggleLock(pick.courseCode, group.id, !isLocked)}
            aria-label={`Giữ nhóm này${context}`}
            className="px-3"
          >
            {isLocked ? <LockIcon className="size-4" /> : <UnlockIcon className="size-4" />}
            Giữ nhóm này
          </ToggleButton>
          <Button
            variant="secondary"
            onClick={onFull}
            aria-expanded={alternatives.length > 0 ? confirming : undefined}
            aria-label={`Đã đầy — tìm nhóm khác${context}`}
            className="px-3"
          >
            Đã đầy — tìm nhóm khác
          </Button>
        </div>

        {confirming && (
          <div className="mt-2 rounded-xl border border-ctp-blue/40 bg-ctp-blue/10 p-3">
            <p className="flex gap-2">
              <InfoIcon className="size-5 shrink-0 text-ctp-blue" />
              <span>
                Có thể đăng ký nhóm tương đương: <strong className="font-mono">{alternatives.join(", ")}</strong> (cùng giờ học, cùng
                điều kiện). Nếu tìm lại, lịch mới sẽ tự chọn nhóm đó.
              </span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="primary" onClick={proceed}>
                Tìm nhóm khác
              </Button>
              <Button variant="ghost" onClick={() => onConfirm(false)}>
                Huỷ
              </Button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
