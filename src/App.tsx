import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { copyText, downloadBlob } from "./app/browser";
import { renderPng } from "./app/imageExport";
import { parsePaste, splitByCourse } from "./app/pastes";
import { AUTO_RERUN_DELAY_MS, canGoTo, initialState, isResultStale, reducer, selectedSchedule, type Step } from "./app/state";
import { loadSaved, readDate, saveState } from "./app/storage";
import { useSolver } from "./app/useSolver";
import { Checklist } from "./components/Checklist";
import { CoursePreview } from "./components/CoursePreview";
import { ExportPanel } from "./components/ExportPanel";
import { PasteInput } from "./components/PasteInput";
import { PreferencesForm } from "./components/PreferencesForm";
import { ResultTabs } from "./components/ResultTabs";
import { SelectionsCard } from "./components/SelectionsCard";
import { StatusBanner } from "./components/StatusBanner";
import { Stepper } from "./components/Stepper";
import { TimetableSection } from "./components/TimetableSection";
import { Button, Toast } from "./components/ui";
import { scheduleToIcs } from "./lib/export/ics";
import { imageLayout } from "./lib/export/image";
import { programCounts, STEP_LABELS } from "./lib/view/format";
import { blocksForWeek, standardWeeks, toGridBlocks, type GridBlock, type WeekFilter } from "./lib/view/grid";
import { staleCourses } from "./lib/view/summary";

