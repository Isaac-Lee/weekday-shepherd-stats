/**
 * 채팅으로 들어온 주중 목양 보고를 항목/이름으로 쪼갠다.
 *
 * 사람들이 실제로 보내는 모양은 제각각이라 줄 단위로만 자르면 놓치는 게 많다.
 * 그래서 텍스트 전체에서 항목 키워드를 찾아내고, 키워드 사이에 낀 글자를 이름으로 본다.
 *
 *   성경 - 철수, 영희      →  성경: [철수, 영희]
 *   문자- 민수             →  문자: [민수]
 *   통화/만남 : 지혜        →  통화: [지혜], 만남: [지혜]
 */

import type { Grade, Group, Student } from './members';

export const CATEGORIES = ['문자', '통화', '성경', '만남'] as const;
export type Category = (typeof CATEGORIES)[number];

/** 별칭 → 정식 항목. 키는 정규화(소문자, 공백 제거)된 형태로 적는다. */
const CATEGORY_ALIASES: Record<string, Category> = {
  문자: '문자',
  문자메시지: '문자',
  메시지: '문자',
  메세지: '문자',
  카톡: '문자',
  카카오톡: '문자',
  톡: '문자',
  sms: '문자',
  dm: '문자',

  통화: '통화',
  전화통화: '통화',
  전화: '통화',
  음성통화: '통화',
  콜: '통화',
  call: '통화',

  성경: '성경',
  성경읽기: '성경',
  성경통독: '성경',
  성경나눔: '성경',
  통독: '성경',
  말씀: '성경',
  말씀나눔: '성경',
  큐티: '성경',
  qt: '성경',

  만남: '만남',
  만나기: '만남',
  대면: '만남',
  미팅: '만남',
  심방: '만남',
  모임: '만남',
  식사: '만남',
};

/** "만남 - 없음"처럼 비어 있음을 뜻하는 표현. 이름으로 세지 않는다. */
const EMPTY_TOKENS = new Set(['없음', '없습니다', '없었음', '없슴', '없', '무', 'x', 'none', '-', '패스', 'pass']);

/** 이름 뒤에 붙는 호칭. 명단과 대조할 때만 벗겨낸다. */
const HONORIFICS = [
  '전도사님',
  '전도사',
  '선생님',
  '목사님',
  '목사',
  '집사님',
  '집사',
  '권사님',
  '권사',
  '장로님',
  '장로',
  '형제님',
  '형제',
  '자매님',
  '자매',
  '누나',
  '언니',
  '오빠',
  '님',
  '씨',
  '형',
  '샘',
  '쌤',
];

function normalizeKeyword(value: string): string {
  // NFC 정규화: 자모가 분리된 유니코드(NFD)로 저장된 이름과 비교할 때 다른 문자열로 보이는 문제를 막는다.
  return value.normalize('NFC').toLowerCase().replace(/\s+/g, '');
}

/** 정규식에서 긴 별칭이 먼저 걸리도록 길이 내림차순으로 정렬한다. ("문자메시지"가 "문자"보다 먼저) */
const ALIAS_KEYS = Object.keys(CATEGORY_ALIASES).sort((a, b) => b.length - a.length);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 항목 키워드 + 뒤따르는 구분자(-, :, 등)를 통째로 잡는다. */
const HEADER_PATTERN = new RegExp(
  `(${ALIAS_KEYS.map(escapeRegExp).join('|')})\\s*[-–—~:：=>》」』\\)\\]\\.]*\\s*`,
  'giu',
);

const NAME_SPLIT_PATTERN = /[,;、·ㆍ/|]+|\s+/u;

/** 이름이 아니라 문장으로 보이는 조각. "감사했습니다" 같은 인사말을 이름으로 세지 않기 위한 방어선. */
const PROSE_PATTERN = /(습니다|입니다|했어요|하였|합니다|해요|네요|같아요|드립니다|감사|기도|축복|은혜받)/u;

/** 한국 이름은 대부분 2~4자다. 이보다 길면 문장 조각일 가능성이 높다. */
const MAX_NAME_LENGTH = 5;

export interface ParsedGroup {
  category: Category;
  names: string[];
}

export interface ParseResult {
  groups: ParsedGroup[];
  /** 이름으로 보기 어려워 버린 조각. UI에서 사용자에게 그대로 보여 준다. */
  ignored: string[];
}

