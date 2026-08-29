/**
 * 화면을 둘러보기 위한 **예시 명단**이다. 실제 사람 이름은 들어 있지 않다.
 * `npm run seed` 로 구글 시트의 `봉사자명단` / `학생명단` 탭에 넣어 볼 수 있고,
 * `DEMO_ROSTER=1` 로 두면 시트 없이 이 명단으로 화면만 볼 수 있다.
 *
 * 실제 운영 명단은 코드가 아니라 구글 시트에서 관리한다.
 * 이름 매칭이 어떤 경우를 다루는지 보여 주려고 아래 세 가지를 일부러 넣어 두었다.
 *   - 성을 뺀 이름이 겹치는 학생   (박다온 / 한다온)
 *   - 그룹이 달라야 구분되는 이름  (김슬기 · 중학생 자매 / 최슬기 · 고등학생 자매)
 *   - 이름이 똑같은 동명이인       (이한별 · 고1 / 고2)
 */

import type { Grade, Group, Student, Volunteer } from '@/lib/members';

function students(group: Group, byGrade: Record<string, string[]>): Student[] {
  return Object.entries(byGrade).flatMap(([grade, names]) =>
    names.map((name) => ({ name, group, grade: grade as Grade })),
  );
}

/** 목양하는 사람들. 담당 그룹은 비워 둔다. 앱에서 처음 들어올 때 본인이 고르면 된다. */
export const SEED_VOLUNTEERS: Volunteer[] = [
  '홍길동',
  '김봉사',
  '이도움',
  '박섬김',
  '최나눔',
  '정사랑',
  '강기쁨',
  '윤소망',
].map((name) => ({ name, groups: [] }));

/** 목양받는 학생들. 낮은 학교급부터 적는다. */
export const SEED_STUDENTS: Student[] = [
  ...students('초등학생 형제', {
    초3: ['김하늘'],
  }),
  ...students('초등학생 자매', {
    초6: ['이보람'],
  }),
  ...students('중학생 형제', {
    중1: ['박다온', '오늘찬'],
    중2: ['최여름'],
    중3: ['한다온', '정겨울'],
  }),
  ...students('중학생 자매', {
    중1: ['김슬기'],
    중2: ['이아름'],
    중3: ['박새봄', '유나래'],
  }),
  ...students('고등학생 형제', {
    고1: ['최한별'],
    고2: ['정바다'],
    고3: ['김가온'],
  }),
  ...students('고등학생 자매', {
    고1: ['이한별', '조예솔'],
    고2: ['이한별'],
    고3: ['최슬기', '김새롬'],
  }),
];
