import { isAuthorized, passwordRequired } from '@/lib/auth';
import { currentWeekKey, shiftWeek, weekLabelLong, weekLabelWithDay } from '@/lib/week';

export const dynamic = 'force-dynamic';

/** 첫 화면에서 필요한 정보. 비밀번호 확인도 이 엔드포인트로 겸한다. */
export async function GET(request: Request) {
  const thisWeek = currentWeekKey();
  const lastWeek = shiftWeek(thisWeek, -1);

  return Response.json({
    passwordRequired: passwordRequired(),
    authorized: isAuthorized(request),
    sheetUrl: process.env.GOOGLE_SHEET_ID
      ? `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit`
      : null,
    // name = '이번 주', range = '8/2(주일)~8/8(토)'(버튼 안), label = 긴 설명(선택된 주차 강조용)
    weeks: [
      { key: thisWeek, name: '이번 주', range: weekLabelWithDay(thisWeek), label: weekLabelLong(thisWeek) },
      { key: lastWeek, name: '지난주', range: weekLabelWithDay(lastWeek), label: weekLabelLong(lastWeek) },
    ],
  });
}
