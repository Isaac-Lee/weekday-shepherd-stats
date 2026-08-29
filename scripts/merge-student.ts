/**
 * 잘못 들어간 학생 이름을 다른 학생에게 합친다. (일회성 정리 도구)
 *
 *   npx tsx --env-file=.env.local scripts/merge-student.ts 'ㅡ보람' '이보람'          # 미리보기
 *   npx tsx --env-file=.env.local scripts/merge-student.ts 'ㅡ보람' '이보람' --apply  # 실제 반영
 *
 * 기록 시트의 학생 열을 대상 학생(이름·그룹·학년)으로 바꾸고, 명단에서 원래 행을 지운다.
 */

import { studentKey } from '@/lib/members';
import {
  ensureLayout,
  getClient,
  readRecords,
  readStudents,
  refreshSummaries,
  spreadsheetId,
  SHEET_RECORDS,
  SHEET_STUDENTS,
} from '@/lib/sheets';

const [from, to] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const apply = process.argv.includes('--apply');

async function main() {
  if (!from || !to) throw new Error("사용법: merge-student.ts '옮길이름' '받을이름' [--apply]");

  const sheets = getClient();
  const ids = await ensureLayout();
  const [students, records] = await Promise.all([readStudents(), readRecords()]);

  const target = students.find((student) => student.name === to);
  if (!target) throw new Error(`받을 학생 '${to}' 를 명단에서 못 찾았습니다.`);

  const moving = records
    .map((record, index) => ({ record, rowIndex: index + 1 })) // 헤더 1줄
    .filter(({ record }) => record.student.name === from);

  console.log(`옮길 기록 ${moving.length}건 → ${to} (${target.group} ${target.grade})`);
  for (const { record, rowIndex } of moving) {
    console.log(`  행 ${rowIndex + 1}: ${record.weekKey} ${record.volunteer} ${record.category}`);
  }

  // 명단 행 위치를 직접 읽는다 (앱이 추가한 학생만 지우는 규칙을 여기서는 적용하지 않는다)
  const roster = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `'${SHEET_STUDENTS}'!A2:D`,
  });
  const rosterRow = (roster.data.values ?? []).findIndex(
    (row) => String(row[0] ?? '').trim() === from,
  );
  console.log(rosterRow < 0 ? `명단에 '${from}' 없음` : `명단 ${rosterRow + 2}행 삭제 예정`);

  if (!apply) {
    console.log('\n미리보기입니다. 실제로 반영하려면 --apply 를 붙여 주세요.');
    return;
  }

  if (moving.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: spreadsheetId(),
      requestBody: {
        valueInputOption: 'RAW',
        data: moving.map(({ rowIndex }) => ({
          range: `'${SHEET_RECORDS}'!G${rowIndex + 1}:I${rowIndex + 1}`,
          values: [[target.name, target.group, target.grade]],
        })),
      },
    });
    console.log(`기록 ${moving.length}건을 ${to} 로 옮겼습니다.`);
  }

  const sheetId = ids.get(SHEET_STUDENTS);
  if (rosterRow >= 0 && sheetId != null) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: spreadsheetId(),
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: { sheetId, dimension: 'ROWS', startIndex: rosterRow + 1, endIndex: rosterRow + 2 },
            },
          },
        ],
      },
    });
    console.log(`명단에서 '${from}' 을 지웠습니다.`);
  }

  const after = await readRecords();
  console.log(`남은 '${from}' 기록: ${after.filter((r) => r.student.name === from).length}건`);
  console.log(`${to} 기록: ${after.filter((r) => studentKey(r.student) === studentKey(target)).length}건`);
  await refreshSummaries(after);
  console.log('받은목양 / 한목양 시트를 다시 그렸습니다.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
