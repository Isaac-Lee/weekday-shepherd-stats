/**
 * 주차 계산. 기준 시간대는 한국(Asia/Seoul), 한 주는 일요일(주일)에 시작해서 토요일에 끝난다.
 * 주차 키는 그 주 일요일의 날짜(YYYY-MM-DD)를 그대로 쓴다. 문자열 정렬 = 시간순 정렬이라 다루기 편하다.
 */

const TZ = 'Asia/Seoul';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 지금 시각 기준 한국 날짜 (YYYY-MM-DD) */
export function todayInSeoul(now: Date = new Date()): string {
  return dateFormatter.format(now);
}

/** 한국 시간 기준 ISO 타임스탬프 (기록 시트용) */
export function timestampInSeoul(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function toUTCDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 해당 날짜가 속한 주의 일요일 날짜를 반환한다. 이 값이 주차 키다. */
export function weekKeyOf(isoDate: string): string {
  const date = toUTCDate(isoDate);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return toISODate(date);
}

/** 지금 시각이 속한 주차 키 */
export function currentWeekKey(now: Date = new Date()): string {
  return weekKeyOf(todayInSeoul(now));
}

/** 주차 키에 offset 주를 더한 주차 키 (-1 = 지난주) */
export function shiftWeek(weekKey: string, offset: number): string {
  const date = toUTCDate(weekKey);
  date.setUTCDate(date.getUTCDate() + offset * 7);
  return toISODate(date);
}

/** 시트 헤더에 쓸 라벨. 예: "8/2~8/8" */
export function weekLabel(weekKey: string): string {
  const start = toUTCDate(weekKey);
  const end = toUTCDate(weekKey);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${start.getUTCMonth() + 1}/${start.getUTCDate()}~${end.getUTCMonth() + 1}/${end.getUTCDate()}`;
}

/**
 * 주차 버튼에 쓸 라벨. 예: "8/2(주일)~8/8(토)"
 * 주차는 늘 주일에 시작해 토요일에 끝나므로 요일은 고정이다.
 * 시트 헤더는 좁아서 요일 없는 weekLabel을 그대로 쓴다.
 */
export function weekLabelWithDay(weekKey: string): string {
  const [start, end] = weekLabel(weekKey).split('~');
  return `${start}(주일)~${end}(토)`;
}

/** 화면에 쓸 긴 라벨. 예: "2026년 8월 2일(주일) ~ 8월 8일(토)" */
export function weekLabelLong(weekKey: string): string {
  const start = toUTCDate(weekKey);
  const end = toUTCDate(weekKey);
  end.setUTCDate(end.getUTCDate() + 6);
  return (
    `${start.getUTCFullYear()}년 ${start.getUTCMonth() + 1}월 ${start.getUTCDate()}일(주일) ~ ` +
    `${end.getUTCMonth() + 1}월 ${end.getUTCDate()}일(토)`
  );
}

/** 시작 주차부터 끝 주차까지 빠짐없이 나열한다 (과거 → 최신). */
export function weekRange(fromKey: string, toKey: string): string[] {
  const keys: string[] = [];
  let cursor = fromKey;
  // 데이터가 이상해도 무한루프에 빠지지 않도록 상한을 둔다 (약 10년).
  for (let i = 0; i < 520 && cursor <= toKey; i += 1) {
    keys.push(cursor);
    cursor = shiftWeek(cursor, 1);
  }
  return keys;
}