const TOAST_MS = 2500;
/** How often the "Dán … trước" lines are refreshed. */
const CLOCK_MS = 30_000;

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(loadSaved()));
  const { run, cancel } = useSolver(dispatch);
  const { step, pastes, prefs, autoLocked, registered, semesterStart, autoRun } = state;
  const [week, setWeek] = useState<WeekFilter>("all");
  const [toast, setToast] = useState<string | null>(null);
  // The clock lives here, so every helper below it stays pure and testable.
  const [now, setNow] = useState(() => Date.now());

  // Raw text is the source of truth; parse it whenever it changes.
  const parsed = useMemo(() => pastes.map(parsePaste), [pastes]);
  const courses = useMemo(() => parsed.flatMap((p) => (p.course && p.course.groups.length > 0 ? [p.course] : [])), [parsed]);
  const courseNames = useMemo(() => Object.fromEntries(parsed.flatMap((p) => (p.course ? [[p.code, p.course.name]] : []))), [parsed]);
  const credits = useMemo(() => Object.fromEntries(courses.map((c) => [c.code, c.credits])), [courses]);
  const standard = useMemo(() => standardWeeks(courses), [courses]);
  const programs = useMemo(() => programCounts(courses), [courses]);
  const pastedAt = useMemo(() => Object.fromEntries(pastes.map((p) => [p.code, p.pastedAt])), [pastes]);
  const hasCourses = courses.length > 0;
  const schedule = selectedSchedule(state);
  const stalePicks = useMemo(() => (schedule ? staleCourses(schedule, pastedAt, now) : []), [schedule, pastedAt, now]);

  // Persist the raw pastes, the preferences (with locks), the marks and the semester start.
  useEffect(() => {
    saveState({ pastes, prefs, autoLocked, registered, semesterStart });
  }, [pastes, prefs, autoLocked, registered, semesterStart]);

  // Lock / exclude changes on steps 4–5: stop the run in progress, then re-run
  // once the clicks settle (each change restarts the delay).
  useEffect(() => {
    if (autoRun && state.solverStatus === "running") cancel();
  }, [autoRun, state.solverStatus, cancel]);
  useEffect(() => {
    if (!autoRun) return;
    const timer = setTimeout(() => run(courses, prefs), AUTO_RERUN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [autoRun, courses, prefs, run]);

  // Move focus to the step heading on step change (not on first render).
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) firstRender.current = false;
    else heading.current?.focus();
  }, [step]);

  // A re-run can remove the button that started it (e.g. nothing fits any
  // more); focus then falls to <body>, so bring it to the status instead.
  const status = useRef<HTMLDivElement>(null);
  const resultId = state.result?.id;
  useEffect(() => {
    if (resultId !== undefined && (document.activeElement === null || document.activeElement === document.body)) status.current?.focus();
  }, [resultId]);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // Keep the "Dán … trước" lines honest while the tab stays open.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => clearInterval(timer);
  }, []);

  // Results and registration need room for the weekly grid; the other steps read better narrow.
  const width = step >= 4 ? "max-w-6xl" : "max-w-3xl";
  const goTo = (target: Step) => dispatch({ type: "goTo", step: target });
  const runSolver = () => run(courses, prefs);
  const addPaste = (raw: string) => {
    dispatch({ type: "addPaste", raw, at: new Date().toISOString() });
    setNow(Date.now());
    return splitByCourse(raw).length > 0;
  };
  // The missing-program diagnostic offers this: drop the filter and try again.
  const dropProgramFilter = () => {
    const next = structuredClone(prefs);
    next.programs.mode = "off";
    dispatch({ type: "setPrefs", prefs: next });
    run(courses, next);
  };
  const toggleLock = (courseCode: string, groupId: string, lock: boolean) =>
    dispatch(lock ? { type: "lock", courseCode, groupId } : { type: "unlock", courseCode });
  const markFull = (key: string) => dispatch({ type: "markFullAndRerun", key });
  const isLocked = (b: GridBlock) => prefs.locked[b.courseCode] === b.groupId;
  const weekNote = week === "all" ? "Tất cả tuần" : `Tuần ${week}`;
  const busy = state.solverStatus === "running" || autoRun;
  const infeasible = state.result?.result.status === "infeasible";
  const hasSelections = Object.keys(prefs.locked).length + prefs.excluded.length > 0;

  const copy = async (text: string) => setToast((await copyText(text)) ? "Đã sao chép" : "Không sao chép được — hãy chọn và chép tay.");
  const exportIcs = () => {
    if (!schedule || !semesterStart) return;
    const text = scheduleToIcs(schedule, { semesterStart, courseNames, stamp: new Date() });
    const ok = downloadBlob(new Blob([text], { type: "text/calendar;charset=utf-8" }), "tkb.ics");
    setToast(ok ? "Đã tải tkb.ics" : "Trình duyệt không cho tải tệp.");
  };
  const exportPng = async () => {
    if (!schedule) return;
    const frame = toGridBlocks(schedule);
    const legend = schedule.picks.map((p, i) => ({ courseCode: p.courseCode, groupId: p.group.group.id, name: courseNames[p.courseCode] ?? "", colorIndex: i }));
    const layout = imageLayout({ blocks: blocksForWeek(frame, week), frame, legend, weekNote, standard, isLocked });
    const blob = await renderPng(layout);
    setToast(blob && downloadBlob(blob, "tkb.png") ? "Đã tải tkb.png" : "Không tạo được ảnh trên trình duyệt này.");
  };

  const selections = (
    <SelectionsCard
      locked={prefs.locked}
      excluded={prefs.excluded}
      autoLocked={autoLocked}
      courseNames={courseNames}
      onUnlock={(courseCode) => dispatch({ type: "unlock", courseCode })}
      onUnexclude={(key) => dispatch({ type: "unexclude", key })}
      onClear={() => dispatch({ type: "clearSelections" })}
    />
  );
  const banner = (quiet: boolean) => (
    <StatusBanner
      ref={status}
      status={busy ? "running" : state.solverStatus}
      outcome={state.result}
      error={state.error}
      stale={isResultStale(state)}
      staleCourses={state.step >= 4 ? stalePicks : []}
      hasAutoLocks={autoLocked.length > 0}
      quiet={quiet}
      onCancel={() => {
        dispatch({ type: "cancelAutoRun" });
        cancel();
      }}
      onRerun={runSolver}
      onUndoAutoLocks={() => dispatch({ type: "undoAutoLocks" })}
      onDropProgramFilter={dropProgramFilter}
    />
  );

  return (
    <div className="min-h-dvh pb-28 print:pb-0">
      <header className="border-b border-ctp-surface0 bg-ctp-mantle print:hidden">
        <div className="mx-auto max-w-6xl px-4 pt-3 pb-2">
          <p className="text-base font-bold">
            Xếp thời khoá biểu <span className="font-normal text-ctp-subtext">· HCMUT</span>
          </p>
          <div className="mt-2">
            <Stepper current={step} enabled={(s) => canGoTo(state, s, hasCourses)} onSelect={goTo} />
          </div>
        </div>
      </header>

      <main className={`mx-auto px-4 py-5 print:max-w-none print:p-0 ${width}`}>
        <h1 ref={heading} tabIndex={-1} className="mb-4 text-xl font-bold focus:outline-none print:hidden">
          Bước {step}: {STEP_LABELS[step]}
        </h1>

        {step === 1 && (
          <PasteInput courses={parsed} notice={state.notice} now={now} onAdd={addPaste} onRemove={(code) => dispatch({ type: "removeCourse", code })} />
        )}
        {step === 2 && <CoursePreview courses={parsed} locked={prefs.locked} excluded={prefs.excluded} now={now} onToggleLock={toggleLock} />}
        {step === 3 && (
          <div className="space-y-4">
            {selections}
            <PreferencesForm
              prefs={prefs}
              programs={programs}
              onChange={(next) => dispatch({ type: "setPrefs", prefs: next })}
              onReset={() => dispatch({ type: "resetPrefs" })}
            />
          </div>
        )}
        {step === 4 && (
          <div className="space-y-4">
            {banner(false)}
            {infeasible && !busy && hasSelections && selections}
            {state.result && (
              <div aria-busy={busy} className={`transition-opacity ${busy ? "opacity-60" : ""}`}>
                <ResultTabs
                  outcome={state.result}
                  selected={state.selected}
                  onSelect={(index) => dispatch({ type: "selectSchedule", index })}
                  courseNames={courseNames}
                  locked={prefs.locked}
                  autoLocked={autoLocked}
                  week={week}
                  onWeek={setWeek}
                  standard={standard}
                  onToggleLock={toggleLock}
                  onMarkFull={markFull}
                />
              </div>
            )}
          </div>
        )}
        {step === 5 && (
          <div className="space-y-4">
            <div className="print:hidden">{banner(true)}</div>
            {infeasible && !busy && hasSelections && <div className="print:hidden">{selections}</div>}
            {schedule && (
              <div aria-busy={busy} className={`space-y-4 transition-opacity ${busy ? "opacity-60" : ""}`}>
                <Checklist
                  schedule={schedule}
                  courseNames={courseNames}
                  credits={credits}
                  registered={registered}
                  onRegister={(key, done) => dispatch({ type: done ? "register" : "unregister", key })}
                  onMarkFull={markFull}
                  onCopy={copy}
                />
                <TimetableSection blocks={toGridBlocks(schedule)} week={week} onWeek={setWeek} standard={standard} isLocked={isLocked} />
                <ExportPanel
                  semesterStart={semesterStart}
                  weekNote={weekNote}
                  onSemesterStart={(date) => dispatch({ type: "setSemesterStart", date: readDate(date) })}
                  onIcs={exportIcs}
                  onPng={exportPng}
                  onPrint={() => window.print()}
                />
              </div>
            )}
          </div>
        )}
      </main>

      <Toast message={toast} />

      <footer className="fixed inset-x-0 bottom-0 border-t border-ctp-surface0 bg-ctp-base/95 backdrop-blur print:hidden">
        <div className={`mx-auto flex items-center gap-3 px-4 py-3 ${width}`}>
          {step > 1 && (
            <Button variant="secondary" onClick={() => goTo((step - 1) as Step)}>
              Quay lại
            </Button>
          )}
          <div className="flex-1" />
          {(step === 1 || step === 2) && (
            <Button variant="primary" onClick={() => goTo((step + 1) as Step)} disabled={!hasCourses} className="min-w-28">
              Tiếp
            </Button>
          )}
          {step === 3 && (
            <Button variant="primary" onClick={runSolver} disabled={!hasCourses} className="min-w-28">
              Xếp lịch
            </Button>
          )}
          {step === 4 && (
            <Button variant="primary" onClick={() => goTo(5)} disabled={!canGoTo(state, 5, hasCourses)} className="min-w-28">
              Đăng ký
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