function tokenize(segment: string): string[] {
  return segment
    .split(NAME_SPLIT_PATTERN)
    .map((token) =>
      token
        // 앞뒤 글머리표/번호/괄호/따옴표 제거
        .replace(/^[\s\d]*[.)\]]?\s*/u, '')
        // 'ㅡ'(U+3161)는 대시를 치려다 한글 자판에서 나오는 글자다. 이름 앞에 붙으면 떼어 낸다.
        .replace(/^[-–—ㅡー*•▪◦>"'`(\[]+/u, '')
        .replace(/[.,!?~"'`)\]]+$/u, '')
        .trim(),
    )
    .filter((token) => token.length > 0);
}

interface Segment {
  names: string[];
  /** 이름으로 인정하지 않고 버린 조각 */
  rejected: string[];
  /** "없음"처럼 대상이 없다고 명시한 경우. 뒤 항목의 이름을 물려받으면 안 된다. */
  declaredEmpty: boolean;
}

function splitSegment(segment: string): Segment {
  const tokens = tokenize(segment);
  const names: string[] = [];
  const rejected: string[] = [];
  let sawEmptyMarker = false;

  for (const token of tokens) {
    if (EMPTY_TOKENS.has(normalizeKeyword(token))) {
      sawEmptyMarker = true;
    } else if (token.length > MAX_NAME_LENGTH || PROSE_PATTERN.test(token)) {
      rejected.push(token);
    } else {
      names.push(token);
    }
  }

  return { names, rejected, declaredEmpty: names.length === 0 && sawEmptyMarker };
}

/**
 * 항목이 없는 줄이 앞 항목의 이름 목록을 이어가는 줄인지 판단한다.
 * 구분자 없이 세 덩어리 이상이면 이름 나열보다 문장일 확률이 높다고 본다.
 */
function looksLikeNameList(line: string): boolean {
  const tokens = tokenize(line);
  if (tokens.length === 0) return false;
  if (tokens.some((token) => token.length > MAX_NAME_LENGTH || PROSE_PATTERN.test(token))) return false;
  const hasDelimiter = /[,;、·ㆍ/|]/u.test(line);
  return hasDelimiter || tokens.length < 3;
}

/**
 * 메시지를 항목별 이름 목록으로 바꾼다. 판단은 줄 단위로 한다.
 *
 *  - 같은 줄의 항목 뒤에 오는 글자는 이름 후보다.
 *  - 항목이 없는 줄은 바로 앞 항목의 이름 목록을 잇는 줄로 본다. 단 문장처럼 보이면 버린다.
 *  - 이름을 못 받은 항목("문자 통화 - 철수"의 문자)은 다음으로 이름을 받는 항목과 함께 묶인다.
 */
export function parseMessage(text: string): ParseResult {
  const source = text ?? '';
  const ignored: string[] = [];
  const merged = new Map<Category, string[]>();

  /** 아직 이름을 못 받아 다음 항목에 붙을 항목들 */
  let pending: Category[] = [];
  /** 직전에 이름을 받은 항목들. 다음 줄이 이름만 있는 줄일 때 여기에 붙는다. */
  let lastTargets: Category[] = [];

  const add = (categories: Category[], names: string[]) => {
    for (const category of categories) {
      const bucket = merged.get(category) ?? [];
      for (const name of names) {
        if (!bucket.includes(name)) bucket.push(name);
      }
      merged.set(category, bucket);
    }
  };

  for (const rawLine of source.split(/\r?\n/)) {
    // 줄 앞의 번호와 글머리표는 항목 인식을 방해하므로 먼저 걷어낸다.
    const line = rawLine.trim().replace(/^(?:\d+[.)]|[-–—*•▪◦>])\s*/u, '').trim();
    if (!line) continue;

    const matches = [...line.matchAll(HEADER_PATTERN)];

    if (matches.length === 0) {
      const targets = pending.length > 0 ? pending : lastTargets;
      if (targets.length > 0 && looksLikeNameList(line)) {
        const segment = splitSegment(line);
        if (segment.names.length > 0) {
          add(targets, segment.names);
          lastTargets = targets;
          pending = [];
          continue;
        }
      }
      ignored.push(line);
      continue;
    }

    const preface = line.slice(0, matches[0].index).trim();
    if (preface) ignored.push(preface);

    matches.forEach((match, i) => {
      const category = CATEGORY_ALIASES[normalizeKeyword(match[1])];
      const start = match.index + match[0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index : line.length;
      const segment = splitSegment(line.slice(start, end));
      ignored.push(...segment.rejected);

      if (segment.names.length === 0) {
        if (!segment.declaredEmpty) pending.push(category);
        return;
      }

      const targets = [...pending, category];
      add(targets, segment.names);
      lastTargets = targets;
      pending = [];
    });
  }

  // 끝까지 이름을 못 받은 항목은 "해당 없음"으로 보고 조용히 버린다.

  const groups: ParsedGroup[] = CATEGORIES.filter((category) => merged.has(category)).map((category) => ({
    category,
    names: merged.get(category)!,
  }));

  return { groups, ignored };
}

export type NameStatus = 'matched' | 'ambiguous' | 'new';

export interface ResolvedName {
  /** 사용자가 입력한 원문 */
  input: string;
  /** 시트에 기록될 이름. 명단에 걸리면 명단 표기를 따른다. */
  name: string;
  /** 학생 명단에서 찾았을 때의 그룹·학년. 못 찾았으면 없다. */
  group?: Group;
  grade?: Grade;
  status: NameStatus;
  /** ambiguous일 때 후보 목록 */
  candidates?: Student[];
}

function stripHonorific(value: string): string {
  let result = value;
  let changed = true;
  while (changed) {
    changed = false;
    for (const honorific of HONORIFICS) {
      // 호칭을 떼고 두 글자 이상 남을 때만 인정한다. ("형" 한 글자짜리 이름 보호)
      if (result.endsWith(honorific) && result.length - honorific.length >= 2) {
        result = result.slice(0, -honorific.length);
        changed = true;
        break;
      }
    }
  }
  return result;
}

/** "다온이", "한별이"처럼 이름 뒤에 붙는 호격 '이'를 뗀다. 매칭이 실패했을 때만 쓰는 보조 수단이다. */
function dropVocative(value: string): string {
  return value.endsWith('이') && value.length >= 3 ? value.slice(0, -1) : value;
}

/**
 * 채팅에 적힌 이름을 학생 명단과 대조한다.
 *
 * 정확도의 핵심은 `preferGroups`다. 봉사자는 대개 한 그룹을 맡으므로,
 * 후보가 여러 명이면 그 봉사자의 담당 그룹부터 본다.
 * 이 덕분에 `슬기`(중등 김슬기 / 고등 최슬기) 같은 충돌이 대부분 저절로 풀린다.
 * 담당 그룹을 안 골랐으면 학생 전체에서 찾고, 그래도 여럿이면 화면에서 고르게 한다.
 */
export function resolveName(
  input: string,
  students: Student[],
  preferGroups: Group[] = [],
): ResolvedName {
  const cleaned = input.trim();
  const compact = normalizeKeyword(cleaned);
  const stripped = normalizeKeyword(stripHonorific(cleaned));
  const table = students.map((student) => ({ student, compact: normalizeKeyword(student.name) }));

  // 확실한 형태부터 순서대로 시도한다.
  const needles: string[] = [];
  for (const candidate of [compact, stripped, dropVocative(compact), dropVocative(stripped)]) {
    if (candidate && !needles.includes(candidate)) needles.push(candidate);
  }

  const decide = (matches: { student: Student }[]): ResolvedName => {
    const narrowed =
      preferGroups.length > 0
        ? matches.filter((entry) => preferGroups.includes(entry.student.group))
        : [];
    const finalists = narrowed.length > 0 ? narrowed : matches;

    if (finalists.length === 1) {
      const { student } = finalists[0];
      return {
        input: cleaned,
        name: student.name,
        group: student.group,
        grade: student.grade,
        status: 'matched',
      };
    }
    return {
      input: cleaned,
      name: cleaned,
      status: 'ambiguous',
      candidates: finalists.map((entry) => entry.student),
    };
  };

  // 1단계: 이름 전체가 그대로 일치
  for (const needle of needles) {
    const matches = table.filter((entry) => entry.compact === needle);
    if (matches.length > 0) return decide(matches);
  }

  // 2단계: "철수" → "김철수"처럼 성을 빼고 부르는 경우
  for (const needle of needles) {
    const matches = table.filter((entry) => entry.compact.endsWith(needle) && entry.compact !== needle);
    if (matches.length > 0) return decide(matches);
  }

  return { input: cleaned, name: dropVocative(stripHonorific(cleaned)), status: 'new' };
}

export interface ResolvedGroup {
  category: Category;
  names: ResolvedName[];
}

export function resolveGroups(
  groups: ParsedGroup[],
  students: Student[],
  preferGroups: Group[] = [],
): ResolvedGroup[] {
  return groups.map((group) => ({
    category: group.category,
    names: group.names.map((name) => resolveName(name, students, preferGroups)),
  }));
}

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}
