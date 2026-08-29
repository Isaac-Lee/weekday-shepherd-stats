import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SEED_STUDENTS, SEED_VOLUNTEERS } from '@/data/roster';
import { gradesForGroup, GRADES, GROUPS, studentLabel } from '@/lib/members';
import { resolveName } from '@/lib/parse';

test('학생 명단에 있는 이름은 그룹·학년까지 함께 찾아 준다', () => {
  const result = resolveName('박다온', SEED_STUDENTS);
  assert.equal(result.status, 'matched');
  assert.equal(result.name, '박다온');
  assert.equal(result.group, '중학생 형제');
  assert.equal(result.grade, '중1');
});

test('성을 뺀 이름도 유일하면 채워 준다', () => {
  const result = resolveName('여름', SEED_STUDENTS);
  assert.equal(result.status, 'matched');
  assert.equal(result.name, '최여름');
});

test('호칭과 호격 이를 떼고 대조한다', () => {
  assert.equal(resolveName('여름이', SEED_STUDENTS).name, '최여름');
  assert.equal(resolveName('최여름 형제님', SEED_STUDENTS).name, '최여름');
});

test('성을 뺀 이름이 겹치면 후보를 돌려준다 — 다온 (박다온 / 한다온)', () => {
  const result = resolveName('다온', SEED_STUDENTS);
  assert.equal(result.status, 'ambiguous');
  assert.deepEqual(result.candidates?.map((s) => s.name).sort(), ['박다온', '한다온']);
});

test('봉사자의 담당 그룹을 우선한다 — 슬기 (중등 김슬기 / 고등 최슬기)', () => {
  const 중등 = resolveName('슬기', SEED_STUDENTS, ['중학생 자매']);
  assert.equal(중등.status, 'matched');
  assert.equal(중등.name, '김슬기');

  const 고등 = resolveName('슬기', SEED_STUDENTS, ['고등학생 자매']);
  assert.equal(고등.status, 'matched');
  assert.equal(고등.name, '최슬기');
});

test('담당 그룹을 여러 개 맡아도 그 안에서만 좁힌다', () => {
  const result = resolveName('슬기', SEED_STUDENTS, ['중학생 자매', '고등학생 자매']);
  assert.equal(result.status, 'ambiguous');
  assert.deepEqual(result.candidates?.map((s) => s.name).sort(), ['김슬기', '최슬기']);
});

test('담당 그룹을 안 골랐으면 학생 전체에서 찾는다', () => {
  const result = resolveName('슬기', SEED_STUDENTS);
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.candidates?.length, 2);
});

test('그룹을 좁혀도 여전히 여럿이면 물어본다 — 이한별 (고1 / 고2)', () => {
  const result = resolveName('이한별', SEED_STUDENTS, ['고등학생 자매']);
  assert.equal(result.status, 'ambiguous');
  assert.deepEqual(result.candidates?.map((s) => s.grade).sort(), ['고1', '고2']);
});

test('담당 그룹에 없는 이름이면 다른 그룹에서라도 찾아 준다', () => {
  // 중등 형제 담당이 고등학생 자매를 적어도 그냥 넘어가지 않는다.
  const result = resolveName('조예솔', SEED_STUDENTS, ['중학생 형제']);
  assert.equal(result.status, 'matched');
  assert.equal(result.group, '고등학생 자매');
});

test('학생 명단에 없으면 새 이름으로 표시한다', () => {
  const result = resolveName('없는이름', SEED_STUDENTS, ['중학생 형제']);
  assert.equal(result.status, 'new');
  assert.equal(result.name, '없는이름');
  assert.equal(result.group, undefined);
});

test('봉사자 이름은 학생 매칭에 섞이지 않는다', () => {
  // 봉사자 '김봉사'와 학생 '김슬기'는 서로 다른 명단이다.
  const result = resolveName('김봉사', SEED_STUDENTS);
  assert.equal(result.status, 'new');
});

test('동명이인만 학년을 덧붙여 표시한다', () => {
  const 한별 = SEED_STUDENTS.find((s) => s.name === '이한별' && s.grade === '고1')!;
  const 다온 = SEED_STUDENTS.find((s) => s.name === '박다온')!;
  assert.equal(studentLabel(한별, SEED_STUDENTS), '이한별(고1)');
  assert.equal(studentLabel(다온, SEED_STUDENTS), '박다온');
});

test('예시 명단은 그룹마다 최소 한 명씩 들어 있다', () => {
  const count = (group: string) => SEED_STUDENTS.filter((student) => student.group === group).length;
  for (const group of GROUPS) assert.ok(count(group) > 0, `${group} 가 비어 있다`);
  assert.equal(SEED_STUDENTS.length, 19);

  assert.equal(SEED_VOLUNTEERS.length, 8);
  assert.equal(new Set(SEED_VOLUNTEERS.map((v) => v.name)).size, 8, '봉사자 이름에 중복이 없어야 한다');
});

test('초등학생도 다른 학교급과 똑같이 찾아진다', () => {
  const result = resolveName('이보람', SEED_STUDENTS);
  assert.equal(result.status, 'matched');
  assert.equal(result.group, '초등학생 자매');
  assert.equal(result.grade, '초6');

  // 성을 빼고 불러도, 호격 '이'를 붙여도 마찬가지
  assert.equal(resolveName('보람', SEED_STUDENTS).name, '이보람');
  assert.equal(resolveName('보람', SEED_STUDENTS, ['초등학생 자매']).name, '이보람');
});

test('학년 선택지는 그룹의 학교급에 맞는 것만 나온다', () => {
  assert.deepEqual(gradesForGroup('초등학생 자매'), ['초1', '초2', '초3', '초4', '초5', '초6', '미분류']);
  assert.deepEqual(gradesForGroup('중학생 형제'), ['중1', '중2', '중3', '미분류']);
  assert.deepEqual(gradesForGroup('고등학생 자매'), ['고1', '고2', '고3', '미분류']);

  // 학년을 모를 때를 위해 '미분류'는 어느 그룹에서든 마지막에 남는다.
  for (const group of GROUPS) {
    assert.equal(gradesForGroup(group).at(-1), '미분류');
  }
});

test('그룹 순서는 학교급이 낮은 쪽부터다', () => {
  assert.deepEqual(GROUPS, [
    '초등학생 형제',
    '초등학생 자매',
    '중학생 형제',
    '중학생 자매',
    '고등학생 형제',
    '고등학생 자매',
  ]);
  // 학년도 낮은 쪽부터여야 요약표가 종이 양식과 같은 순서로 선다.
  assert.deepEqual(GRADES.slice(0, 7), ['초1', '초2', '초3', '초4', '초5', '초6', '중1']);
  assert.equal(GRADES.at(-1), '미분류');
});
