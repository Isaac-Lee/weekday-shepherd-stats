/**
 * 통계를 뽑아 본다.
 *
 *   npm run stats            이번 주
 *   npm run stats 2026-08-23 특정 주차(그 날짜가 속한 주)
 *
 * 지금 뽑는 것
 *   1. 그 주에 목양을 한 건도 받지 못한 학생 목록 (그룹별)
 *
 * 기록은 읽기만 한다.
 */

import { readRecords, readStudents } from '@/lib/sheets';
import { studentsWithoutRecords } from '@/lib/summary';
import { currentWeekKey, weekKeyOf, weekLabelLong } from '@/lib/week';

async function main() {
  const arg = process.argv[2];
  const weekKey = arg ? weekKeyOf(arg) : currentWeekKey();

  const [records, students] = await Promise.all([readRecords(), readStudents()]);
  const missed = studentsWithoutRecords(records, students, weekKey);

  console.log(`${weekLabelLong(weekKey)}`);
  console.log(`목양 0건 학생 ${missed.length}명 / 전체 ${students.length}명\n`);

  let group = '';
  for (const student of missed) {
    if (student.group !== group) {
      group = student.group;
      console.log(`[${group}]`);
    }
    console.log(`  ${student.name} (${student.grade})`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
