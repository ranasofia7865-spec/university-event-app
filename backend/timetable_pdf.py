import os
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle

W, H = 960, 540
LEFT = 40
TABLE_W = W - 2 * LEFT
GREY = colors.HexColor("#E6E9ED")
LOGO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logo.png")
COURSE_HEADERS = ["Course code", "Subject", "Cr. hrs.", "Faculty"]
COURSE_W = [120, 400, 80, 280]


def para(text, font, size, align=1):
    style = ParagraphStyle(
        "p", fontName=font, fontSize=size, leading=size + 2, alignment=align
    )
    return Paragraph(text, style)


def build_grid(ts, size):
    days = ts["days"]
    slots = ts["time_slots"]
    data = [[para("Days / Time", "Helvetica-Bold", size)]]
    for s in slots:
        data[0].append(para(escape(s), "Helvetica-Bold", size))
    for day in days:
        row = [para(escape(day), "Helvetica-Bold", size)]
        for s in slots:
            code, room = ts["cells"].get((day, s), ("", ""))
            text = ""
            if code:
                text = "<b>" + escape(code) + "</b>"
                if room:
                    text += "<br/>" + escape(room)
            row.append(para(text, "Helvetica", size))
        data.append(row)
    first = 80
    other = (TABLE_W - first) / float(len(slots))
    t = Table(data, colWidths=[first] + [other] * len(slots))
    pad = max(2, size - 5)
    t.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.8, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BACKGROUND", (0, 0), (-1, 0), GREY),
                ("BACKGROUND", (0, 0), (0, -1), GREY),
                ("TOPPADDING", (0, 0), (-1, -1), pad),
                ("BOTTOMPADDING", (0, 0), (-1, -1), pad),
            ]
        )
    )
    return t


def build_courses(ts, size):
    if not ts["courses"]:
        return None
    data = [[para(h, "Helvetica-Bold", size) for h in COURSE_HEADERS]]
    for c in ts["courses"]:
        values = [c["code"], c["subject"], c["credit_hours"] or "", c["faculty"] or ""]
        data.append(
            [
                para(escape(v), "Helvetica", size, align=(0 if i in (1, 3) else 1))
                for i, v in enumerate(values)
            ]
        )
    t = Table(data, colWidths=COURSE_W)
    pad = max(1.5, size - 6)
    t.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.8, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BACKGROUND", (0, 0), (-1, 0), GREY),
                ("TOPPADDING", (0, 0), (-1, -1), pad),
                ("BOTTOMPADDING", (0, 0), (-1, -1), pad),
            ]
        )
    )
    return t


def draw_sheet(c, ts):
    c.setFillColor(colors.black)
    cx = W / 2
    c.setFont("Times-Bold", 17)
    c.drawCentredString(cx, H - 36, "The Women University Multan")
    y = H - 54
    if ts.get("department"):
        c.setFont("Times-Roman", 13)
        c.drawCentredString(cx, y, ts["department"])
        y -= 17
    c.setFont("Times-Roman", 12)
    c.drawCentredString(cx, y, "Class-wise Timetable (" + ts["term"] + ")")
    y -= 17
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(
        cx, y, "{0} {1} Semester - Section {2}".format(ts["program"], ts["semester"], ts["section"])
    )
    if os.path.exists(LOGO):
        c.drawImage(LOGO, 50, H - 82, width=60, height=60, preserveAspectRatio=True, mask="auto")

    top = y - 14
    bottom = 24
    size = 10
    while True:
        grid = build_grid(ts, size)
        courses = build_courses(ts, size)
        _, gh = grid.wrapOn(c, W, H)
        ch = 0
        if courses is not None:
            _, ch = courses.wrapOn(c, W, H)
            ch += 22
        if gh + ch + 8 <= top - bottom or size <= 6:
            break
        size -= 1
    grid.drawOn(c, LEFT, top - gh)
    if courses is not None:
        label_y = top - gh - 18
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(LEFT, label_y, "Courses")
        courses.drawOn(c, LEFT, label_y - 6 - (ch - 22))


def build_pdf(sheets):
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=(W, H))
    c.setTitle("Class-wise Timetable")
    for ts in sheets:
        draw_sheet(c, ts)
        c.showPage()
    c.save()
    return buf.getvalue()
