import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Student, Volunteer } from '@/lib/members';
import {
  buildGivenSummary,
  buildReceivedSummary,
  summaryWeeks,
  type ShepherdRecord,
  type Summary,
} from '@/lib/summary';

const WEEKS = ['2026-08-02', '2026-08-09'];

const 다온: Student = { name: '박다온', group: '중학생 형제', grade: '중1' };
const 늘찬: Student = { name: '오늘찬', group: '중학생 형제', grade: '중1' };
const 여름: Student = { name: '최여름', group: '중학생 형제', grade: '중2' };
const 한별1: Student = { name: '이한별', group: '고등학생 자매', grade: '고1' };
const 한별2: Student = { name: '이한별', group: '고등학생 자매', grade: '고2' };

const STUDENTS: Student[] = [다온, 늘찬, 여름, 한별1, 한별2];

const 김봉사: Volunteer = { name: '김봉사', groups: ['중학생 형제'] };
const 이도움: Volunteer = { name: '이도움', groups: ['고등학생 자매'] };
const 홍길동: Volunteer = { name: '홍길동', groups: [] };

const VOLUNTEERS: Volunteer[] = [김봉사, 이도움, 홍길동];

function record(
  id: string,
  weekKey: string,
  volunteer: string,
  category: ShepherdRecord['category'],
  student: Student,
): ShepherdRecord {
  return { id, timestamp: '', weekKey, volunteer, category, student };
}

const RECORDS: ShepherdRecord[] = [
  record('1', '2026-08-02', '김봉사', '성경', 늘찬),
  record('2', '2026-08-02', '김봉사', '성경', 여름),
  record('3', '2026-08-02', '홍길동', '문자', 늘찬),
  record('4', '2026-08-02', '홍길동', '통화', 늘찬),
  record('5', '2026-08-09', '김봉사', '만남', 늘찬),
  record('6', '2026-08-02', '이도움', '문자', 한별2),
];

function row(summary: Summary, name: string, extra?: string) {
  return summary.rows.find((r) => r.lead[1] === name && (!extra || r.lead.includes(extra)))!;
}

test('받은목양 머리글은 No.·이름·그룹·학년·합계 뒤에 주차별 4항목이 붙는다', () => {
  const summary = buildReceivedSummary(RECORDS, STUDENTS, WEEKS);
  assert.deepEqual(summary.headerTop.slice(0, 5), ['No.', '이름', '그룹', '학년', '합계']);
  assert.equal(summary.headerTop[5], '8/2~8/8');
  assert.equal(summary.headerTop[9], '8/9~8/15');
  assert.deepEqual(summary.headerBottom.slice(5, 9), ['문자', '통화', '성경', '만남']);
  assert.equal(summary.leadColumns, 5);
});

test('받은목양 칸은 건수를 세고 어느 봉사자였는지 메모로 남긴다', () => {
  const summary = buildReceivedSummary(RECORDS, STUDENTS, WEEKS);
  const 늘찬행 = row(summary, '오늘찬');

  // 1주차: 문자 1(홍길동), 통화 1(홍길동), 성경 1(김봉사), 만남 0
  assert.deepEqual(늘찬행.cells.slice(0, 4).map((c) => c.count), [1, 1, 1, 0]);
  assert.equal(늘찬행.cells[0].note, '홍길동');
  assert.equal(늘찬행.cells[2].note, '김봉사');
  // 히트맵이라 값은 비워 둔다
  assert.equal(늘찬행.cells[0].text, '');
  assert.equal(늘찬행.cells[7].count, 1); // 2주차 만남
  assert.equal(늘찬행.lead[4], '4');
});

test('한목양은 봉사자가 행이고 담당 그룹을 함께 보여 준다', () => {
  const summary = buildGivenSummary(RECORDS, VOLUNTEERS, STUDENTS, WEEKS);
  assert.deepEqual(summary.headerTop.slice(0, 4), ['No.', '이름', '담당', '합계']);
  assert.equal(summary.leadColumns, 4);

  const 봉사 = row(summary, '김봉사');
  assert.equal(봉사.lead[2], '중학생 형제');
  assert.equal(봉사.cells[2].text, '오늘찬, 최여름'); // 1주차 성경
  assert.equal(봉사.cells[7].text, '오늘찬'); // 2주차 만남
  assert.equal(봉사.lead[3], '3');

  // 담당을 안 고른 봉사자는 '전체'
  assert.equal(row(summary, '홍길동').lead[2], '전체');
});

test('한목양 칸의 동명이인 학생은 학년을 붙여 구분한다', () => {
  const summary = buildGivenSummary(RECORDS, VOLUNTEERS, STUDENTS, WEEKS);
  assert.equal(row(summary, '이도움').cells[0].text, '이한별(고2)');
});

test('받은목양 행 순서는 학생 명단을 따르고 그룹이 바뀌는 자리를 표시한다', () => {
  const summary = buildReceivedSummary(RECORDS, STUDENTS, WEEKS);
  assert.deepEqual(
    summary.rows.map((r) => r.lead[1]),
    ['박다온', '오늘찬', '최여름', '이한별', '이한별'],
  );
  assert.deepEqual(
    summary.rows.map((r) => r.startsGroup),
    [false, false, false, true, false],
  );
  assert.deepEqual(summary.rows.map((r) => r.lead[0]), ['1', '2', '3', '4', '5']);
});

test('표에 없는 주차의 기록은 세지 않는다', () => {
  const summary = buildReceivedSummary(RECORDS, STUDENTS, ['2026-08-09']);
  assert.equal(row(summary, '오늘찬').lead[4], '1');
});

test('명단에서 빠진 학생·봉사자도 기록이 있으면 행이 남는다', () => {
  const received = buildReceivedSummary(RECORDS, [다온], WEEKS);
  const names = received.rows.map((r) => r.lead[1]);
  assert.ok(names.includes('오늘찬'));
  assert.ok(names.includes('최여름'));

  const given = buildGivenSummary(RECORDS, [김봉사], STUDENTS, WEEKS);
  assert.ok(given.rows.map((r) => r.lead[1]).includes('홍길동'));
});

test('기록이 없는 봉사자도 행은 남고 합계는 비어 있다', () => {
  const summary = buildGivenSummary([], VOLUNTEERS, STUDENTS, WEEKS);
  assert.equal(summary.rows.length, 3);
  assert.equal(row(summary, '김봉사').lead[3], '');
});

test('요약 주차는 이번 주를 맨 앞에 두고 과거로 이어진다', () => {
  const weeks = summaryWeeks(6, new Date('2026-08-05T03:00:00Z'));
  assert.equal(weeks.length, 6);
  assert.equal(weeks[0], '2026-08-02');
  assert.equal(weeks.at(-1), '2026-06-28');
});
