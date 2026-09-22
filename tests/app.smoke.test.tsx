// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Dispatch } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Action } from "../src/app/state";
import type { Course } from "../src/lib/parser";
import type { Preferences } from "../src/lib/solver";
import { readFixture } from "./fixtureText";

// jsdom has no Web Worker: run the same request handler synchronously instead.
vi.mock("../src/app/useSolver", async () => {
  const { handleRequest } = await import("../src/lib/solver/protocol");
  const { responseAction } = await import("../src/app/state");
  let nextId = 0;
  return {
    useSolver: (dispatch: Dispatch<Action>) => ({
      run: (courses: Course[], prefs: Preferences) => {
        const id = ++nextId;
        dispatch({ type: "solveStart", id });
        dispatch(responseAction(handleRequest({ id, courses, prefs }), 0));
      },
      cancel: () => {},
    }),
  };
});

const { default: App } = await import("../src/App");

describe("app smoke test", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("goes from pasting two courses to a schedule", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    // Step 1: paste CO2007, then CO2011.
    const box = screen.getByLabelText("Nội dung đã copy");
    for (const name of ["CO2007.txt", "CO2011.txt"]) {
      await user.click(box);
      await user.paste(readFixture(name));
      await user.click(screen.getByRole("button", { name: "Thêm môn" }));
    }
    const added = screen.getByRole("heading", { name: /Môn đã thêm/ }).closest("section")!;
    expect(within(added).getByText("CO2007")).toBeTruthy();
    expect(within(added).getByText("CO2011")).toBeTruthy();
    expect(within(added).getByText("18 nhóm")).toBeTruthy();
    expect(within(added).getByText("10 nhóm")).toBeTruthy();

    // Step 2: CO2007 CC02_CC03 (40/40) is marked full.
    await user.click(screen.getByRole("button", { name: "Tiếp" }));
    expect(screen.getByRole("heading", { name: "Bước 2: Kiểm tra" })).toBeTruthy();
    const row = container.querySelector<HTMLElement>('[data-group="CC02_CC03"]')!;
    expect(within(row).getByText("Đầy")).toBeTruthy();
    expect(within(row).getByText("40/40", { exact: false })).toBeTruthy();

    // Step 3 → "Xếp lịch" → step 4.
    await user.click(screen.getByRole("button", { name: "Tiếp" }));
    expect(screen.getByRole("heading", { name: "Bước 3: Yêu cầu" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Xếp lịch" }));
    expect(screen.getByRole("heading", { name: "Bước 4: Kết quả" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^Lịch 1 · \d+ điểm$/ })).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(5);

    // Only the raw pastes and prefs were persisted.
    const saved = JSON.parse(localStorage.getItem("tkb:v1")!);
    expect(saved.pastes.map((p: { code: string }) => p.code)).toEqual(["CO2007", "CO2011"]);
    expect(Object.keys(saved)).toEqual(["pastes", "prefs"]);
  });
});
