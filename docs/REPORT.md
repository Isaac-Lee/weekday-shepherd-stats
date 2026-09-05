# 주중 목양 PNG 보고서

Google Sheets의 `학생명단`과 `기록`을 읽어 표지 2장과 중·고등학생 형제·자매 현황표를 생성합니다. 원본 시트를 변경하지 않습니다. 이미지 생성 AI나 브라우저 캡처는 필요 없습니다.

## 처음 한 번 준비

프로젝트의 기존 `.env.local`에 `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`가 설정되어 있어야 합니다. 기존 앱과 같은 인증을 사용합니다.

Node.js 20.6 이상, 프로젝트 npm 패키지, Python 3.10 이상과 Pillow가 필요합니다.

```bash
npm install
python3 -m venv .venv
.venv/bin/python -m pip install -r scripts/requirements-report.txt
```

`.venv/bin/python`이 있으면 자동으로 사용하고, 없으면 `python3`를 사용합니다. `PYTHON` 환경변수로 다른 실행 파일을 지정할 수 있습니다.

Mac에서는 기본 설치된 Apple SD Gothic Neo Bold를 사용합니다. 다른 운영체제에서는 한글 글꼴을 설치한 후 `REPORT_FONT`에 Bold TTF/OTF 파일의 절대 경로를 지정하세요. 글꼴이 바뀌면 참고 이미지와 글자 모양이 달라집니다.

## 실행

프로젝트 폴더에서 실행합니다.

```bash
# 한국 시간 오늘 기준
npm run report

# 특정 날짜까지의 해당 월 보고서
npm run report -- --date 2026-09-05

# 같은 날짜 보고서를 다시 만들 때 별도 출력 경로
npm run report -- --date 2026-09-05 --out outputs/september-revised
```

기본 저장 위치는 `outputs/report-YYYY-MM-DD/`입니다. 기존 폴더는 덮어쓰지 않습니다. 생성 중 실패하면 임시 폴더를 정리하며, 실패를 완료로 표시하지 않습니다.

| 파일 | 내용 |
| --- | --- |
| `01_주중목양.png`, `02_연월.png` | 표지 2장 |
| 그룹 이름이 들어간 PNG | 그룹별 현황표, 각각 2880×1800 |
| `preview.jpg` | 전체 이미지 미리보기 |
| `report.zip` | 원본 PNG 전체 묶음 |
| `report.json` | 검증·재렌더링용 집계 데이터 |

출력에는 학생 이름과 목양 현황이 포함됩니다. `outputs/`는 Git 추적에서 제외됩니다.

## 집계 기준

- 보고 날짜가 속한 달과 겹치는 모든 일요일~토요일 주차를 시간순으로 표시합니다. 예: 2026년 9월은 `8/30~9/5`부터 `9/27~10/3`까지입니다. 월 경계 주는 인접 월 보고서에도 나타날 수 있습니다.
- 해당 주 항목에 기록이 하나라도 있으면 색을 채웁니다. 횟수에 따른 농도 차이는 없습니다. 주차별 분홍/파랑을 번갈아 사용합니다.
- 보고 날짜보다 뒤의 주차와 뒤에 입력된 기록은 제외합니다. 오늘 날짜로 실행하면 실행 시점에 읽은 기록을 사용합니다.
- 과거 날짜 보고서는 현재 명단·현재 남아 있는 기록에서 재구성합니다. 삭제 전 기록이나 과거 명단을 복원하는 기능은 아닙니다.
- 이름·그룹·학년을 함께 사용하여 동명이인을 구분합니다. 명단 순서를 따르고, 해당 기간 기록에만 있는 학생은 추가합니다.
- 학년 사이에 여백을 넣고 페이지당 25행으로 나눕니다. 25행을 넘으면 추가 PNG를 생성합니다.
- 첨부 예시의 네 그룹(중학생 형제·자매, 고등학생 형제·자매)을 출력합니다. 초등학생은 이번 보고서 범위에 포함하지 않습니다.

## 검증 및 렌더러만 실행

```bash
npm test
npm run typecheck

# 이미 생성된 집계 JSON으로 이미지만 다시 만들기 (시트 접근 없음)
python3 scripts/render-report.py outputs/report-2026-09-05
```

독립 렌더러 실행은 같은 이름의 이미지·미리보기·ZIP을 덮어씁니다. 일반 사용은 기존 폴더를 보호하는 `npm run report`를 권장합니다.

예약 작업에서는 프로젝트 폴더에서 `npm run report`를 실행한 뒤 생성된 `preview.jpg`와 `report.zip`을 전달하면 됩니다. 실행 환경에 Node/Python/Pillow/한글 글꼴과 기존 시트 인증이 있어야 합니다.
