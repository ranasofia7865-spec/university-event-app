import os
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle

W, H = 960, 540
GREEN = colors.HexColor("#92D050")
LOGO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logo.png")
HEADERS = ["Sr No", "Date", "Subject", "Time", "Venue", "Instructor", "DUTY"]
COL_W = [55, 100, 215, 110, 65, 170, 160]


def fmt(d):
    return d.strftime("%d-%m-%Y") if d else ""


def draw_sheet(c, ds):
    c.setFillColor(colors.black)
    c.setFont("Times-Bold", 17)
    c.drawCentredString(W / 2 + 40, H - 48, "The Women University Multan")
    c.setFont("Times-Bold", 15)
    c.drawCentredString(W / 2 + 40, H - 72, "INSTITUTE OF COMPUTER SCIENCE & INFORMATION TECHNOLOGY")
    c.setFont("Times-Roman", 12)
    c.drawCentredString(W / 2 + 40, H - 90, ds["kind"] + " Date Sheet, " + ds["term"])
    if os.path.exists(LOGO):
        c.drawImage(LOGO, 105, H - 104, width=66, height=66, preserveAspectRatio=True, mask="auto")
    title = "{0} {1} Semester, Session ({2}) Section {3}".format(
        ds["program"], ds["semester"], ds["session"], ds["section"]
    )
    c.setFont("Helvetica-Bold", 11)
    c.drawString(75, H - 124, title)

    size = 11
    while True:
        cell = ParagraphStyle("c", fontName="Helvetica", fontSize=size, leading=size + 2)
        head = ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=size, leading=size + 2)
        data = [[Paragraph(t, head) for t in HEADERS]]
        for i, r in enumerate(ds["rows"], 1):
            values = [
                str(i),
                fmt(r["exam_date"]),
                r["subject"] or "",
                r["time_text"] or "",
                r["venue"] or "",
                r["instructor"] or "",
                r["duty"] or "",
            ]
            data.append([Paragraph(escape(v), cell) for v in values])
        t = Table(data, colWidths=COL_W)
        pad = max(2, size - 4)
        t.setStyle(
            TableStyle(
                [
                    ("GRID", (0, 0), (-1, -1), 0.8, colors.black),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("BACKGROUND", (6, 1), (6, -1), GREEN),
                    ("TOPPADDING", (0, 0), (-1, -1), pad),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), pad),
                ]
            )
        )
        w, h = t.wrapOn(c, W, H)
        if h <= H - 140 - 105 or size <= 7:
            break
        size -= 1
    t.drawOn(c, 40, H - 140 - h)

    y = max(H - 140 - h - 22, 70)
    c.setFillColor(colors.black)
    c.setFont("Helvetica", 11)
    sigs = [
        (95, [ds["incharge_bsit"] or "Ms. ____________", "Examination Incharge BSIT Morning", "Institute of CS&IT"]),
        (370, [ds["incharge_bscs"] or "Ms. ____________", "Examination Incharge BSCS Morning", "Institute of CS&IT"]),
        (680, [ds["director"] or "Dr. ____________", "Director", "Institute of CS&IT"]),
    ]
    for x, lines in sigs:
        for i, line in enumerate(lines):
            c.drawString(x, y - i * 19, line)


def build_pdf(sheets):
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=(W, H))
    c.setTitle("Date Sheet")
    for ds in sheets:
        draw_sheet(c, ds)
        c.showPage()
    c.save()
    return buf.getvalue()
