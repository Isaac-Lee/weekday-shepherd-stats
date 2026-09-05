/**
 * 원본 기록(기록 시트)에서 두 장의 요약표를 만든다.
 *
 *  - 받은목양: 행 = 학생, 칸 = 그 주에 그 항목으로 목양받은 건수. 색 농도로 보여 준다(히트맵).
 *              칸의 메모에 어느 봉사자가 해 줬는지 적어 두어, 색만 보고도 필요하면 확인할 수 있게 한다.
 *  - 한목양  : 행 = 봉사자, 칸 = 그 주에 그 봉사자가 목양한 학생들의 이름.
 *
 * 두 표는 행의 성격이 다르므로 왼쪽 머리글도 다르다.
 *   받은목양  No. · 이름 · 그룹 · 학년 · 합계
 *   한목양    No. · 이름 · 담당 · 합계
 */

import {
  studentKey,
  studentLabel,
  studentSortKey,
  UNCLASSIFIED,
  volunteerScope,
  type Group,
  type Student,
  type Volunteer,
} from './members';
import { CATEGORIES, type Category } from './parse';
import { currentWeekKey, shiftWeek, weekLabel, weekRange } from './week';

export interface ShepherdRecord {
  id: string;
  timestamp: string;
  weekKey: string;
  /** 목양한 봉사자 이름 */
  volunteer: string;
  category: Category;
  /** 목양받은 학생 */
  student: Student;
}

export interface GridCell {
  /** 칸에 쓸 값. 히트맵 표에서는 비워 둔다. */
  text: string;
  /** 색 농도를 정하는 건수 */
  count: number;
  /** 칸에 마우스를 올렸을 때 보이는 메모 */
  note?: string;
}

export interface SummaryRow {
  lead: string[];
  cells: GridCell[];
  /** 위 행과 묶음이 달라지는 지점. 시트에서 굵은 선을 긋는 데 쓴다. */
  startsGroup: boolean;
}

export interface Summary {
  headerTop: string[];
  headerBottom: string[];
  rows: SummaryRow[];
  weeks: string[];
  leadColumns: number;
}

export const RECEIVED_LEAD = ['No.', '이름', '그룹', '학년', '합계'];
export const GIVEN_LEAD = ['No.', '이름', '담당', '합계'];

/** 기본으로 보여 줄 주차 수. 기존 종이 양식이 한 달 5주 단위였던 것에 맞췄다. */
export const DEFAULT_WEEK_COUNT = 6;

/** 요약표에 실을 주차. 이번 주를 왼쪽 끝에 두고 과거로 거슬러 간다. */
export function summaryWeeks(count: number = DEFAULT_WEEK_COUNT, now: Date = new Date()): string[] {
  const end = currentWeekKey(now);
  return weekRange(shiftWeek(end, -(count - 1)), end).reverse();
}

function buildHeaders(lead: string[], weeks: string[]): Pick<Summary, 'headerTop' | 'headerBottom'> {
  const headerTop = [...lead];
  const headerBottom = lead.map(() => '');
  for (const week of weeks) {
    headerTop.push(weekLabel(week), ...CATEGORIES.slice(1).map(() => ''));
    headerBottom.push(...CATEGORIES);
  }
  return { headerTop, headerBottom };
}

/** 한 행의 주차별 칸을 만든다. `pick`은 그 주 그 항목에 해당하는 상대방 이름들을 준다. */
function buildCells(
  weeks: string[],
  heatmap: boolean,
  pick: (week: string, category: Category) => string[],
): { cells: GridCell[]; total: number } {
  const cells: GridCell[] = [];
  let total = 0;

  for (const week of weeks) {
    for (const category of CATEGORIES) {
      const others = pick(week, category);
      total += others.length;
      cells.push(
        heatmap
          ? { text: '', count: others.length, note: others.length > 0 ? others.join(', ') : undefined }
          : { text: others.join(', '), count: others.length },
      );
    }
  }
  return { cells, total };
}

type Bucket = Map<string, Map<Category, string[]>>;

function addTo(table: Map<string, Bucket>, rowKey: string, weekKey: string, category: Category, label: string) {
  const byWeek = table.get(rowKey) ?? new Map();
  table.set(rowKey, byWeek);
  const byCategory = byWeek.get(weekKey) ?? new Map<Category, string[]>();
  byWeek.set(weekKey, byCategory);
  const names = byCategory.get(category) ?? [];
  if (!names.includes(label)) names.push(label);
  byCategory.set(category, names);
}

function read(table: Map<string, Bucket>, rowKey: string, weekKey: string, category: Category): string[] {
  return table.get(rowKey)?.get(weekKey)?.get(category) ?? [];
}

/**
 * 받은목양 — 행은 학생.
 * 명단 순서를 그대로 따르고, 명단에서 빠졌지만 기록에 남아 있는 학생은 뒤에 덧붙여 기록이 사라지지 않게 한다.
 */
