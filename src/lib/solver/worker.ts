// Web Worker entry: one request in, one response out. All logic lives in
// protocol.ts so it can be tested without a Worker.
import { handleRequest, type SolveResponse } from "./protocol";

// Typed locally so this file compiles with the DOM lib (no WebWorker lib clash).
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: SolveResponse): void;
};

scope.onmessage = (event) => scope.postMessage(handleRequest(event.data));
