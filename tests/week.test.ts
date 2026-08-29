import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  currentWeekKey,
  shiftWeek,
  weekKeyOf,
  weekLabel,
  weekLabelWithDay,
  weekRange,
} from '@/lib/week';

test('주차 키는 그 주 일요일 날짜다', () => {
  // 2026-08-02는 일요일
  assert.equal(weekKeyOf('2026-08-02'), '2026-08-02');
  assert.equal(weekKeyOf('2026-08-05'), '2026-08-02'); // 수요일
  assert.equal(weekKeyOf('2026-08-08'), '2026-08-02'); // 토요일
  assert.equal(weekKeyOf('2026-08-09'), '2026-08-09'); // 다음 주일
});

test('월 경계와 해 경계를 넘어간다', () => {
  assert.equal(weekKeyOf('2026-01-01'), '2025-12-28');
  assert.equal(shiftWeek('2025-12-28', 1), '2026-01-04');
  assert.equal(shiftWeek('2026-01-04', -1), '2025-12-28');
});

test('한국 시간 기준으로 주차를 정한다', () => {
  // 2026-08-09 15:00 UTC = 2026-08-10(월) 00:00 KST → 8/9 시작 주
  assert.equal(currentWeekKey(new Date('2026-08-09T15:00:00Z')), '2026-08-09');
  // 2026-08-08 20:00 UTC = 2026-08-09(일) 05:00 KST → 이미 다음 주
  assert.equal(currentWeekKey(new Date('2026-08-08T20:00:00Z')), '2026-08-09');
});

test('라벨은 주일~토요일 범위로 만든다', () => {
  assert.equal(weekLabel('2026-08-02'), '8/2~8/8');
  assert.equal(weekLabel('2025-12-28'), '12/28~1/3');
  // 버튼용 라벨은 요일까지 붙는다. 시작은 늘 주일, 끝은 늘 토요일이다.
  assert.equal(weekLabelWithDay('2026-08-02'), '8/2(주일)~8/8(토)');
  assert.equal(weekLabelWithDay('2025-12-28'), '12/28(주일)~1/3(토)');
});

test('주차 범위는 빈 주 없이 이어진다', () => {
  assert.deepEqual(weekRange('2026-08-02', '2026-08-23'), [
    '2026-08-02',
    '2026-08-09',
    '2026-08-16',
    '2026-08-23',
  ]);
  assert.deepEqual(weekRange('2026-08-02', '2026-08-02'), ['2026-08-02']);
});