export function buildReceivedSummary(
  records: ShepherdRecord[],
  students: Student[],
  weeks: string[],
): Summary {
  const rows = [...students];
  const known = new Set(students.map(studentKey));
  for (const record of records) {
    const key = studentKey(record.student);
    if (known.has(key)) continue;
    known.add(key);
    rows.push(record.student);
  }

  const shown = new Set(weeks);
  const table = new Map<string, Bucket>();
  for (const record of records) {
    if (!shown.has(record.weekKey)) continue;
    addTo(table, studentKey(record.student), record.weekKey, record.category, record.volunteer);
  }

  return {
    ...buildHeaders(RECEIVED_LEAD, weeks),
    weeks,
    leadColumns: RECEIVED_LEAD.length,
    rows: rows.map((student, index) => {
      const key = studentKey(student);
      const { cells, total } = buildCells(weeks, true, (week, category) => read(table, key, week, category));
      return {
        lead: [String(index + 1), student.name, student.group, student.grade, total === 0 ? '' : String(total)],
        cells,
        startsGroup: index > 0 && rows[index - 1].group !== student.group,
      };
    }),
  };
}

/** 한목양 — 행은 봉사자. 기록에만 있는 이름도 뒤에 붙인다. */
export function buildGivenSummary(
  records: ShepherdRecord[],
  volunteers: Volunteer[],
  students: Student[],
  weeks: string[],
): Summary {
  const rows = [...volunteers];
  const known = new Set(volunteers.map((volunteer) => volunteer.name));
  for (const record of records) {
    if (known.has(record.volunteer)) continue;
    known.add(record.volunteer);
    rows.push({ name: record.volunteer, groups: [] });
  }

  // 동명이인 학생은 라벨에 학년이 붙어야 누구인지 알 수 있다.
  const labelPool = [...students];
  const inRoster = new Set(students.map(studentKey));
  for (const record of records) {
    if (!inRoster.has(studentKey(record.student))) {
      inRoster.add(studentKey(record.student));
      labelPool.push(record.student);
    }
  }

  const shown = new Set(weeks);
  const table = new Map<string, Bucket>();
  for (const record of records) {
    if (!shown.has(record.weekKey)) continue;
    addTo(table, record.volunteer, record.weekKey, record.category, studentLabel(record.student, labelPool));
  }

  return {
    ...buildHeaders(GIVEN_LEAD, weeks),
    weeks,
    leadColumns: GIVEN_LEAD.length,
    rows: rows.map((volunteer, index) => {
      const { cells, total } = buildCells(weeks, false, (week, category) =>
        read(table, volunteer.name, week, category),
      );
      return {
        lead: [String(index + 1), volunteer.name, volunteerScope(volunteer), total === 0 ? '' : String(total)],
        cells,
        startsGroup: false,
      };
    }),
  };
}

/** 기록에 등장했지만 학생 명단에 없는 학생 (명단 자동 보강용) */
export function studentsMissingFromRoster(records: ShepherdRecord[], students: Student[]): Student[] {
  const known = new Set(students.map(studentKey));
  const fresh = new Map<string, Student>();

  for (const record of records) {
    const student: Student = { ...record.student, grade: record.student.grade ?? UNCLASSIFIED };
    const key = studentKey(student);
    if (!known.has(key) && !fresh.has(key)) fresh.set(key, student);
  }
  return [...fresh.values()];
}

/** 기록에 등장했지만 봉사자 명단에 없는 이름 */
export function volunteersMissingFromRoster(
  records: ShepherdRecord[],
  volunteers: Volunteer[],
): Volunteer[] {
  const known = new Set(volunteers.map((volunteer) => volunteer.name));
  const fresh = new Map<string, Volunteer>();

  for (const record of records) {
    if (!known.has(record.volunteer) && !fresh.has(record.volunteer)) {
      fresh.set(record.volunteer, { name: record.volunteer, groups: [] });
    }
  }
  return [...fresh.values()];
}

export type { Group };

/**
 * 그 주에 지정한 항목 중 어느 것도 받지 못한 학생. 명단 순서(그룹 → 학년)로 돌려준다.
 * categories 를 안 주면 전체 항목 기준(= 목양을 한 건도 못 받음)이다.
 */
export function studentsWithoutRecords(
  records: ShepherdRecord[],
  students: Student[],
  weekKey: string,
  categories: readonly Category[] = CATEGORIES,
): Student[] {
  const covered = new Set(
    records
      .filter((record) => record.weekKey === weekKey && categories.includes(record.category))
      .map((record) => studentKey(record.student)),
  );
  return students
    .filter((student) => !covered.has(studentKey(student)))
    .sort((a, b) => studentSortKey(a) - studentSortKey(b));
}
