import { parsePaste, type Paste } from "./pastes";

/**
 * Locked and excluded groups. `locked` and `excluded` live in the preferences
 * (the solver treats both as always hard); `autoLocked` remembers which locks
 * the app added itself ("Đã đầy — tìm nhóm khác"), so they can be undone
 * without touching the user's own locks; `registered` is the step-5 checklist
 * ("Đã đăng ký"), and each registered group is also a user lock.
 */
export interface Selections {
  /** courseCode → groupId. */
  locked: Record<string, string>;
  /** Group keys, "CO2007:A01_A01". */
  excluded: string[];
  /** Keys of locks the app added automatically; each one is also in `locked`. */
  autoLocked: string[];
  /** Keys checked as "Đã đăng ký"; each one is also a user lock in `locked`. */
  registered: string[];
}

/** A pick of the shown schedule, as markFull needs it. */
export interface PickRef {
  courseCode: string;
  groupId: string;
}

export function groupKey(courseCode: string, groupId: string): string {
  return `${courseCode}:${groupId}`;
}

/** "CO2007:A01_A01" → ["CO2007", "A01_A01"]; a key without ":" has an empty group id. */
export function splitKey(key: string): [courseCode: string, groupId: string] {
  const at = key.indexOf(":");
  return at < 0 ? [key, ""] : [key.slice(0, at), key.slice(at + 1)];
}

/** Group ids of every pasted course, by course code. */
export function groupIdsByCourse(pastes: Paste[]): Map<string, Set<string>> {
  const ids = new Map<string, Set<string>>();
  for (const paste of pastes) {
    const course = parsePaste(paste).course;
    if (course) ids.set(course.code, new Set(course.groups.map((g) => g.id)));
  }
  return ids;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/** Auto and registered marks are only meaningful while the same lock is still in place. */
function keepMarks(marks: string[], locked: Record<string, string>): string[] {
  return unique(marks).filter((key) => {
    const [code, id] = splitKey(key);
    return locked[code] === id;
  });
}

/**
 * Drops locks, excluded keys and auto marks whose course or group no longer
 * exists (after a course is removed or re-pasted, or in old saved data).
 */
export function pruneSelections(selections: Selections, groups: Map<string, Set<string>>): Selections {
  const exists = (code: string, id: string) => groups.get(code)?.has(id) ?? false;
  const locked = Object.fromEntries(Object.entries(selections.locked).filter(([code, id]) => exists(code, id)));
  const excluded = unique(selections.excluded).filter((key) => exists(...splitKey(key)));
  const registered = keepMarks(selections.registered, locked);
  const autoLocked = keepMarks(selections.autoLocked, locked).filter((key) => !registered.includes(key));
  return { locked, excluded, autoLocked, registered };
}

const ofCourse = (courseCode: string) => (key: string) => splitKey(key)[0] === courseCode;

/** Locks a group (a user lock). A locked group cannot stay excluded. */
export function lockGroup(s: Selections, courseCode: string, groupId: string): Selections {
  const key = groupKey(courseCode, groupId);
  return {
    locked: { ...s.locked, [courseCode]: groupId },
    excluded: s.excluded.filter((k) => k !== key),
    autoLocked: s.autoLocked.filter((k) => !ofCourse(courseCode)(k)),
    registered: s.registered.filter((k) => !ofCourse(courseCode)(k) || k === key),
  };
}

export function unlockCourse(s: Selections, courseCode: string): Selections {
  const locked = { ...s.locked };
  delete locked[courseCode];
  const other = (k: string) => !ofCourse(courseCode)(k);
  return { locked, excluded: s.excluded, autoLocked: s.autoLocked.filter(other), registered: s.registered.filter(other) };
}

/** "Đã đăng ký" checked: the group becomes a user lock and the row is done. */
export function registerGroup(s: Selections, key: string): Selections {
  const [code, id] = splitKey(key);
  const locked = lockGroup(s, code, id);
  return locked.registered.includes(key) ? locked : { ...locked, registered: [...locked.registered, key] };
}

/** "Đã đăng ký" unchecked: the mark and its lock go. */
export function unregisterGroup(s: Selections, key: string): Selections {
  const [code, id] = splitKey(key);
  const unmarked = { ...s, registered: s.registered.filter((k) => k !== key) };
  return s.locked[code] === id ? unlockCourse(unmarked, code) : unmarked;
}

/** Excludes a group; if it was the locked group of its course, the lock goes too. */
export function excludeGroup(s: Selections, key: string): Selections {
  const [code, id] = splitKey(key);
  const base = s.locked[code] === id ? unlockCourse(s, code) : s;
  return base.excluded.includes(key) ? base : { ...base, excluded: [...base.excluded, key] };
}

export function unexcludeGroup(s: Selections, key: string): Selections {
  return { ...s, excluded: s.excluded.filter((k) => k !== key) };
}

/**
 * "Nhóm này đã đầy": exclude `key`, and lock every OTHER pick of the shown
 * schedule (the user has probably registered those already). Courses that are
 * already locked keep their lock, an excluded pick (possible when the shown
 * result is stale) is not locked, and only new locks are marked automatic.
 */
export function markFull(s: Selections, key: string, picks: PickRef[]): Selections {
  const next = excludeGroup(s, key);
  const [code] = splitKey(key);
  const locked = { ...next.locked };
  const added: string[] = [];
  for (const pick of picks) {
    const pickKey = groupKey(pick.courseCode, pick.groupId);
    if (pick.courseCode === code || locked[pick.courseCode] !== undefined || next.excluded.includes(pickKey)) continue;
    locked[pick.courseCode] = pick.groupId;
    added.push(pickKey);
  }
  return { locked, excluded: next.excluded, autoLocked: [...next.autoLocked, ...added], registered: next.registered };
}

/** Removes only the automatic locks; user locks, registered and excluded groups stay. */
export function undoAutoLocks(s: Selections): Selections {
  const locked = { ...s.locked };
  for (const key of keepMarks(s.autoLocked, s.locked)) delete locked[splitKey(key)[0]];
  return { locked, excluded: s.excluded, autoLocked: [], registered: s.registered };
}

export function sameSelections(a: Selections, b: Selections): boolean {
  const lockedA = Object.entries(a.locked);
  return (
    lockedA.length === Object.keys(b.locked).length &&
    lockedA.every(([code, id]) => b.locked[code] === id) &&
    a.excluded.length === b.excluded.length &&
    a.excluded.every((k, i) => b.excluded[i] === k) &&
    a.autoLocked.length === b.autoLocked.length &&
    a.autoLocked.every((k, i) => b.autoLocked[i] === k) &&
    a.registered.length === b.registered.length &&
    a.registered.every((k, i) => b.registered[i] === k)
  );
}
