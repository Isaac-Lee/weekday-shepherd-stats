import { studentKey, type Student } from './members';
import { CATEGORIES } from './parse';
import type { ShepherdRecord } from './summary';
import { weekKeyOf, weekRange } from './week';

const GROUP_COLORS = {
  '중학생 형제': '#129cff', '중학생 자매': '#ff7c7c',
  '고등학생 형제': '#9f1959', '고등학생 자매': '#9238ff',
} as const;
export interface ReportRow { name: string; grade: string; active: boolean[] }
export interface ReportPage { group: string; color: string; page: number; rows: (ReportRow | null)[] }

/** 보고 날짜가 속한 달과 겹치는 일~토 주차. 양 끝의 월 경계 주도 포함한다. */
export function buildReport(date: string, students: Student[], records: ShepherdRecord[]) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('날짜는 실제 존재하는 YYYY-MM-DD 형식이어야 합니다.');
  }
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth() + 1;
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const weeks = weekRange(weekKeyOf(`${date.slice(0, 7)}-01`), weekKeyOf(last));
  const currentWeek = weekKeyOf(date);
  const included = records.filter(r => weeks.includes(r.weekKey) && r.weekKey <= currentWeek && r.timestamp.slice(0, 10) <= date);
  const roster = new Map(students.map(s => [studentKey(s), s]));
  for (const r of included) if (!roster.has(studentKey(r.student))) roster.set(studentKey(r.student), r.student);
  const marks = new Set(included.map(r => `${studentKey(r.student)}|${r.weekKey}|${r.category}`));
  const pages: ReportPage[] = [];
  for (const [group, color] of Object.entries(GROUP_COLORS)) {
    let rows: (ReportRow | null)[] = [];
    let page = 1;
    let previousGrade = '';
    const flush = () => {
      pages.push({ group, color, page: page++, rows: [...rows, ...Array(25 - rows.length).fill(null)] });
      rows = [];
    };
    for (const s of roster.values()) {
      if (s.group !== group) continue;
      if (rows.length === 25) flush();
      // 학년 사이 빈 행 때문에 다음 학생만 새 페이지에 밀리지 않게 한다.
      if (rows.length && previousGrade !== s.grade && rows.length < 24) rows.push(null);
      rows.push({ name: s.name, grade: s.grade, active: weeks.flatMap(w => CATEGORIES.map(c => marks.has(`${studentKey(s)}|${w}|${c}`))) });
      previousGrade = s.grade;
    }
    if (rows.length || page === 1) flush();
  }
  return { date, year, month, weeks, categories: CATEGORIES, pages, recordCount: included.filter(r => r.student.group in GROUP_COLORS).length };
}
