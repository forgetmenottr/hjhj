// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import type { Dispatch } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { splitByCourse } from "../src/app/pastes";
import { defaultPrefs, type Action } from "../src/app/state";
import { parse, type Course } from "../src/lib/parser";
import type { Preferences } from "../src/lib/solver";
import { buildMasks, conflicts } from "../src/lib/timing";
import { formatWeeks } from "../src/lib/view/format";
import { readFixture } from "./fixtureText";

// jsdom has no Web Worker: run the same request handler synchronously instead.
// Like the real hook, the controls are stable across renders.
vi.mock("../src/app/useSolver", async () => {
  const { useMemo } = await import("react");
  const { handleRequest } = await import("../src/lib/solver/protocol");
  const { responseAction } = await import("../src/app/state");
  let nextId = 0;
  return {
    useSolver: (dispatch: Dispatch<Action>) =>
      useMemo(
        () => ({
          run: (courses: Course[], prefs: Preferences) => {
            const id = ++nextId;
            dispatch({ type: "solveStart", id });
            dispatch(responseAction(handleRequest({ id, courses, prefs }), 0));
          },
          cancel: () => {},
        }),
        [dispatch],
      ),
  };
});

const { default: App } = await import("../src/App");

const CO2007 = readFixture("CO2007.txt");
const CO2011 = readFixture("CO2011.txt");

/** Starts the app with both fixtures already pasted (as a previous visit would have saved them). */
function preload(prefs: Preferences = defaultPrefs(), autoLocked: string[] = [], pastes = splitByCourse(`${CO2007}\n${CO2011}`)) {
  localStorage.setItem("tkb:v1", JSON.stringify({ pastes, prefs, autoLocked }));
  return render(<App />);
}

async function toResults(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Tiếp" }));
  await user.click(screen.getByRole("button", { name: "Tiếp" }));
  await user.click(screen.getByRole("button", { name: "Xếp lịch" }));
  expect(screen.getByRole("heading", { name: "Bước 4: Kết quả" })).toBeTruthy();
}

/** Waits for the automatic re-run (debounced) to finish. */
async function settled(container: HTMLElement) {
  await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull(), { timeout: 5000 });
}

/** Keys of the picks of the schedule on screen, in course order. */
function pickKeys(container: HTMLElement): string[] {
  return [...container.querySelectorAll("[data-pick]")].map((el) => el.getAttribute("data-pick")!);
}

