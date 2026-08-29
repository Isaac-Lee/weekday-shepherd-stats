import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SEED_STUDENTS } from '@/data/roster';
import { isStudentName, joinKoreanName, splitKoreanName, studentSortKey, type Student } from '@/lib/members';

test('세 글자는 성 한 글자 + 이름 두 글자로 나눈다', () => {
  assert.deepEqual(splitKoreanName('김하늘'), { surname: '김', given: '하늘' });
  assert.deepEqual(splitKoreanName('이보람'), { surname: '이', given: '보람' });
});

test('두 글자 성씨를 알아본다', () => {
  assert.deepEqual(splitKoreanName('남궁하늘'), { surname: '남궁', given: '하늘' });
  // 두 글자 성씨가 아니면 넉 자여도 성은 한 글자다
  assert.deepEqual(splitKoreanName('김민수현'), { surname: '김', given: '민수현' });
});

test('두 글자 이하는 성을 비워 두고 사용자에게 물어본다', () => {
  // '보람'이 이름만인지 '김구'처럼 성 + 외자인지는 글자만 봐서는 알 수 없다.
  assert.deepEqual(splitKoreanName('보람'), { surname: '', given: '보람' });
  assert.deepEqual(splitKoreanName('구'), { surname: '', given: '구' });
});

test('공백은 정리한다', () => {
  assert.deepEqual(splitKoreanName('  김 하늘 '), { surname: '김', given: '하늘' });
});

test('성과 이름을 다시 붙인다 — 성이 없으면 이름만', () => {
  assert.equal(joinKoreanName({ surname: '이', given: '보람' }), '이보람');
  assert.equal(joinKoreanName({ surname: '', given: '보람' }), '보람');
  // 외자 이름
  assert.equal(joinKoreanName({ surname: '김', given: '구' }), '김구');
  assert.equal(joinKoreanName({ surname: ' 이 ', given: ' 보람 ' }), '이보람');
});

test('정렬 키는 그룹이 먼저, 같은 그룹 안에서는 학년 순이다', () => {
  const key = (group: Student['group'], grade: Student['grade']) => studentSortKey({ group, grade });

  assert.ok(key('초등학생 형제', '초6') < key('초등학생 자매', '초1'));
  assert.ok(key('초등학생 자매', '초6') < key('중학생 형제', '중1'));
  assert.ok(key('중학생 형제', '중1') < key('중학생 형제', '중3'));
  assert.ok(key('중학생 형제', '중3') < key('중학생 자매', '중1'));
  assert.ok(key('고등학생 자매', '고3') < key('고등학생 자매', '미분류'));
});

/** 시트에 넣을 자리를 고르는 규칙. lib/sheets.ts 의 insertStudentsInOrder 와 같은 계산이다. */
function insertRowIndex(student: Student, roster: Student[]): number {
  const key = studentSortKey(student);
  let rowIndex = 1;
  roster.forEach((existing, offset) => {
    if (studentSortKey(existing) <= key) rowIndex = offset + 2;
  });
  return rowIndex;
}

test('새 학생은 자기 그룹·학년 블록의 끝에 들어간다', () => {
  const roster: Student[] = [
    { name: '박다온', group: '중학생 형제', grade: '중1' },
    { name: '최여름', group: '중학생 형제', grade: '중2' },
    { name: '김슬기', group: '중학생 자매', grade: '중1' },
    { name: '최한별', group: '고등학생 형제', grade: '고1' },
  ];

  // 중학생 형제 중2 → 최여름 다음(시트 3행 다음 = 4행 자리)
  assert.equal(insertRowIndex({ name: '새로', group: '중학생 형제', grade: '중2' }, roster), 3);
  // 중학생 형제 중3 → 여전히 중학생 자매보다 위
  assert.equal(insertRowIndex({ name: '새로', group: '중학생 형제', grade: '중3' }, roster), 3);
  // 중학생 자매 중1 → 김슬기 다음
  assert.equal(insertRowIndex({ name: '새로', group: '중학생 자매', grade: '중1' }, roster), 4);
  // 맨 마지막 그룹이면 표 끝
  assert.equal(insertRowIndex({ name: '새로', group: '고등학생 자매', grade: '고1' }, roster), 5);
});

test('제일 앞 그룹의 새 학생은 헤더 바로 아래로 들어간다', () => {
  const roster: Student[] = [{ name: '박다온', group: '중학생 형제', grade: '중1' }];
  assert.equal(insertRowIndex({ name: '새로', group: '초등학생 형제', grade: '초1' }, roster), 1);
});

test('실제 명단에서도 중학생 형제를 넣으면 중학생 자매 위에 선다', () => {
  const at = insertRowIndex({ name: '김하늘', group: '중학생 형제', grade: '중2' }, SEED_STUDENTS);
  // 그 자리에 원래 있던 학생(=한 칸 밀려날 학생)은 아직 중학생 형제여야 한다.
  const pushed = SEED_STUDENTS[at - 1];
  assert.equal(pushed.group, '중학생 형제');
  assert.equal(pushed.grade, '중3');
});

test('학생 이름은 완성형 한글 2~5자만 받는다', () => {
  assert.ok(isStudentName('이보람'));
  assert.ok(isStudentName('남궁하늘'));
  // 대시 대신 친 'ㅡ'(U+3161)가 섞인 이름은 막는다. 이게 명단에 들어가 '보람' 매칭을 망쳤다.
  assert.ok(!isStudentName('ㅡ보람'));
  assert.ok(!isStudentName('보람-'));
  assert.ok(!isStudentName('Boram'));
  assert.ok(!isStudentName('람'));
  // 자모가 분리된 NFD 표기도 한 글자로 세어 통과시킨다
  assert.ok(isStudentName('이보람'.normalize('NFD')));
});
