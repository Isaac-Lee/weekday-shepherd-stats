/**
 * 요약 시트(받은목양 / 한목양)를 다시 그린다.
 *
 *   npm run refresh
 *
 * 시트에서 명단을 직접 고친 뒤(학생 추가, 학년 수정, 담당 배정) 표에 바로 반영하고 싶을 때 쓴다.
 * 평소에는 기록을 저장할 때마다 자동으로 다시 그려지므로 부를 일이 없다.
 * 기록은 읽기만 하고 건드리지 않는다.
 */

import { ensureLayout, readRecords, readStudents, readVolunteers, refreshSummaries } from '@/lib/sheets';

async function main() {
  await ensureLayout();

  const [records, volunteers, students] = await Promise.all([
    readRecords(),
    readVolunteers(),
    readStudents(),
  ]);
  console.log(`봉사자 ${volunteers.length}명 / 학생 ${students.length}명 / 기록 ${records.length}건`);

  await refreshSummaries(records);
  console.log('받은목양 / 한목양 시트를 다시 그렸습니다.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
