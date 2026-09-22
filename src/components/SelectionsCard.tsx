import { splitKey } from "../app/selection";
import { BanIcon, Button, Card, CloseIcon, LockIcon } from "./ui";

/**
 * "Đã khoá / Đã loại": locked and excluded groups grouped by course, each a
 * chip with a remove (×) button, plus "Bỏ tất cả". Used on step 3, and on
 * step 4 when nothing fits.
 */
export function SelectionsCard({
  locked,
  excluded,
  autoLocked,
  courseNames,
  onUnlock,
  onUnexclude,
  onClear,
}: {
  locked: Record<string, string>;
  excluded: string[];
  autoLocked: string[];
  courseNames: Record<string, string>;
  onUnlock: (courseCode: string) => void;
  onUnexclude: (key: string) => void;
  onClear: () => void;
}) {
  const codes = [...new Set([...Object.keys(locked), ...excluded.map((key) => splitKey(key)[0])])];

  return (
    <Card>
      <h2 className="text-lg font-semibold">Đã khoá / Đã loại</h2>
      <p className="mt-1 text-sm text-ctp-subtext">
        Nhóm đã khoá luôn được chọn cho môn của nó; nhóm đã loại không bao giờ được chọn. Hai loại này luôn là bắt buộc.
      </p>
      {codes.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-ctp-surface1 p-3 text-sm text-ctp-subtext">
          Chưa khoá hay loại nhóm nào. Bạn có thể bấm “Chọn nhóm này” ở bước 2 hoặc “Giữ nhóm này” ở bước 4.
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-3">
            {codes.map((code) => {
              const lockedId = locked[code];
              return (
                <li key={code}>
                  <p className="truncate text-sm">
                    <span className="font-semibold">{code}</span>
                    {courseNames[code] && <span className="text-ctp-subtext"> · {courseNames[code]}</span>}
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-2">
                    {lockedId !== undefined && (
                      <Chip
                        lock
                        id={lockedId}
                        auto={autoLocked.includes(`${code}:${lockedId}`)}
                        removeLabel={`Bỏ khoá ${code} ${lockedId}`}
                        onRemove={() => onUnlock(code)}
                      />
                    )}
                    {excluded
                      .filter((key) => splitKey(key)[0] === code)
                      .map((key) => {
                        const id = splitKey(key)[1];
                        return <Chip key={key} lock={false} id={id} auto={false} removeLabel={`Bỏ loại ${code} ${id}`} onRemove={() => onUnexclude(key)} />;
                      })}
                  </ul>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex justify-end">
            <Button variant="danger" onClick={onClear}>
              Bỏ tất cả
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

/** "🔒 Đã khoá L03 (tự động) ×" or "⊘ Đã loại CC01_CC01 ×". */
function Chip({ lock, id, auto, removeLabel, onRemove }: { lock: boolean; id: string; auto: boolean; removeLabel: string; onRemove: () => void }) {
  return (
    <li className={`inline-flex items-center gap-1.5 rounded-lg pl-3 text-sm ${lock ? "bg-ctp-mauve/15" : "bg-ctp-surface0"}`}>
      {lock ? <LockIcon className="size-4 shrink-0 text-ctp-mauve" /> : <BanIcon className="size-4 shrink-0 text-ctp-red" />}
      <span>
        {lock ? "Đã khoá" : "Đã loại"} <span className="font-mono font-semibold">{id}</span>
        {auto && <span className="text-xs text-ctp-subtext"> (tự động)</span>}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        title={removeLabel}
        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-ctp-subtext hover:bg-ctp-surface1 hover:text-ctp-text"
      >
        <CloseIcon className="size-4" />
      </button>
    </li>
  );
}
