import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReport } from '@/lib/report';
import type { Student } from '@/lib/members';
import type { ShepherdRecord } from '@/lib/summary';

const student: Student = { name: '김예시', group: '고등학생 자매', grade: '고1' };
function record(s: Student, weekKey = '2026-08-30'): ShepherdRecord {
  return { id: '1', timestamp: '2026-09-01 12:00:00', weekKey, volunteer: '봉사자', category: '성경', student: s };
}

test('9월 첫 주는 8/30이며 미래 주 활동과 미래 입력은 제외한다', () => {
  const r = buildReport('2026-09-05', [student], [record(student), record(student, '2026-09-06'),
    { ...record(student), category: '문자', timestamp: '2026-09-06 00:00:00' }]);
  assert.deepEqual(r.weeks, ['2026-08-30', '2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27']);
  const row = r.pages.find(p => p.group === student.group)!.rows.find(Boolean)!;
  assert.equal(row.active.filter(Boolean).length, 1);
  assert.equal(row.active[2], true);
});

test('학년이 다른 동명이인과 명단에서 빠진 기록 학생을 보존한다', () => {
  const other: Student = { ...student, grade: '고2' };
  const r = buildReport('2026-09-05', [student], [record(other)]);
  const rows = r.pages.find(p => p.group === student.group)!.rows.filter(r => r !== null);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].active.some(Boolean), false);
  assert.equal(rows[1].active[2], true);
});

test('25행을 초과해도 학생을 누락하지 않으며 각 페이지는 25행이다', () => {
  const students = Array.from({ length: 52 }, (_, i) => ({ ...student, name: `학생${i}` }));
  const pages = buildReport('2026-09-05', students, []).pages.filter(p => p.group === student.group);
  assert.equal(pages.length, 3);
  assert.ok(pages.every(p => p.rows.length === 25));
  assert.equal(pages.flatMap(p => p.rows).filter(Boolean).length, 52);
});

test('6주에 걸친 월과 연도 경계를 처리하고 잘못된 날짜는 거부한다', () => {
  assert.equal(buildReport('2026-08-29', [], []).weeks.length, 6);
  assert.equal(buildReport('2026-01-03', [], []).weeks[0], '2025-12-28');
  assert.throws(() => buildReport('2026-02-30', [], []), /날짜/);
});
