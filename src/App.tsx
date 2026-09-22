import { useEffect, useMemo, useReducer, useRef } from "react";
import { parsePaste, splitByCourse } from "./app/pastes";
import { canGoTo, initialState, isResultStale, reducer, type Step } from "./app/state";
import { loadSaved, saveState } from "./app/storage";
import { useSolver } from "./app/useSolver";
import { CoursePreview } from "./components/CoursePreview";
import { PasteInput } from "./components/PasteInput";
import { PreferencesForm } from "./components/PreferencesForm";
import { ResultTabs } from "./components/ResultTabs";
import { StatusBanner } from "./components/StatusBanner";
import { Stepper } from "./components/Stepper";
import { Button } from "./components/ui";
import { STEP_LABELS } from "./lib/view/format";

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(loadSaved()));
  const solver = useSolver(dispatch);
  const { step, pastes, prefs } = state;

  // Raw text is the source of truth; parse it whenever it changes.
  const parsed = useMemo(() => pastes.map(parsePaste), [pastes]);
  const courses = useMemo(() => parsed.flatMap((p) => (p.course && p.course.groups.length > 0 ? [p.course] : [])), [parsed]);
  const courseNames = useMemo(() => Object.fromEntries(courses.map((c) => [c.code, c.name])), [courses]);
  const hasCourses = courses.length > 0;

  // Persist only the raw pastes and the preferences.
  useEffect(() => {
    saveState({ pastes, prefs });
  }, [pastes, prefs]);

  // Move focus to the step heading on step change (not on first render).
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) firstRender.current = false;
    else heading.current?.focus();
  }, [step]);

  // Results need room for the weekly grid; the other steps read better narrow.
  const width = step === 4 ? "max-w-6xl" : "max-w-3xl";
  const goTo = (target: Step) => dispatch({ type: "goTo", step: target });
  const runSolver = () => solver.run(courses, prefs);
  const addPaste = (raw: string) => {
    dispatch({ type: "addPaste", raw });
    return splitByCourse(raw).length > 0;
  };

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
        {step === 2 && <CoursePreview courses={parsed} />}
        {step === 3 && (
          <PreferencesForm prefs={prefs} onChange={(next) => dispatch({ type: "setPrefs", prefs: next })} onReset={() => dispatch({ type: "resetPrefs" })} />
        )}
        {step === 4 && (
          <div className="space-y-4">
            <StatusBanner
              status={state.solverStatus}
              outcome={state.result}
              error={state.error}
              stale={isResultStale(state)}
              onCancel={solver.cancel}
              onRerun={runSolver}
            />
            {state.result && state.solverStatus !== "running" && (
              <ResultTabs key={state.result.id} outcome={state.result} courseNames={courseNames} />
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
