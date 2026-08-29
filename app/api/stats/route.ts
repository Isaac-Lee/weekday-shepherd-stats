import { errorResponse } from '@/lib/api';
import { adminUnauthorizedResponse } from '@/lib/auth';
import { readRecords, readStudents } from '@/lib/sheets';
import { studentsWithoutRecords } from '@/lib/summary';
import { currentWeekKey, weekKeyOf, weekLabelLong } from '@/lib/week';

export const dynamic = 'force-dynamic';

/** 관리 화면용 통계. 지금은 '그 주에 목양 0건인 학생'만 준다. */
export async function GET(request: Request) {
  const denied = adminUnauthorizedResponse(request);
  if (denied) return denied;

  const requested = (new URL(request.url).searchParams.get('week') ?? '').trim();
  const weekKey = requested ? weekKeyOf(requested) : currentWeekKey();

  try {
    const [records, students] = await Promise.all([readRecords(), readStudents()]);
    return Response.json({
      weekKey,
      label: weekLabelLong(weekKey),
      total: students.length,
      missed: studentsWithoutRecords(records, students, weekKey),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
