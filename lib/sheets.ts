/**
 * 구글 시트 연동. 서비스 계정으로 인증하고, 아래 다섯 장의 시트를 관리한다.
 *
 *  봉사자명단 - 목양하는 사람. 이름 · 담당 그룹
 *  학생명단   - 목양받는 사람. 이름 · 그룹 · 학년
 *  기록       - 원본 로그. 한 줄 = "어느 봉사자가 / 언제 / 어떤 항목으로 / 어느 학생을" 목양했는지 한 건
 *  받은목양   - 기록에서 자동 생성. 학생별로 받은 횟수를 색 농도로 보여 주는 히트맵
 *  한목양     - 기록에서 자동 생성. 봉사자별로 누구를 목양했는지 이름으로
 *
 * 요약 시트는 매번 통째로 다시 그린다. 사람이 손으로 고칠 시트가 아니고,
 * 원본이 기록 시트에 남아 있어 언제든 복구할 수 있기 때문이다.
 */

import { google, type sheets_v4 } from 'googleapis';

import {
  isGrade,
  isGroup,
  studentKey,
  studentSortKey,
  UNCLASSIFIED,
  type Group,
  type Student,
  type Volunteer,
} from './members';
import { CATEGORIES, isCategory } from './parse';
import {
  buildGivenSummary,
  buildReceivedSummary,
  studentsMissingFromRoster,
  summaryWeeks,
  volunteersMissingFromRoster,
  type Summary,
  type ShepherdRecord,
} from './summary';
import { timestampInSeoul, weekLabel } from './week';

export const SHEET_VOLUNTEERS = '봉사자명단';
export const SHEET_STUDENTS = '학생명단';
export const SHEET_RECORDS = '기록';
export const SHEET_RECEIVED = '받은목양';
export const SHEET_GIVEN = '한목양';

const RECORD_HEADER = [
  'ID',
  '기록시각',
  '주차(주일)',
  '주차기간',
  '봉사자',
  '항목',
  '학생',
  '학생그룹',
  '학생학년',
];
const VOLUNTEER_HEADER = ['이름', '담당그룹', '비고'];
const STUDENT_HEADER = ['이름', '그룹', '학년', '비고'];

/** 담당 그룹이 여러 개일 수 있어 한 칸에 쉼표로 넣는다. */
const GROUP_SEPARATOR = ', ';

/**
 * 앱이 명단에 넣은 학생임을 표시하는 비고.
 * 기록이 모두 지워졌을 때 이 표시가 있는 학생만 명단에서 지운다.
 */
const APP_ADDED_NOTE = '앱에서 추가';

export class SheetsConfigError extends Error {}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new SheetsConfigError(
      `환경변수 ${name} 가 설정되어 있지 않습니다. .env.local 또는 Vercel 환경변수를 확인해 주세요.`,
    );
  }
  return value;
}

export function spreadsheetId(): string {
  return requireEnv('GOOGLE_SHEET_ID');
}

/** 시트 이름이 한글이라 A1 표기에서 따옴표로 감싸 준다. */
function ref(title: string, range?: string): string {
  const quoted = `'${title.replace(/'/g, "''")}'`;
  return range ? `${quoted}!${range}` : quoted;
}

/** 환경변수에 통째로 붙여넣다 보면 따옴표까지 딸려 들어오는 일이 잦다. */
function readPrivateKey(): string {
  return requireEnv('GOOGLE_PRIVATE_KEY')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\\n/g, '\n');
}

let cachedClient: sheets_v4.Sheets | null = null;

