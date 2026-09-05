import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { buildReport } from '@/lib/report';
import { readRecords, readStudents } from '@/lib/sheets';
import { todayInSeoul } from '@/lib/week';

async function main() {
  const { values } = parseArgs({ options: {
    date: { type: 'string' }, out: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('npm run report -- [--date YYYY-MM-DD] [--out 출력폴더]\n기본: 한국 시간 오늘, outputs/report-날짜. PYTHON과 REPORT_FONT 환경변수로 실행 환경을 지정할 수 있습니다.');
    return;
  }
  const date = values.date ?? todayInSeoul();
  buildReport(date, [], []); // 네트워크 요청 전에 날짜 검사
  const output = path.resolve(values.out ?? `outputs/report-${date}`);
  if (existsSync(output)) throw new Error(`출력 폴더가 이미 있습니다. 다른 --out 경로를 지정하세요: ${output}`);
  const python = process.env.PYTHON ?? (existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python3');
  const renderer = path.resolve('scripts/render-report.py');
  const check = spawnSync(python, [renderer, '--check'], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(check.error?.message ?? check.stderr.trim() ?? 'Python/Pillow 설정을 확인하세요.');
  console.log('Google Sheets에서 학생명단과 기록을 읽습니다…');
  const [students, records] = await Promise.all([readStudents(), readRecords()]);
  const report = buildReport(date, students, records);
  await mkdir(path.dirname(output), { recursive: true });
  const staging = await mkdtemp(path.join(path.dirname(output), '.report-'));
  try {
    await writeFile(path.join(staging, 'report.json'), JSON.stringify(report, null, 2));
    const result = spawnSync(python, [renderer, staging], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.error?.message ?? result.stderr.trim());
    await rename(staging, output);
    console.log(`${report.recordCount}건 반영 · PNG ${report.pages.length + 2}장 생성\n${output}\n미리보기: preview.jpg\n전체 이미지: report.zip`);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

main().catch(error => {
  // 인증 요청 객체에는 비밀키 등이 포함될 수 있으므로 전체 오류를 출력하지 않는다.
  console.error(error instanceof Error ? error.message : '보고서 생성 실패');
  process.exitCode = 1;
});
