import { SEED_STUDENTS, SEED_VOLUNTEERS } from '@/data/roster';
import { errorResponse } from '@/lib/api';
import { unauthorizedResponse } from '@/lib/auth';
import { ensureLayout, readStudents, readVolunteers } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = unauthorizedResponse(request);
  if (denied) return denied;

  // 구글 시트 설정 전에 화면을 둘러보기 위한 스위치. 읽기 전용이라 저장은 여전히 시트가 필요하다.
  if (process.env.DEMO_ROSTER === '1') {
    return Response.json({ volunteers: SEED_VOLUNTEERS, students: SEED_STUDENTS, demo: true });
  }

  try {
    await ensureLayout();
    const [volunteers, students] = await Promise.all([readVolunteers(), readStudents()]);
    return Response.json({ volunteers, students });
  } catch (error) {
    return errorResponse(error);
  }
}