export function getClient(): sheets_v4.Sheets {
  if (cachedClient) return cachedClient;
  const auth = new google.auth.JWT({
    email: requireEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL').trim(),
    key: readPrivateKey(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  cachedClient = google.sheets({ version: 'v4', auth });
  return cachedClient;
}

type SheetIdMap = Map<string, number>;

async function loadSheetIds(): Promise<SheetIdMap> {
  const sheets = getClient();
  const response = await sheets.spreadsheets.get({ spreadsheetId: spreadsheetId() });
  const map: SheetIdMap = new Map();
  for (const sheet of response.data.sheets ?? []) {
    const title = sheet.properties?.title;
    const id = sheet.properties?.sheetId;
    if (title != null && id != null) map.set(title, id);
  }
  return map;
}

const ALL_SHEETS = [SHEET_VOLUNTEERS, SHEET_STUDENTS, SHEET_RECORDS, SHEET_RECEIVED, SHEET_GIVEN];

/** 필요한 시트가 없으면 만들고, 헤더 줄을 채워 둔다. 최초 실행 시 한 번만 실제로 동작한다. */
export async function ensureLayout(): Promise<SheetIdMap> {
  const sheets = getClient();
  let ids = await loadSheetIds();

  const missing = ALL_SHEETS.filter((title) => !ids.has(title));
  if (missing.length === 0) return ids;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) },
  });
  ids = await loadSheetIds();

  const headers = [
    { title: SHEET_RECORDS, row: RECORD_HEADER },
    { title: SHEET_VOLUNTEERS, row: VOLUNTEER_HEADER },
    { title: SHEET_STUDENTS, row: STUDENT_HEADER },
  ].filter((entry) => missing.includes(entry.title));

  if (headers.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: spreadsheetId(),
      requestBody: {
        valueInputOption: 'RAW',
        data: headers.map((entry) => ({ range: ref(entry.title, 'A1'), values: [entry.row] })),
      },
    });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: spreadsheetId(),
      requestBody: {
        requests: headers.flatMap((entry) => [
          {
            repeatCell: {
              range: { sheetId: ids.get(entry.title)!, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: HEADER_BG,
                  horizontalAlignment: 'CENTER',
                  textFormat: { bold: true, foregroundColor: HEADER_FG },
                },
              },
              fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)',
            },
          },
          {
            updateSheetProperties: {
              properties: { sheetId: ids.get(entry.title)!, gridProperties: { frozenRowCount: 1 } },
              fields: 'gridProperties.frozenRowCount',
            },
          },
        ]),
      },
    });
  }

  return ids;
}

// ---------------------------------------------------------------------------
// 읽기
// ---------------------------------------------------------------------------

export async function readVolunteers(): Promise<Volunteer[]> {
  const sheets = getClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: ref(SHEET_VOLUNTEERS, 'A2:B'),
  });

  const seen = new Set<string>();
  const volunteers: Volunteer[] = [];

  for (const row of response.data.values ?? []) {
    const name = String(row[0] ?? '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const groups = String(row[1] ?? '')
      .split(/[,;/]/)
      .map((value) => value.trim())
      .filter(isGroup);
    volunteers.push({ name, groups: [...new Set(groups)] });
  }
  return volunteers;
}

export async function readStudents(): Promise<Student[]> {
  const sheets = getClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: ref(SHEET_STUDENTS, 'A2:C'),
  });

  const seen = new Set<string>();
  const students: Student[] = [];

  for (const row of response.data.values ?? []) {
    const name = String(row[0] ?? '').trim();
    const group = String(row[1] ?? '').trim();
    const grade = String(row[2] ?? '').trim();
    if (!name || !isGroup(group)) continue;

    const student: Student = { name, group, grade: isGrade(grade) ? grade : UNCLASSIFIED };
    const key = studentKey(student);
    if (seen.has(key)) continue;
    seen.add(key);
    students.push(student);
  }
  return students;
}

export async function readRecords(): Promise<ShepherdRecord[]> {
  const sheets = getClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: ref(SHEET_RECORDS, 'A2:I'),
  });

  const records: ShepherdRecord[] = [];
  for (const row of response.data.values ?? []) {
    const cell = (index: number) => String(row[index] ?? '').trim();
    const weekKey = cell(2);
    const volunteer = cell(4);
    const category = cell(5);
    const studentName = cell(6);
    const group = cell(7);
    const grade = cell(8);

    if (!weekKey || !volunteer || !studentName) continue;
    if (!isCategory(category) || !isGroup(group)) continue;

    records.push({
      id: cell(0),
      timestamp: cell(1),
      weekKey,
      volunteer,
      category,
      student: { name: studentName, group, grade: isGrade(grade) ? grade : UNCLASSIFIED },
    });
  }
  return records;
}

// ---------------------------------------------------------------------------
// 쓰기
// ---------------------------------------------------------------------------

export interface NewEntry {
  category: (typeof CATEGORIES)[number];
  student: Student;
}

export interface SubmitResult {
  added: ShepherdRecord[];
  /** 같은 주에 이미 같은 내용이 있어 건너뛴 항목 */
  duplicates: { category: string; student: string }[];
}

