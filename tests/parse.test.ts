import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseMessage } from '@/lib/parse';

function asMap(text: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const group of parseMessage(text).groups) result[group.category] = group.names;
  return result;
}

test('가장 흔한 형태를 읽는다', () => {
  assert.deepEqual(asMap('성경 - 철수, 영희\n문자- 민수'), {
    문자: ['민수'],
    성경: ['철수', '영희'],
  });
});

test('구분자와 별칭이 달라도 읽는다', () => {
  assert.deepEqual(asMap('카톡: 철수\n전화 – 영희\n말씀) 민수\n심방 지혜'), {
    문자: ['철수'],
    통화: ['영희'],
    성경: ['민수'],
    만남: ['지혜'],
  });
});

test('이름 구분자로 쉼표, 슬래시, 공백을 모두 받는다', () => {
  assert.deepEqual(asMap('성경 - 철수, 영희 / 민수·지혜'), {
    성경: ['철수', '영희', '민수', '지혜'],
  });
});

test('한 줄에 여러 항목을 적으면 이름을 공유한다', () => {
  assert.deepEqual(asMap('문자 통화 - 철수'), {
    문자: ['철수'],
    통화: ['철수'],
  });
});

test('같은 항목이 여러 번 나오면 합치고 중복은 지운다', () => {
  assert.deepEqual(asMap('문자 - 철수\n문자 - 영희, 철수'), {
    문자: ['철수', '영희'],
  });
});

test('"없음"은 이름으로 세지 않는다', () => {
  assert.deepEqual(asMap('만남 - 없음\n문자 - 철수'), { 문자: ['철수'] });
});

test('글머리표와 번호를 걷어낸다', () => {
  assert.deepEqual(asMap('1. 문자 - 철수\n2. 통화 - 영희'), {
    문자: ['철수'],
    통화: ['영희'],
  });
});

test('긴 별칭이 짧은 별칭보다 먼저 걸린다', () => {
  assert.deepEqual(asMap('문자메시지 - 철수'), { 문자: ['철수'] });
});

test('끝에 붙인 인사말은 이름으로 세지 않는다', () => {
  const result = parseMessage('성경 - 철수, 영희\n문자- 민수\n이번주 참 감사했습니다');
  assert.deepEqual(asMap('성경 - 철수, 영희\n문자- 민수\n이번주 참 감사했습니다'), {
    문자: ['민수'],
    성경: ['철수', '영희'],
  });
  assert.deepEqual(result.ignored, ['이번주 참 감사했습니다']);
});

test('항목만 적힌 줄 아래에 이름을 나열해도 읽는다', () => {
  assert.deepEqual(asMap('성경\n- 철수\n- 영희\n문자\n- 민수'), {
    문자: ['민수'],
    성경: ['철수', '영희'],
  });
});

test('이름 줄 다음에 이어지는 이름 줄도 같은 항목에 붙는다', () => {
  assert.deepEqual(asMap('성경 - 철수\n영희, 지혜'), {
    성경: ['철수', '영희', '지혜'],
  });
});

test('같은 줄에 섞인 문장 조각은 이름에서 빼고 알려 준다', () => {
  const result = parseMessage('문자 - 철수 정말감사했습니다');
  assert.deepEqual(result.groups, [{ category: '문자', names: ['철수'] }]);
  assert.deepEqual(result.ignored, ['정말감사했습니다']);
});

test('항목이 하나도 없으면 통째로 ignored로 넘긴다', () => {
  const result = parseMessage('이번 주는 바빴습니다');
  assert.equal(result.groups.length, 0);
  assert.deepEqual(result.ignored, ['이번 주는 바빴습니다']);
});

test('항목 앞의 잡담은 ignored에 담고 나머지는 읽는다', () => {
  const result = parseMessage('한 주 보고드립니다\n성경 - 철수');
  assert.deepEqual(result.ignored, ['한 주 보고드립니다']);
  assert.deepEqual(result.groups, [{ category: '성경', names: ['철수'] }]);
});

test('빈 입력은 조용히 빈 결과', () => {
  assert.deepEqual(parseMessage(''), { groups: [], ignored: [] });
});

test("이름 앞의 'ㅡ'(대시 오타)는 떼어 낸다", () => {
  const result = parseMessage('문자 - ㅡ보람, 다온');
  assert.deepEqual(result.groups, [{ category: '문자', names: ['보람', '다온'] }]);
});
