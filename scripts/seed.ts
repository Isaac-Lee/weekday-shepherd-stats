/**
 * 명단 시트를 data/roster.ts 내용으로 채운다.
 *
 *   npm run seed            기존 명단이 있으면 멈춘다
 *   npm run seed -- --force 기존 명단을 지우고 새로 쓴다
 *
 * 명단 두 장만 건드리고 기록은 손대지 않는다.
 */

import { SEED_STUDENTS, SEED_VOLUNTEERS } from '@/data/roster';
import { GROUPS } from '@/lib/members';
import { ensureLayout, readStudents, readVolunteers, refreshSummaries, replaceRosters } from '@/lib/sheets';

async function main() {
  const force = process.argv.includes('--force');

  // 읽기보다 먼저 탭을 만들어 둔다.
  // 없는 시트 이름을 범위에 쓰면 구글은 "Unable to parse range" 로 거절한다.
  await ensureLayout();

  const [volunteers, students] = await Promise.all([readVolunteers(), readStudents()]);

  if ((volunteers.length > 0 || students.length > 0) && !force) {
    console.error(
      `명단에 이미 봉사자 ${volunteers.length}명 / 학생 ${students.length}명이 있습니다.\n` +
        '덮어쓰려면 --force 를 붙여 주세요:  npm run seed -- --force',
    );
    process.exitCode = 1;
    return;
  }

  await replaceRosters(SEED_VOLUNTEERS, SEED_STUDENTS);
  console.log(`봉사자 ${SEED_VOLUNTEERS.length}명을 넣었습니다.`);
  console.log(`학생 ${SEED_STUDENTS.length}명을 넣었습니다.`);
  for (const group of GROUPS) {
    console.log(`  ${group}: ${SEED_STUDENTS.filter((student) => student.group === group).length}명`);
  }

  await refreshSummaries();
  console.log('받은목양 / 한목양 시트를 다시 그렸습니다.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