/**
 * 기록을 추가하고 요약 시트를 다시 그린다.
 * 같은 주 / 같은 봉사자 / 같은 항목 / 같은 학생은 중복으로 보고 건너뛴다.
 */
export async function submitEntries(
  volunteer: string,
  weekKey: string,
  entries: NewEntry[],
): Promise<SubmitResult> {
  const sheets = getClient();
  await ensureLayout();

  const existing = await readRecords();
  const signature = (record: Pick<ShepherdRecord, 'weekKey' | 'volunteer' | 'category' | 'student'>) =>
    `${record.weekKey}|${record.volunteer}|${record.category}|${studentKey(record.student)}`;
  const seen = new Set(existing.map(signature));

  const added: ShepherdRecord[] = [];
  const duplicates: { category: string; student: string }[] = [];
  const timestamp = timestampInSeoul();

  for (const entry of entries) {
    const candidate = { weekKey, volunteer, category: entry.category, student: entry.student };
    const key = signature(candidate);
    if (seen.has(key)) {
      duplicates.push({ category: entry.category, student: entry.student.name });
      continue;
    }
    seen.add(key);
    added.push({ id: randomId(), timestamp, ...candidate });
  }

  if (added.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: spreadsheetId(),
      range: ref(SHEET_RECORDS, 'A:I'),
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: added.map((r) => [
          r.id,
          r.timestamp,
          r.weekKey,
          weekLabel(r.weekKey),
          r.volunteer,
          r.category,
          r.student.name,
          r.student.group,
          r.student.grade,
        ]),
      },
    });

    const all = [...existing, ...added];
    await syncRosters(all);
    await refreshSummaries(all);
  }

  return { added, duplicates };
}

/** 기록 한 건을 지우고 요약을 다시 그린다. */
export async function deleteRecord(id: string): Promise<boolean> {
  const sheets = getClient();
  const ids = await ensureLayout();

  const records = await readRecords();
  const index = records.findIndex((record) => record.id === id);
  const sheetId = ids.get(SHEET_RECORDS);
  if (index < 0 || sheetId == null) return false;

  const removed = records[index];
  const remaining = records.filter((record) => record.id !== id);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: {
      requests: [
        {
          deleteDimension: {
            // 헤더 1줄 + 0-based 보정
            range: { sheetId, dimension: 'ROWS', startIndex: index + 1, endIndex: index + 2 },
          },
        },
      ],
    },
  });

  // 이 학생의 기록이 하나도 안 남았고 앱이 명단에 넣은 학생이라면, 명단에서도 지운다.
  // 처음부터 명단에 있던 학생은 기록이 없어도 그대로 둔다.
  const stillReferenced = remaining.some(
    (record) => studentKey(record.student) === studentKey(removed.student),
  );
  if (!stillReferenced) await removeAppAddedStudent(removed.student);

  await refreshSummaries(remaining);
  return true;
}

/** 학생명단을 비고까지 읽는다. 시트 행 번호(0-based)를 함께 돌려준다. */
async function readStudentRows(): Promise<{ student: Student; note: string; rowIndex: number }[]> {
  const sheets = getClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: ref(SHEET_STUDENTS, 'A2:D'),
  });

  const rows: { student: Student; note: string; rowIndex: number }[] = [];
  (response.data.values ?? []).forEach((row, offset) => {
    const name = String(row[0] ?? '').trim();
    const group = String(row[1] ?? '').trim();
    const grade = String(row[2] ?? '').trim();
    if (!name || !isGroup(group)) return;
    rows.push({
      student: { name, group, grade: isGrade(grade) ? grade : UNCLASSIFIED },
      note: String(row[3] ?? '').trim(),
      // 헤더 1줄만큼 밀린다
      rowIndex: offset + 1,
    });
  });
  return rows;
}

/** 앱이 넣어 둔 학생만 명단에서 지운다. 시드하거나 손으로 넣은 학생은 건드리지 않는다. */
async function removeAppAddedStudent(student: Student): Promise<void> {
  const sheets = getClient();
  const ids = await ensureLayout();
  const sheetId = ids.get(SHEET_STUDENTS);
  if (sheetId == null) return;

  const rows = await readStudentRows();
  const target = rows.find(
    (row) => studentKey(row.student) === studentKey(student) && row.note.startsWith(APP_ADDED_NOTE),
  );
  if (!target) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: target.rowIndex, endIndex: target.rowIndex + 1 },
          },
        },
      ],
    },
  });
}

