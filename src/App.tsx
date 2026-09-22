import { useEffect, useMemo, useReducer, useRef } from "react";
import { parsePaste, splitByCourse } from "./app/pastes";
import { AUTO_RERUN_DELAY_MS, canGoTo, initialState, isResultStale, reducer, type Step } from "./app/state";
import { loadSaved, saveState } from "./app/storage";
import { useSolver } from "./app/useSolver";
import { CoursePreview } from "./components/CoursePreview";
import { PasteInput } from "./components/PasteInput";
import { PreferencesForm } from "./components/PreferencesForm";
import { ResultTabs } from "./components/ResultTabs";
import { SelectionsCard } from "./components/SelectionsCard";
import { StatusBanner } from "./components/StatusBanner";
import { Stepper } from "./components/Stepper";
import { Button } from "./components/ui";
import { STEP_LABELS } from "./lib/view/format";

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(loadSaved()));
  const { run, cancel } = useSolver(dispatch);
  const { step, pastes, prefs, autoLocked, autoRun } = state;

  // Raw text is the source of truth; parse it whenever it changes.
  const parsed = useMemo(() => pastes.map(parsePaste), [pastes]);
  const courses = useMemo(() => parsed.flatMap((p) => (p.course && p.course.groups.length > 0 ? [p.course] : [])), [parsed]);
  const courseNames = useMemo(() => Object.fromEntries(parsed.flatMap((p) => (p.course ? [[p.code, p.course.name]] : []))), [parsed]);
  const hasCourses = courses.length > 0;

  // Persist only the raw pastes, the preferences (with locks) and the auto-lock marks.
  useEffect(() => {
    saveState({ pastes, prefs, autoLocked });
  }, [pastes, prefs, autoLocked]);

  // Lock / exclude changes on step 4: stop the run in progress, then re-run
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

  // Results need room for the weekly grid; the other steps read better narrow.
  const width = step === 4 ? "max-w-6xl" : "max-w-3xl";
  const goTo = (target: Step) => dispatch({ type: "goTo", step: target });
  const runSolver = () => run(courses, prefs);
  const addPaste = (raw: string) => {
    dispatch({ type: "addPaste", raw });
    return splitByCourse(raw).length > 0;
  };
  const toggleLock = (courseCode: string, groupId: string, lock: boolean) =>
    dispatch(lock ? { type: "lock", courseCode, groupId } : { type: "unlock", courseCode });
  const busy = state.solverStatus === "running" || autoRun;
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
  const infeasible = state.result?.result.status === "infeasible";
  const hasSelections = Object.keys(prefs.locked).length + prefs.excluded.length > 0;

  return (
    <div className="min-h-dvh pb-28">
      <header className="border-b border-ctp-surface0 bg-ctp-mantle">
        <div className="mx-auto max-w-6xl px-4 pt-3 pb-2">
          <p className="text-base font-bold">
            Xếp thời khoá biểu <span className="font-normal text-ctp-subtext">· HCMUT</span>
          </p>
          <div className="mt-2">
            <Stepper current={step} enabled={(s) => canGoTo(state, s, hasCourses)} onSelect={goTo} />
          </div>
        </div>
      </header>

      <main className={`mx-auto px-4 py-5 ${width}`}>
        <h1 ref={heading} tabIndex={-1} className="mb-4 text-xl font-bold focus:outline-none">
          Bước {step}: {STEP_LABELS[step]}
        </h1>

        {step === 1 && (
          <PasteInput courses={parsed} notice={state.notice} onAdd={addPaste} onRemove={(code) => dispatch({ type: "removeCourse", code })} />
        )}
        {step === 2 && <CoursePreview courses={parsed} locked={prefs.locked} excluded={prefs.excluded} onToggleLock={toggleLock} />}
        {step === 3 && (
          <div className="space-y-4">
            {selections}
            <PreferencesForm prefs={prefs} onChange={(next) => dispatch({ type: "setPrefs", prefs: next })} onReset={() => dispatch({ type: "resetPrefs" })} />
          </div>
        )}
        {step === 4 && (
          <div className="space-y-4">
            <StatusBanner
              ref={status}
              status={busy ? "running" : state.solverStatus}
              outcome={state.result}
              error={state.error}
              stale={isResultStale(state)}
              hasAutoLocks={autoLocked.length > 0}
              onCancel={() => {
                dispatch({ type: "cancelAutoRun" });
                cancel();
              }}
              onRerun={runSolver}
              onUndoAutoLocks={() => dispatch({ type: "undoAutoLocks" })}
            />
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
                  onToggleLock={toggleLock}
                  onMarkFull={(key) => dispatch({ type: "markFullAndRerun", key })}
                />
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-ctp-surface0 bg-ctp-base/95 backdrop-blur">
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
        </div>
      </footer>
    </div>
  );
}
