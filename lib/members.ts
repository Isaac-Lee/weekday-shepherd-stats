/**
 * 이 서비스에는 서로 다른 두 종류의 사람이 있다.
 *
 *  봉사자(Volunteer) - 목양하는 쪽. 앱에서 본인 이름을 고르는 사람.
 *  학생(Student)     - 목양받는 쪽. 채팅에 이름이 적히는 사람.
 *
 * 학생만 그룹과 학년을 가진다. 이 둘은 세 가지 일을 한다.
 *   1. 요약표의 행 순서를 기존 종이 양식과 똑같이 맞춘다.
 *   2. 동명이인을 구분한다. (고등학생 자매에 이한별이 고1·고2 두 명 있다)
 *   3. 봉사자의 담당 그룹과 맞춰 이름 매칭 후보를 좁힌다.
 */

/** 학교급 × 성별. 이 순서가 요약표에서 그룹이 놓이는 순서이기도 하다. */
export const GROUPS = [
  '초등학생 형제',
  '초등학생 자매',
  '중학생 형제',
  '중학생 자매',
  '고등학생 형제',
  '고등학생 자매',
] as const;
export type Group = (typeof GROUPS)[number];

/**
 * 낮은 학년부터 나열한다.
 * '미분류'는 채팅에 처음 등장해 자동으로 명단에 들어간 학생 자리다.
 * 학년을 모른 채 아무 학년이나 찍어 넣는 것보다, 눈에 띄게 두고 시트에서 고치게 한다.
 */
export const GRADES = [
  '초1',
  '초2',
  '초3',
  '초4',
  '초5',
  '초6',
  '중1',
  '중2',
  '중3',
  '고1',
  '고2',
  '고3',
  '미분류',
] as const;
export type Grade = (typeof GRADES)[number];

export const UNCLASSIFIED: Grade = '미분류';

/**
 * 그 그룹에서 고를 수 있는 학년.
 * 초등학생 그룹에 '중2'가 뜨는 걸 막는다. '미분류'는 학년을 모를 때를 위해 언제나 마지막에 붙는다.
 */
export function gradesForGroup(group: Group): Grade[] {
  const prefix = group.startsWith('초등') ? '초' : group.startsWith('중학') ? '중' : '고';
  return [...GRADES.filter((grade) => grade.startsWith(prefix)), UNCLASSIFIED];
}

export interface Student {
  name: string;
  group: Group;
  grade: Grade;
}

export interface Volunteer {
  name: string;
  /** 담당 그룹. 비어 있으면 학생 전체에서 이름을 찾는다. */
  groups: Group[];
}

/**
 * 학생 이름으로 인정하는 형태. 완성형 한글 2~5자만 받는다.
 * 대시 대신 친 'ㅡ'(U+3161)나 기호가 섞인 이름이 명단에 들어가 동명이인처럼 보이는 걸 막는다.
 */
export function isStudentName(value: string): boolean {
  return /^[가-힣]{2,5}$/u.test(value.normalize('NFC').trim());
}

export function isGroup(value: string): value is Group {
  return (GROUPS as readonly string[]).includes(value);
}

export function isGrade(value: string): value is Grade {
  return (GRADES as readonly string[]).includes(value);
}

/** 학생 한 명을 유일하게 가리키는 키. 기록 시트의 이름 + 그룹 + 학년 조합과 같다. */
export function studentKey(student: Pick<Student, 'name' | 'group' | 'grade'>): string {
  return `${student.name}|${student.group}|${student.grade}`;
}

/**
 * 화면과 시트에 보여 줄 학생 이름.
 * 명단 안에 같은 이름이 또 있을 때만 학년을 덧붙인다. (`이한별(고1)`)
 */
export function studentLabel(student: Student, roster: Student[]): string {
  const sameName = roster.filter((other) => other.name === student.name);
  if (sameName.length <= 1) return student.name;
  const sameNameAndGrade = sameName.filter((other) => other.grade === student.grade);
  // 학년까지 같은 동명이인이 있으면 그룹까지 붙인다.
  return sameNameAndGrade.length > 1
    ? `${student.name}(${student.grade} ${student.group})`
    : `${student.name}(${student.grade})`;
}

/** 담당 그룹을 한 줄로. 안 골랐으면 '전체'. */
export function volunteerScope(volunteer: Volunteer): string {
  return volunteer.groups.length === 0 ? '전체' : volunteer.groups.join(', ');
}

/** 명단에서 이 학생이 서야 할 자리. 그룹 순서가 먼저, 같은 그룹 안에서는 학년 순이다. */
export function studentSortKey(student: Pick<Student, 'group' | 'grade'>): number {
  return GROUPS.indexOf(student.group) * 100 + GRADES.indexOf(student.grade);
}

/** 두 글자 성씨. 이름을 성과 이름으로 쪼갤 때 먼저 확인한다. */
const COMPOUND_SURNAMES = [
  '남궁',
  '황보',
  '제갈',
  '사공',
  '선우',
  '서문',
  '독고',
  '동방',
  '어금',
  '망절',
];

export interface NameParts {
  surname: string;
  given: string;
}

/**
 * 채팅에 적힌 이름을 성과 이름으로 나눠 본다. 어디까지나 **추정**이라 화면에서 고칠 수 있어야 한다.
 *
 *   김하늘  → 성 김 / 이름 하늘
 *   남궁하늘 → 성 남궁 / 이름 하늘
 *   하늘    → 성 ? / 이름 하늘   (성을 빼고 부른 경우가 훨씬 흔하다)
 *
 * 두 글자는 '하늘'(이름만)인지 '김구'(성 + 외자 이름)인지 글자만 봐서는 알 수 없다.
 * 흔한 쪽인 "이름만"으로 두고, 성 칸을 비워 사용자에게 물어본다.
 */
export function splitKoreanName(input: string): NameParts {
  const value = input.trim().replace(/\s+/g, '');
  if (value.length <= 2) return { surname: '', given: value };
  if (value.length >= 4 && COMPOUND_SURNAMES.includes(value.slice(0, 2))) {
    return { surname: value.slice(0, 2), given: value.slice(2) };
  }
  return { surname: value.slice(0, 1), given: value.slice(1) };
}

export function joinKoreanName(parts: NameParts): string {
  return `${parts.surname.trim()}${parts.given.trim()}`;
}