/** 명단에 없는 사람이 기록에 등장하면 명단 아래에 붙인다. */
async function syncRosters(records: ShepherdRecord[]): Promise<void> {
  const sheets = getClient();
  const [volunteers, students] = await Promise.all([readVolunteers(), readStudents()]);

  const freshStudents = studentsMissingFromRoster(records, students);
  const freshVolunteers = volunteersMissingFromRoster(records, volunteers);

  if (freshStudents.length > 0) await insertStudentsInOrder(freshStudents);

  if (freshVolunteers.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: spreadsheetId(),
      range: ref(SHEET_VOLUNTEERS, 'A:C'),
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: freshVolunteers.map((v) => [v.name, '', '자동 추가']) },
    });
  }
}

/**
 * 새 학생을 명단의 제 자리에 끼워 넣는다. 맨 아래에 붙이지 않는다.
 *
 * 중학생 형제가 추가되면 중학생 자매부터 아래로는 한 칸씩 밀린다.
 * 같은 그룹 안에서는 학년 순서를 지키고, 같은 학년 안에서는 그 블록의 끝에 붙는다.
 */
async function insertStudentsInOrder(fresh: Student[]): Promise<void> {
  const sheets = getClient();
  const ids = await ensureLayout();
  const sheetId = ids.get(SHEET_STUDENTS);
  if (sheetId == null) return;

  const rows = await readStudentRows();

  const placements = fresh.map((student) => {
    const key = studentSortKey(student);
    // 자기보다 앞서야 할 학생들 바로 다음 자리. 아무도 없으면 헤더 바로 밑(=1).
    let rowIndex = 1;
    for (const row of rows) {
      if (studentSortKey(row.student) <= key) rowIndex = row.rowIndex + 1;
    }
    return { student, rowIndex };
  });

  // 아래쪽부터 넣어야 위쪽 행 번호가 밀리지 않는다.
  placements.sort((a, b) => b.rowIndex - a.rowIndex);

  const requests: sheets_v4.Schema$Request[] = [];
  for (const { student, rowIndex } of placements) {
    requests.push({
      insertDimension: {
        range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 },
        // 헤더 바로 아래에 넣을 때 헤더 서식을 물려받으면 안 된다.
        inheritFromBefore: rowIndex > 1,
      },
    });
    requests.push({
      updateCells: {
        start: { sheetId, rowIndex, columnIndex: 0 },
        rows: [
          {
            values: [
              student.name,
              student.group,
              student.grade,
              // 학년은 앱에서 고르게 하므로 보통 제대로 들어온다. 모른다고 넘긴 것만 표시해 둔다.
              student.grade === UNCLASSIFIED ? `${APP_ADDED_NOTE} — 학년 확인 필요` : APP_ADDED_NOTE,
            ].map((text) => ({ userEnteredValue: { stringValue: text } })),
          },
        ],
        fields: 'userEnteredValue',
      },
    });
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: { requests },
  });
}

/** 명단 두 장을 새로 쓴다. 최초 시드용. */
export async function replaceRosters(volunteers: Volunteer[], students: Student[]): Promise<void> {
  const sheets = getClient();
  await ensureLayout();

  await sheets.spreadsheets.values.batchClear({
    spreadsheetId: spreadsheetId(),
    requestBody: { ranges: [ref(SHEET_VOLUNTEERS), ref(SHEET_STUDENTS)] },
  });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        {
          range: ref(SHEET_VOLUNTEERS, 'A1'),
          values: [
            VOLUNTEER_HEADER,
            ...volunteers.map((v) => [v.name, v.groups.join(GROUP_SEPARATOR), '']),
          ],
        },
        {
          range: ref(SHEET_STUDENTS, 'A1'),
          values: [STUDENT_HEADER, ...students.map((s) => [s.name, s.group, s.grade, ''])],
        },
      ],
    },
  });
}

