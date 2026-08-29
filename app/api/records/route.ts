import { errorResponse } from '@/lib/api';
import { unauthorizedResponse } from '@/lib/auth';
import { isGrade, isGroup, isStudentName, type Student } from '@/lib/members';
import { isCategory } from '@/lib/parse';
import { deleteRecord, readRecords, submitEntries, type NewEntry } from '@/lib/sheets';
import { weekKeyOf } from '@/lib/week';

export const dynamic = 'force-dynamic';

const MAX_ENTRIES = 200;

/** 특정 봉사자의 특정 주차 기록 (되돌리기 화면용) */
export async function GET(request: Request) {
  const denied = unauthorizedResponse(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const volunteer = (url.searchParams.get('volunteer') ?? '').trim();
  const weekKey = (url.searchParams.get('week') ?? '').trim();

  try {
    const records = await readRecords();
    const filtered = records.filter(
      (record) =>
        (!volunteer || record.volunteer === volunteer) && (!weekKey || record.weekKey === weekKey),
    );
    return Response.json({ records: filtered });
  } catch (error) {
    return errorResponse(error);
  }
}

/** 알 수 없는 값이 시트에 들어가지 않도록 학생 정보를 검사한다. */
function toStudent(value: unknown): Student | null {
  const { name, group, grade } = (value ?? {}) as { name?: unknown; group?: unknown; grade?: unknown };
  // 자모('ㅡ')나 기호가 섞인 이름은 막는다. 명단에 들어가면 동명이인처럼 걸려 매칭을 망친다.
  if (typeof name !== 'string' || !isStudentName(name)) return null;
  if (typeof group !== 'string' || !isGroup(group)) return null;
  if (typeof grade !== 'string' || !isGrade(grade)) return null;
  return { name: name.trim(), group, grade };
}

export async function POST(request: Request) {
  const denied = unauthorizedResponse(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const { volunteer, weekKey, entries } = (body ?? {}) as {
    volunteer?: unknown;
    weekKey?: unknown;
    entries?: unknown;
  };

  if (typeof volunteer !== 'string' || volunteer.trim().length === 0) {
    return Response.json({ error: '봉사자 이름이 필요합니다.' }, { status: 400 });
  }
  if (typeof weekKey !== 'string' || weekKeyOf(weekKey) !== weekKey) {
    return Response.json({ error: '주차 값이 올바르지 않습니다.' }, { status: 400 });
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return Response.json({ error: '저장할 내용이 없습니다.' }, { status: 400 });
  }
  if (entries.length > MAX_ENTRIES) {
    return Response.json({ error: `한 번에 ${MAX_ENTRIES}건까지만 저장할 수 있습니다.` }, { status: 400 });
  }

  const parsed: NewEntry[] = [];
  for (const entry of entries) {
    const { category, student } = (entry ?? {}) as { category?: unknown; student?: unknown };
    if (typeof category !== 'string' || !isCategory(category)) {
      return Response.json({ error: `알 수 없는 항목입니다: ${String(category)}` }, { status: 400 });
    }
    const target = toStudent(student);
    if (!target) {
      return Response.json({ error: '학생 정보가 올바르지 않습니다.' }, { status: 400 });
    }
    parsed.push({ category, student: target });
  }

  try {
    return Response.json(await submitEntries(volunteer.trim(), weekKey, parsed));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const denied = unauthorizedResponse(request);
  if (denied) return denied;

  const id = (new URL(request.url).searchParams.get('id') ?? '').trim();
  if (!id) return Response.json({ error: '삭제할 기록을 찾을 수 없습니다.' }, { status: 400 });

  try {
    const deleted = await deleteRecord(id);
    if (!deleted) return Response.json({ error: '이미 삭제된 기록입니다.' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
