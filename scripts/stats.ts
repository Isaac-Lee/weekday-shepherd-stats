/**
 * 통계를 뽑아 본다.
 *
 *   npm run stats            이번 주
 *   npm run stats 2026-08-23 특정 주차(그 날짜가 속한 주)
 *
 * 지금 뽑는 것
 *   1. 그 주에 목양을 한 건도 받지 못한 학생
 *   2. 그 주에 성경과 만남이 둘 다 없는 학생 (둘 중 하나라도 있으면 빠진다)
 *
 * 기록은 읽기만 한다.
 */

import type { Student } from '@/lib/members';
import { studentsWithoutRecords } from '@/lib/summary';
import { readRecords, readStudents } from '@/lib/sheets';
import { currentWeekKey, weekKeyOf, weekLabelLong } from '@/lib/week';

function printByGroup(students: Student[]) {
  let group = '';
  for (const student of students) {
    if (student.group !== group) {
      group = student.group;
      console.log(`[${group}]`);
    }
    console.log(`  ${student.name} (${student.grade})`);
  }
}

async function main() {
  const arg = process.argv[2];
  const weekKey = arg ? weekKeyOf(arg) : currentWeekKey();

  const [records, students] = await Promise.all([readRecords(), readStudents()]);

  const noRecord = studentsWithoutRecords(records, students, weekKey);
  const missingBothBibleAndMeet = studentsWithoutRecords(records, students, weekKey, ['성경', '만남']);

  console.log(weekLabelLong(weekKey));

  console.log(`\n== 목양 0건 (${noRecord.length}명 / 전체 ${students.length}명) ==`);
  printByGroup(noRecord);

  console.log(`\n== 성경·만남 둘 다 없음 (${missingBothBibleAndMeet.length}명 / 전체 ${students.length}명) ==`);
  printByGroup(missingBothBibleAndMeet);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