export async function refreshSummaries(records?: ShepherdRecord[]): Promise<void> {
  const ids = await ensureLayout();
  const data = records ?? (await readRecords());
  const [volunteers, students] = await Promise.all([readVolunteers(), readStudents()]);
  const weeks = summaryWeeks();

  await renderSummary(ids.get(SHEET_RECEIVED)!, buildReceivedSummary(data, students, weeks), {
    heatmap: true,
    caption:
      '받은 목양 — 색이 진할수록 그 주에 그 항목으로 목양받은 횟수가 많습니다. 칸에 마우스를 올리면 어느 봉사자가 해 주었는지 보입니다.',
  });
  await renderSummary(ids.get(SHEET_GIVEN)!, buildGivenSummary(data, volunteers, students, weeks), {
    heatmap: false,
    caption: '한 목양 — 그 주에 그 봉사자가 목양한 학생입니다.',
  });
}

// ---------------------------------------------------------------------------
// 요약 시트 렌더링
// ---------------------------------------------------------------------------

type Color = sheets_v4.Schema$Color;

const HEADER_BG: Color = { red: 0.11, green: 0.31, blue: 0.58 };
const HEADER_FG: Color = { red: 1, green: 1, blue: 1 };
const LEAD_BG: Color = { red: 0.94, green: 0.96, blue: 0.99 };
const WHITE: Color = { red: 1, green: 1, blue: 1 };
const INK: Color = { red: 0.04, green: 0.04, blue: 0.04 };
const MUTED: Color = { red: 0.32, green: 0.32, blue: 0.3 };
const BAND_BG: Color = { red: 0.975, green: 0.975, blue: 0.972 };

/**
 * 히트맵 색. 파랑 한 가지 색으로 옅은 쪽 → 진한 쪽이다.
 * 색상 자체보다 "밝기가 한 방향으로만 간다"는 점이 중요하다. 그래야 진하기가 곧 횟수로 읽힌다.
 */
const HEAT_STEPS: Color[] = [
  hex('#cde2fb'), // 1건
  hex('#9ec5f4'), // 2건
  hex('#5598e7'), // 3건
  hex('#2a78d6'), // 4건 이상
];

