import { errorResponse } from '@/lib/api';
import { adminUnauthorizedResponse } from '@/lib/auth';
import { isGrade, isGroup, studentKey, type Student } from '@/lib/members';
import { readAppAddedStudents, readStudents, removeStudent } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

/** 관리 화면용. 앱에서 추가된 학생(오타 후보)과 기록 수, 합칠 대상이 될 전체 명단 */
export async function GET(request: Request) {
  const denied = adminUnauthorizedResponse(request);
  if (denied) return denied;

  try {
    const [added, students] = await Promise.all([readAppAddedStudents(), readStudents()]);
    return Response.json({ added, students });
  } catch (error) {
    return errorResponse(error);
  }
}

function toStudent(value: unknown): Student | null {
  const { name, group, grade } = (value ?? {}) as { name?: unknown; group?: unknown; grade?: unknown };
  if (typeof name !== 'string' || !name.trim()) return null;
  if (typeof group !== 'string' || !isGroup(group)) return null;
  if (typeof grade !== 'string' || !isGrade(grade)) return null;
  return { name: name.trim(), group, grade };
}

/** 학생을 명단에서 지운다. mergeInto 가 있으면 기록을 그 학생에게 옮기고, 없으면 기록도 지운다. */
export async function DELETE(request: Request) {
  const denied = adminUnauthorizedResponse(request);
  if (denied) return denied;

  let body: { student?: unknown; mergeInto?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const student = toStudent(body.student);
  const mergeInto = body.mergeInto == null ? undefined : toStudent(body.mergeInto);
  if (!student || mergeInto === null) {
    return Response.json({ error: '학생 정보가 올바르지 않습니다.' }, { status: 400 });
  }
  if (mergeInto && studentKey(mergeInto) === studentKey(student)) {
    return Response.json({ error: '같은 학생에게 합칠 수 없습니다.' }, { status: 400 });
  }

  try {
    return Response.json({ records: await removeStudent(student, mergeInto) });
  } catch (error) {
    return errorResponse(error);
  }
}
