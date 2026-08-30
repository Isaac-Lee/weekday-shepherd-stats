import { errorResponse } from '@/lib/api';
import { unauthorizedResponse } from '@/lib/auth';
import { isGroup, type Group } from '@/lib/members';
import { saveVolunteerGroups } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

/** 담당 그룹 저장. 앱에서 한 번 고르면 시트에 남아 다음부터 기본값이 된다. */
export async function POST(request: Request) {
  const denied = unauthorizedResponse(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const { name, groups } = (body ?? {}) as { name?: unknown; groups?: unknown };
  if (typeof name !== 'string' || name.trim().length === 0) {
    return Response.json({ error: '봉사자 이름이 필요합니다.' }, { status: 400 });
  }
  if (!Array.isArray(groups) || !groups.every((group) => typeof group === 'string' && isGroup(group))) {
    return Response.json({ error: '담당 그룹이 올바르지 않습니다.' }, { status: 400 });
  }

  try {
    const picked = [...new Set(groups as Group[])];
    await saveVolunteerGroups(name.trim(), picked);
    return Response.json({ name: name.trim(), groups: picked });
  } catch (error) {
    return errorResponse(error);
  }
}