function pick(container: HTMLElement, key: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-pick="${key}"]`);
  if (!el) throw new Error(`pick ${key} not shown`);
  return el;
}

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
      // The box is cleared and "Thêm môn" disabled; focus goes back to the box, not <body>.
      expect(document.activeElement).toBe(box);
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

    // Only the raw pastes, prefs, marks and the semester start were persisted.
    const saved = JSON.parse(localStorage.getItem("tkb:v1")!);
    expect(saved.pastes.map((p: { code: string }) => p.code)).toEqual(["CO2007", "CO2011"]);
    expect(Object.keys(saved)).toEqual(["pastes", "prefs", "autoLocked", "registered", "semesterStart"]);
  });

  it("locking a pick re-runs, returns to tab 1, and every schedule keeps that group", async () => {
    const user = userEvent.setup();
    const { container } = preload();
    await toResults(user);

    // Lock the CO2011 group of schedule 3.
    await user.click(screen.getAllByRole("tab")[2]);
    const key = pickKeys(container)[1];
    const toggle = within(pick(container, key)).getByRole("button", { name: /^Giữ nhóm này/ });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    await user.click(toggle);
    await settled(container);

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    for (const tab of tabs) {
      await user.click(tab);
      const row = pick(container, key);
      expect(within(row).getByText("Đã khoá")).toBeTruthy();
      expect(within(row).getByRole("button", { name: /^Giữ nhóm này/ }).getAttribute("aria-pressed")).toBe("true");
    }
    // The grid and the day list mark the locked sessions with an icon and text.
    expect(container.querySelector('[aria-label$="· đã khoá"]')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem("tkb:v1")!).prefs.locked).toEqual({ CO2011: key.split(":")[1] });
  });

  it("“Đã đầy” replaces that group and keeps every other pick", async () => {
    const user = userEvent.setup();
    const { container } = preload();
    await toResults(user);

    const before = pickKeys(container);
    const [full, ...others] = before;
    await user.click(within(pick(container, full)).getByRole("button", { name: /^Đã đầy — tìm nhóm khác/ }));
    await settled(container);

    const after = pickKeys(container);
    expect(after).not.toContain(full);
    expect(after[0].startsWith("CO2007:")).toBe(true);
    expect(after.slice(1)).toEqual(others);
    expect(within(pick(container, others[0])).getByText("Khoá tự động")).toBeTruthy();
  });

  it("shows equivalent groups before re-running, and the re-run picks one of them", async () => {
    // Derived: L04_L08's lab moved onto L04_L07's (Thứ 5, tiết 2–6, same room and weeks),
    // so the two groups become equivalent. Every other CO2007 group is excluded.
    const at = CO2007.indexOf("L04_L08");
    const derived = CO2007.slice(0, at) + CO2007.slice(at).replace("Thứ 3\t- - - - - - - 8 9 10 11 12 - - - -", "Thứ 5\t- 2 3 4 5 6 - - - - - - - - - -");
    expect(derived).not.toBe(CO2007);
    const prefs = defaultPrefs();
    prefs.excluded = parse(derived).courses[0].groups.flatMap((g) => (g.id.startsWith("L04_") ? [] : [`CO2007:${g.id}`]));
    const user = userEvent.setup();
    const { container } = preload(prefs, [], splitByCourse(`${derived}\n${CO2011}`));
    await toResults(user);

    const row = pick(container, "CO2007:L04_L07");
    expect(within(row).getByText("hoặc L04_L08")).toBeTruthy();
    const full = within(row).getByRole("button", { name: /^Đã đầy — tìm nhóm khác/ });
    await user.click(full);
    expect(full.getAttribute("aria-expanded")).toBe("true");
    expect(within(row).getByText(/Có thể đăng ký nhóm tương đương:/).textContent).toContain("L04_L08");
    expect(container.querySelector('[aria-busy="true"]')).toBeNull(); // nothing re-runs yet

    await user.click(within(row).getByRole("button", { name: "Tìm nhóm khác" }));
    await settled(container);
    expect(pickKeys(container)[0]).toBe("CO2007:L04_L08");
  });

  it("locks from step 2 that clash show the infeasible banner; removing one lock fixes it", async () => {
    const user = userEvent.setup();
    const { container } = preload();
    await user.click(screen.getByRole("button", { name: "Tiếp" }));

    // CO2007's card is open; open CO2011's, then choose A01_A01 and L01.
    await user.click(screen.getByRole("button", { name: /^CO2011 ·/ }));
    for (const id of ["A01_A01", "L01"]) {
      const row = container.querySelector<HTMLElement>(`[data-group="${id}"]`)!;
      await user.click(within(row).getByRole("button", { name: /^Chọn nhóm này/ }));
      expect(within(row).getByText("Đã khoá")).toBeTruthy();
    }

    // Step 3 lists both locks.
    await user.click(screen.getByRole("button", { name: "Tiếp" }));
    expect(screen.getByRole("button", { name: "Bỏ khoá CO2007 A01_A01" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bỏ khoá CO2011 L01" })).toBeTruthy();

    // They overlap on Monday, so nothing fits.
    await user.click(screen.getByRole("button", { name: "Xếp lịch" }));
    expect(screen.getByText("Không có lịch nào phù hợp.")).toBeTruthy();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);

    // The solver's reason is shown in Vietnamese.
    expect(screen.getByText("Hai nhóm đã khoá CO2007 A01_A01 và CO2011 L01 trùng giờ: Thứ 2 tiết 2–3 (tuần 1–7, 9–16).")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Bỏ khoá CO2011 L01" }));
    await settled(container);
    expect(screen.getByText(/^Tìm được \d+ lịch/)).toBeTruthy();
    expect(pickKeys(container)[0]).toBe("CO2007:A01_A01");
  });

  it("when “Đã đầy” leaves nothing that fits, “Thử lại, không giữ các môn khác” drops only the auto locks", async () => {
    // Real data: keep CO2011:L03 (auto-locked earlier) and exclude every CO2007 group that fits
    // around it except the first one; marking that one full leaves nothing.
    const [co2007, co2011] = buildMasks([...parse(CO2007).courses, ...parse(CO2011).courses]).courses;
    const l03 = co2011.groups.find((g) => g.group.id === "L03")!;
    const fits = co2007.groups.filter((g) => !conflicts(g, l03));
    const prefs = defaultPrefs();
    prefs.locked = { CO2011: "L03" };
    prefs.excluded = fits.slice(1).map((g) => g.key);
    const user = userEvent.setup();
    const { container } = preload(prefs, ["CO2011:L03"]);
    await toResults(user);

    expect(pickKeys(container)).toEqual([fits[0].key, "CO2011:L03"]);
    await user.click(within(pick(container, fits[0].key)).getByRole("button", { name: /^Đã đầy — tìm nhóm khác/ }));
    await settled(container);
    expect(screen.getByText("Không tìm được nhóm thay thế khi giữ nguyên các môn khác")).toBeTruthy();
    // The clicked button is gone with the schedules, so focus moves to the status, not <body>.
    expect(document.activeElement?.getAttribute("role")).toBe("status");

    await user.click(screen.getByRole("button", { name: /Thử lại, không giữ các môn khác/ }));
    await settled(container);
    expect(screen.getByText(/^Tìm được \d+ lịch/)).toBeTruthy();
    const [newCo2007, newCo2011] = pickKeys(container);
    expect([fits[0].key, ...prefs.excluded]).not.toContain(newCo2007);
    expect(newCo2011).not.toBe("CO2011:L03");
    const saved = JSON.parse(localStorage.getItem("tkb:v1")!);
    expect(saved.autoLocked).toEqual([]);
    expect(saved.prefs.excluded).toEqual([...prefs.excluded, fits[0].key]);
  });

  it("relaxed requirements show ⚠ on the tabs and a warning in the breakdown", async () => {
    const prefs = defaultPrefs();
    prefs.campuses = { mode: "required", allowed: [2] };
    prefs.language = { mode: "required", allowed: ["TA"] };
    const user = userEvent.setup();
    preload(prefs);
    await toResults(user);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(5);
    for (const tab of tabs) expect(tab.textContent).toMatch(/^Lịch \d · ⚠ 1 yêu cầu$/);
    expect(screen.getByText(/Điểm chưa tính các yêu cầu bị nới/)).toBeTruthy();
    expect(screen.getByText("Vi phạm yêu cầu bắt buộc (đã nới)")).toBeTruthy();
  });

  it("week selector: a week without classes shows the empty state", async () => {
    const user = userEvent.setup();
    const { container } = preload();
    await toResults(user);

    const week8 = screen.getByRole("button", { name: "Tuần 8 (không có lớp)" });
    expect(week8.getAttribute("title")).toBe("Không có lớp");
    await user.click(week8);
    expect(week8.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Tuần này không có lớp")).toBeTruthy();

    // Week 1 has classes again; "Tất cả" goes back to the union.
    await user.click(screen.getByRole("button", { name: "Tuần 1" }));
    expect(screen.queryByText("Tuần này không có lớp")).toBeNull();
    expect(container.querySelector('[aria-label^="CO2007"]')).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Tất cả" }));
    expect(screen.getByRole("button", { name: "Tất cả" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("step 5: checking every row reaches N/N, and “Sao chép tất cả” copies CODE  GROUP lines", async () => {
    const user = userEvent.setup();
    const { container } = preload();
    await toResults(user);
    await user.click(screen.getByRole("button", { name: "Đăng ký" }));
    expect(screen.getByRole("heading", { name: "Bước 5: Đăng ký" })).toBeTruthy();

    const keys = [...container.querySelectorAll("[data-register]")].map((el) => el.getAttribute("data-register")!);
    expect(keys).toHaveLength(2);
    expect(screen.getByText("Đã đăng ký 0/2 môn")).toBeTruthy();
    expect(screen.getByText(/Tổng 7 TC/)).toBeTruthy(); // CO2007 4 + CO2011 3

    for (const box of screen.getAllByRole("checkbox", { name: /^Đã đăng ký \(/ })) await user.click(box);
    expect(screen.getByText("Đã đăng ký 2/2 môn")).toBeTruthy();
    const saved = JSON.parse(localStorage.getItem("tkb:v1")!);
    expect(saved.registered).toEqual(keys);
    expect(Object.keys(saved.prefs.locked).sort()).toEqual(["CO2007", "CO2011"]);
    expect(saved.autoLocked).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Sao chép tất cả" }));
    const ids = keys.map((k) => k.split(":")[1]);
    expect(await navigator.clipboard.readText()).toBe(`CO2007  ${ids[0]}\nCO2011  ${ids[1]}`);
    expect(await screen.findByText("Đã sao chép")).toBeTruthy();

    // Unchecking removes the lock again.
    await user.click(screen.getAllByRole("checkbox", { name: /^Đã đăng ký \(/ })[0]);
    expect(screen.getByText("Đã đăng ký 1/2 môn")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("tkb:v1")!).prefs.locked).toEqual({ CO2011: ids[1] });
  });

  it("step 5: “Đã đầy” re-runs like step 4 and stays on the checklist", async () => {
    const user = userEvent.setup();
    const { container } = preload();
    await toResults(user);
    await user.click(screen.getByRole("button", { name: "Đăng ký" }));
    const rows = () => [...container.querySelectorAll("[data-register]")].map((el) => el.getAttribute("data-register")!);
    const [full, other] = rows();

    await user.click(screen.getByRole("button", { name: `Đã đầy — tìm nhóm khác (${full.replace(":", " ")})` }));
    await settled(container);
    expect(screen.getByRole("heading", { name: "Bước 5: Đăng ký" })).toBeTruthy();
    const [replaced, kept] = rows();
    expect(replaced).not.toBe(full);
    expect(replaced.startsWith("CO2007:")).toBe(true);
    expect(kept).toBe(other);
  });

  it("a schedule with SK2001 shows its 5-week label in the all-weeks view", async () => {
    const SK2001 = readFixture("SK2001.txt");
    const user = userEvent.setup();
    const { container } = preload(defaultPrefs(), [], splitByCourse(`${CO2007}\n${CO2011}\n${SK2001}`));
    await toResults(user);
    const key = pickKeys(container).find((k) => k.startsWith("SK2001:"))!;
    const group = parse(SK2001).courses[0].groups.find((g) => g.id === key.split(":")[1])!;
    const label = formatWeeks(group.sessions[0].weeks);
    expect(label).toMatch(/^T(1–5|6–7, 9–11|12–16)$/);
    expect(screen.getByRole("button", { name: "Tất cả" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByText(label).length).toBeGreaterThan(0); // on the grid block
    expect(screen.getByText(`· ${label}`)).toBeTruthy(); // in the day list
  });
});
