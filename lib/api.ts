import { SheetsConfigError } from './sheets';

/** 시트 관련 오류를 사용자에게 보여줄 수 있는 형태로 바꾼다. */
export function errorResponse(error: unknown): Response {
  if (error instanceof SheetsConfigError) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  console.error('[sheets]', error);
  const message = error instanceof Error ? error.message : '알 수 없는 오류';
  return Response.json({ error: `구글 시트에 접근하지 못했습니다: ${message}` }, { status: 500 });
}
