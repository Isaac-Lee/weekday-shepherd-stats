/**
 * 아주 얇은 접근 제어. APP_PASSWORD 환경변수가 있으면 그 값을 아는 사람만 쓸 수 있고,
 * 없으면 링크를 아는 누구나 쓸 수 있다. 계정/세션 개념은 두지 않는다.
 */

export const PASSWORD_HEADER = 'x-app-password';

export function passwordRequired(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

/** 타이밍 공격 방지용 상수 시간 비교. 짧은 비밀번호라 형식적이지만 비용이 없다. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAuthorized(request: Request): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true;
  const provided = request.headers.get(PASSWORD_HEADER) ?? '';
  return safeEqual(provided, expected);
}

/** 권한이 없으면 401 응답을, 있으면 null을 돌려준다. */
export function unauthorizedResponse(request: Request): Response | null {
  if (isAuthorized(request)) return null;
  return Response.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
}