function hex(value: string): Color {
  const n = parseInt(value.replace('#', ''), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}

function heatColor(count: number): Color {
  if (count <= 0) return WHITE;
  return HEAT_STEPS[Math.min(count, HEAT_STEPS.length) - 1];
}

/** 진한 칸 위의 글자는 흰색이어야 읽힌다. */
function heatTextColor(count: number): Color {
  return count >= 3 ? HEADER_FG : INK;
}

function cell(
  text: string,
  format: sheets_v4.Schema$CellFormat,
  note?: string,
): sheets_v4.Schema$CellData {
  const numeric = text !== '' && /^\d+$/.test(text);
  return {
    userEnteredValue: text === '' ? {} : numeric ? { numberValue: Number(text) } : { stringValue: text },
    userEnteredFormat: format,
    ...(note ? { note } : {}),
  };
}

const CENTER = { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } as const;

interface RenderOptions {
  heatmap: boolean;
  caption: string;
}

async function renderSummary(
  sheetId: number,
  summary: Summary,
  options: RenderOptions,
): Promise<void> {
  const sheets = getClient();
  const lead = summary.leadColumns;
  const groupSize = CATEGORIES.length;
  const width = summary.headerTop.length;
  const height = summary.rows.length + 2;

  const headerFormat: sheets_v4.Schema$CellFormat = {
    backgroundColor: HEADER_BG,
    ...CENTER,
    wrapStrategy: 'CLIP',
    textFormat: { bold: true, foregroundColor: HEADER_FG, fontSize: 10 },
  };

  const rows: sheets_v4.Schema$RowData[] = [
    { values: summary.headerTop.map((text) => cell(text, headerFormat)) },
    { values: summary.headerBottom.map((text) => cell(text, headerFormat)) },
  ];

  for (const row of summary.rows) {
    const values: sheets_v4.Schema$CellData[] = row.lead.map((text, index) =>
      cell(text, {
        backgroundColor: LEAD_BG,
        ...CENTER,
        wrapStrategy: 'CLIP',
        textFormat: {
          // 이름 칸만 굵게. 나머지 보조 정보는 한 톤 죽인다.
          bold: index === 1,
          foregroundColor: index === 1 || index === lead - 1 ? INK : MUTED,
          fontSize: index === 1 ? 10 : 9,
        },
      }),
    );

    row.cells.forEach((data, index) => {
      const week = Math.floor(index / groupSize);
      const background = options.heatmap
        ? heatColor(data.count)
        : data.count > 0
          ? hex('#e8f0fc')
          : week % 2 === 1
            ? BAND_BG
            : WHITE;

      values.push(
        cell(
          data.text,
          {
            backgroundColor: background,
            ...CENTER,
            wrapStrategy: options.heatmap ? 'CLIP' : 'WRAP',
            textFormat: {
              fontSize: 9,
              foregroundColor: options.heatmap ? heatTextColor(data.count) : INK,
            },
          },
          data.note,
        ),
      );
    });

    rows.push({ values });
  }

  const requests: sheets_v4.Schema$Request[] = [
    { unmergeCells: { range: { sheetId } } },
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            rowCount: Math.max(height + 8, 60),
            columnCount: Math.max(width + 4, 30),
            frozenRowCount: 2,
            frozenColumnCount: lead,
          },
        },
        fields: 'gridProperties(rowCount,columnCount,frozenRowCount,frozenColumnCount)',
      },
    },
    // 시트 전체를 값·서식·메모까지 싹 비운다.
    // 값만 지우면 지난번에 칠한 히트맵 색이 표 바깥에 유령처럼 남는다.
    {
      repeatCell: {
        range: { sheetId },
        cell: {},
        fields: 'userEnteredValue,userEnteredFormat,note',
      },
    },
    {
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows,
        fields: 'userEnteredValue,userEnteredFormat,note',
      },
    },
    // 왼쪽 머리글은 두 줄을 하나로 합친다.
    ...Array.from({ length: lead }, (_, index) => ({
      mergeCells: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 2,
          startColumnIndex: index,
          endColumnIndex: index + 1,
        },
        mergeType: 'MERGE_ALL' as const,
      },
    })),
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 44 },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 84 },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: lead },
        // 한목양의 '담당' 칸에는 그룹 이름이 들어가 조금 더 넓어야 한다.
        properties: { pixelSize: options.heatmap ? 78 : 120 },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: lead, endIndex: width },
        properties: { pixelSize: options.heatmap ? 46 : 96 },
        fields: 'pixelSize',
      },
    },
  ];

  // 주차 머리글 병합 + 주차 사이 세로 구분선
  summary.weeks.forEach((_, index) => {
    const start = lead + index * groupSize;
    requests.push({
      mergeCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: start, endColumnIndex: start + groupSize },
        mergeType: 'MERGE_ALL',
      },
    });
    requests.push({
      updateBorders: {
        range: { sheetId, startRowIndex: 0, endRowIndex: height, startColumnIndex: start, endColumnIndex: start + groupSize },
        left: { style: 'SOLID_MEDIUM', color: HEADER_BG },
      },
    });
  });

  // 그룹이 바뀌는 자리에 가로 굵은 선
  summary.rows.forEach((row, index) => {
    if (!row.startsGroup) return;
    requests.push({
      updateBorders: {
        range: { sheetId, startRowIndex: index + 2, endRowIndex: index + 3, startColumnIndex: 0, endColumnIndex: width },
        top: { style: 'SOLID_MEDIUM', color: HEADER_BG },
      },
    });
  });

  requests.push(...captionRequests(sheetId, height + 1, options));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: { requests },
  });
}

function captionRequests(
  sheetId: number,
  rowIndex: number,
  options: RenderOptions,
): sheets_v4.Schema$Request[] {
  const captionFormat: sheets_v4.Schema$CellFormat = {
    textFormat: { fontSize: 9, foregroundColor: MUTED },
    backgroundColor: WHITE,
  };

  const rows: sheets_v4.Schema$RowData[] = [{ values: [cell(options.caption, captionFormat)] }];

  if (options.heatmap) {
    rows.push({
      values: [
        cell('범례', captionFormat),
        ...HEAT_STEPS.map((color, index) =>
          cell(index === HEAT_STEPS.length - 1 ? `${index + 1}건 이상` : `${index + 1}건`, {
            backgroundColor: color,
            ...CENTER,
            textFormat: { fontSize: 9, foregroundColor: heatTextColor(index + 1) },
          }),
        ),
      ],
    });
  }

  return [
    {
      updateCells: {
        start: { sheetId, rowIndex, columnIndex: 0 },
        rows,
        fields: 'userEnteredValue,userEnteredFormat',
      },
    },
  ];
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type { Group };
