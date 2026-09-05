"""report.ts가 만든 JSON을 PNG로 렌더링. 네트워크나 원본 시트에는 접근하지 않는다."""
import datetime as dt
import json
import math
import os
from pathlib import Path
import sys
import zipfile

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit('Pillow가 필요합니다: python3 -m pip install -r scripts/requirements-report.txt')

WIDTH, HEIGHT = 2880, 1800
BLUE = '#17578d'


def load_font(size):
    custom = os.environ.get('REPORT_FONT')
    font = custom or '/System/Library/Fonts/AppleSDGothicNeo.ttc'
    if not Path(font).is_file():
        raise ValueError('한글 글꼴을 찾을 수 없습니다. REPORT_FONT에 한글 Bold TTF/OTF 경로를 지정하세요.')
    return ImageFont.truetype(font, size, index=0 if custom else 6)


def text(draw, box, value, size=34, color='black'):
    x, y, w, h = box
    while size >= 14:
        font = load_font(size)
        stroke = size // 90
        left, top, right, bottom = draw.textbbox((0, 0), value, font=font, stroke_width=stroke)
        if right - left <= w - 12 and bottom - top <= h - 8:
            draw.text((x + (w - right + left) / 2 - left,
                       y + (h - bottom + top) / 2 - top), value,
                      font=font, fill=color, stroke_width=stroke, stroke_fill=color)
            return
        size -= 1
    raise ValueError(f'칸에 들어가지 않는 텍스트: {value}')


def canvas(background='white'):
    image = Image.new('RGB', (WIDTH, HEIGHT), 'black')
    ImageDraw.Draw(image).rectangle((240, 0, 2639, HEIGHT), fill=background)
    return image


def render_report(folder):
    folder = Path(folder)
    report = json.loads((folder / 'report.json').read_text())
    files = []

    def save(image, name):
        target = folder / name
        image.save(target)
        with Image.open(target) as saved:
            assert saved.size == (WIDTH, HEIGHT)
            saved.verify()
        files.append(target)

    for name, bg, lines in [
        ('01_주중목양.png', '#008c51', ['주중', '목양']),
        ('02_연월.png', '#d37cf9', [f"{report['year']}년", f"{report['month']}월"]),
    ]:
        image = canvas(bg)
        draw = ImageDraw.Draw(image)
        for i, line in enumerate(lines):
            text(draw, (600, 250 + i * 680, 1680, 650), line, 570, 'white')
        save(image, name)

    weeks = report['weeks']
    # 최소 5주 틀. 6주에 걸친 달도 같은 캔버스 안에 모두 표시한다.
    slots = max(5, len(weeks))
    lead = [100, 166, 82]
    unit = (2340 - sum(lead)) / slots / 396
    widths = lead + [v * unit for v in [77, 77, 121, 121]] * slots
    xs = [270]
    for width in widths:
        xs.append(xs[-1] + width)
    y0, hh, rh = 135, 60, 60
    body, bottom = y0 + hh * 2, y0 + hh * 2 + rh * 25

    for index, page in enumerate(report['pages'], 3):
        image = canvas()
        draw = ImageDraw.Draw(image)
        suffix = f" ({page['page']})" if page['page'] > 1 else ''
        title = [(f"{report['year']} [{report['month']}월] ", 'black'),
                 (page['group'], page['color']), (' 주중 목양 현황' + suffix, 'black')]
        font = load_font(68)
        lengths = [draw.textlength(t, font=font) for t, _ in title]
        x = (WIDTH - sum(lengths)) / 2
        for (value, color), length in zip(title, lengths):
            draw.text((x, 20), value, font=font, fill=color)
            x += length
        for wi in range(slots):
            col = 3 + wi * 4
            label = ''
            if wi < len(weeks):
                start = dt.date.fromisoformat(weeks[wi])
                end = start + dt.timedelta(days=6)
                label = f'{start.month}/{start.day}~{end.month}/{end.day}'
            text(draw, (xs[col], y0, sum(widths[col:col+4]), hh), label)
            for ci, category in enumerate(report['categories']):
                c = col + ci
                if ci >= 2:
                    draw.rectangle((xs[c], y0+hh, xs[c+1], body), fill='#ffff79')
                text(draw, (xs[c], y0+hh, widths[c], hh), category, 33)
        for ci, label in enumerate(['No.', '이름']):
            text(draw, (xs[ci], y0, widths[ci], hh*2), label, 30)
        text(draw, (xs[2], y0, widths[2], hh), '기간', 28)
        text(draw, (xs[2], y0+hh, widths[2], hh), '구분', 28)
        previous_grade = None
        for ri, row in enumerate(page['rows']):
            y = body + ri * rh
            text(draw, (xs[0], y, widths[0], rh), str((page['page']-1)*25+ri+1), 38, page['color'])
            if row is None:
                continue
            text(draw, (xs[1], y, widths[1], rh), row['name'], 38)
            if row['grade'] != previous_grade:
                text(draw, (xs[2], y, widths[2], rh), row['grade'], 30)
            previous_grade = row['grade']
            for cell, active in enumerate(row['active']):
                if active:
                    c = 3 + cell
                    draw.rectangle((xs[c], y, xs[c+1], y+rh),
                                   fill='#ff2590' if (cell//4) % 2 == 0 else '#0734ff')
        for ri in range(26):
            draw.line((xs[0], body+ri*rh, xs[-1], body+ri*rh), fill=BLUE, width=2)
        draw.line((xs[2], y0+hh, xs[-1], y0+hh), fill=BLUE, width=2)
        for ci, x in enumerate(xs):
            boundary = ci >= 3 and (ci-3) % 4 == 0
            draw.line((x, y0 if ci <= 3 or boundary else y0+hh, x, bottom),
                      fill=BLUE, width=4 if boundary else 2)
        draw.rectangle((xs[0], y0, xs[-1], bottom), outline=BLUE, width=10)
        save(image, f"{index:02}_{page['group'].replace(' ', '_')}_{page['page']}.png")

    preview = Image.new('RGB', (1440, math.ceil(len(files)/2)*450), '#ddd')
    for i, file in enumerate(files):
        with Image.open(file) as image:
            image.thumbnail((720, 450))
            preview.paste(image, ((i % 2)*720, (i//2)*450))
    preview.save(folder / 'preview.jpg', quality=92)
    with zipfile.ZipFile(folder / 'report.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for file in files:
            archive.write(file, file.name)


if __name__ == '__main__':
    try:
        load_font(30)
        if len(sys.argv) != 2:
            raise ValueError('사용법: render-report.py 보고서폴더 또는 --check')
        if sys.argv[1] != '--check':
            render_report(sys.argv[1])
    except Exception as error:
        sys.exit(str(error))
