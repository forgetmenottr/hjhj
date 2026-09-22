import { useCallback, useEffect, useRef, type Dispatch } from "react";
import type { Course } from "../lib/parser";
import type { Preferences } from "../lib/solver";
import type { SolveRequest, SolveResponse } from "../lib/solver/protocol";
import { responseAction, type Action } from "./state";

/** A run taking longer than this is cancelled and reported as an error. */
export const SOLVE_TIMEOUT_MS = 15_000;

function createWorker(): Worker {
  return new Worker(new URL("../lib/solver/worker.ts", import.meta.url), { type: "module" });
}

export interface SolverControls {
  run(courses: Course[], prefs: Preferences): void;
  cancel(): void;
}

/**
 * Runs the solver in a Web Worker, one request at a time. Status and results
 * go through `dispatch` (see state.ts), which also drops stale responses by id.
 */
export function useSolver(dispatch: Dispatch<Action>): SolverControls {
  const worker = useRef<Worker | null>(null);
  const pending = useRef<{ id: number; startedAt: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const clearTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  /** Kills the current worker (dropping its work) and starts a fresh one. */
  const restart = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    try {
      const fresh = createWorker();
      fresh.onmessage = (event: MessageEvent<SolveResponse>) => {
        const current = pending.current;
        if (!current || event.data.id !== current.id) return; // stale
        clearTimer();
        pending.current = null;
        dispatch(responseAction(event.data, performance.now() - current.startedAt));
      };
      fresh.onerror = (event) => {
        event.preventDefault();
        // Drop the broken worker (even if it failed while loading); the next run() starts a fresh one.
        fresh.terminate();
        if (worker.current === fresh) worker.current = null;
        const current = pending.current;
        if (!current) return;
        clearTimer();
        pending.current = null;
        dispatch({ type: "solveFailed", id: current.id, error: `Bộ xếp lịch gặp lỗi: ${event.message || "không rõ nguyên nhân"}` });
      };
      worker.current = fresh;
    } catch {
      worker.current = null; // reported by run()
    }
  }, [dispatch]);

  const cancel = useCallback(() => {
    const current = pending.current;
    clearTimer();
    pending.current = null;
    restart();
    if (current) dispatch({ type: "solveCancelled", id: current.id });
  }, [dispatch, restart]);

  const run = useCallback(
    (courses: Course[], prefs: Preferences) => {
      if (pending.current || !worker.current) restart(); // drop an older run still in progress
      const id = ++nextId.current;
      dispatch({ type: "solveStart", id });
      if (!worker.current) {
        dispatch({ type: "solveFailed", id, error: "Trình duyệt không hỗ trợ Web Worker nên không thể xếp lịch." });
        return;
      }
      pending.current = { id, startedAt: performance.now() };
      timer.current = setTimeout(() => {
        pending.current = null;
        timer.current = null;
        restart();
        dispatch({
          type: "solveFailed",
          id,
          error: `Quá ${SOLVE_TIMEOUT_MS / 1000} giây mà chưa xếp xong. Hãy bớt môn hoặc thêm yêu cầu bắt buộc rồi thử lại.`,
        });
      }, SOLVE_TIMEOUT_MS);
      const request: SolveRequest = { id, courses, prefs };
      worker.current.postMessage(request);
    },
    [dispatch, restart],
  );

  // Create the worker on mount; terminate it on unmount.
  useEffect(() => {
    restart();
    return () => {
      clearTimer();
      worker.current?.terminate();
      worker.current = null;
    };
  }, [restart]);

  return { run, cancel };
}
