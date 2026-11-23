"""Documents the AI assistant can build: datesheet and timetable PDFs.

The AI reads the teacher's text, picture or PDF and returns plain data.
This file checks that data, cleans it, and builds the PDF with the same
layouts the Datesheet and Timetable screens already use.
"""
import datetime
import re

MAX_SHEETS = 60
MAX_ROWS = 40
MAX_COURSES = 30
DATE_FORMATS = ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y", "%d %B %Y", "%d %b %Y", "%B %d, %Y")
DEFAULT_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
DEFAULT_SLOTS = ["08:00-09:00", "09:00-10:00", "10:00-11:00", "11:00-12:00", "12:00-01:00", "01:00-02:00"]
KINDS = ("datesheet", "timetable", "document")
BLOCK_TYPES = ("heading", "paragraph", "bullets", "numbered", "table")


def text(value, limit=120):
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()[:limit]


def parse_date(value):
    value = text(value, 40)
    for fmt in DATE_FORMATS:
        try:
            return datetime.datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def clean_datesheet(raw, warnings):
    exam_kind = "Final term" if "final" in text(raw.get("exam_kind")).lower() else "Mid-term"
    sheets = []
    for s in (raw.get("sheets") or [])[:MAX_SHEETS]:
        if not isinstance(s, dict):
            continue
        rows = []
        bad_dates = 0
        for r in (s.get("rows") or [])[:MAX_ROWS]:
            if not isinstance(r, dict):
                continue
            d = parse_date(r.get("date"))
            if text(r.get("date")) and d is None:
                bad_dates += 1
            row = {
                "date": d.isoformat() if d else "",
                "subject": text(r.get("subject"), 100),
                "time": text(r.get("time"), 30),
                "venue": text(r.get("venue"), 50),
                "instructor": text(r.get("instructor"), 100),
                "duty": text(r.get("duty"), 100),
            }
            if row["subject"] or row["date"]:
                rows.append(row)
        label = text(s.get("program"), 20) + " " + text(s.get("semester"), 20) + " " + text(s.get("section"), 10)
        if bad_dates:
            warnings.append(str(bad_dates) + " date(s) in " + label.strip() + " could not be read and were left empty.")
        if not rows:
            continue
        sheets.append(
            {
                "program": text(s.get("program"), 20),
                "semester": text(s.get("semester"), 20),
                "session": text(s.get("session"), 20),
                "section": text(s.get("section"), 10),
                "incharge_bsit": text(s.get("incharge_bsit"), 80),
                "incharge_bscs": text(s.get("incharge_bscs"), 80),
                "director": text(s.get("director"), 80),
                "rows": rows,
            }
        )
    return {
        "kind": "datesheet",
        "title": text(raw.get("title"), 120) or (exam_kind + " Datesheet"),
        "exam_kind": exam_kind,
        "term": text(raw.get("term"), 40),
        "sheets": sheets,
    }


def clean_timetable(raw, warnings):
    sheets = []
    for s in (raw.get("sheets") or [])[:MAX_SHEETS]:
        if not isinstance(s, dict):
            continue
        days = [text(d, 20) for d in (s.get("days") or raw.get("days") or DEFAULT_DAYS) if text(d, 20)][:7]
        slots = [text(t, 20) for t in (s.get("time_slots") or raw.get("time_slots") or DEFAULT_SLOTS) if text(t, 20)][:10]
        courses = []
        for c in (s.get("courses") or [])[:MAX_COURSES]:
            if isinstance(c, dict) and text(c.get("code")):
                courses.append(
                    {
                        "code": text(c.get("code"), 20),
                        "subject": text(c.get("subject"), 100),
                        "credit_hours": text(c.get("credit_hours"), 20),
                        "faculty": text(c.get("faculty"), 100),
                    }
                )
        cells = []
        dropped = 0
        for c in (s.get("slots") or [])[:100]:
            if not isinstance(c, dict):
                continue
            day, slot, code = text(c.get("day"), 20), text(c.get("slot"), 20), text(c.get("course_code"), 20)
            if code and day in days and slot in slots:
                cells.append({"day": day, "slot": slot, "course_code": code, "room": text(c.get("room"), 30)})
            elif code:
                dropped += 1
        label = (text(s.get("program"), 20) + " " + text(s.get("semester"), 20) + " " + text(s.get("section"), 10)).strip()
        if dropped:
            warnings.append(str(dropped) + " class(es) in " + label + " did not match a day or time and were left out.")
        if not cells and not courses:
            continue
        sheets.append(
            {
                "program": text(s.get("program"), 20),
                "semester": text(s.get("semester"), 20),
                "section": text(s.get("section"), 10),
                "days": days,
                "time_slots": slots,
                "courses": courses,
                "slots": cells,
            }
        )
    return {
        "kind": "timetable",
        "title": text(raw.get("title"), 120) or "Class-wise Timetable",
        "term": text(raw.get("term"), 40),
        "sheets": sheets,
    }


def clean_general(raw, warnings):
    """A general document: letters, reports, programs, lists, schedules, minutes."""
    blocks = []
    for b in (raw.get("blocks") or [])[:120]:
        if not isinstance(b, dict):
            continue
        kind = text(b.get("type"), 20).lower()
        if kind not in BLOCK_TYPES:
            continue
        if kind in ("heading", "paragraph"):
            t = text(b.get("text"), 2500)
            if t:
                blocks.append({"type": kind, "text": t})
        elif kind in ("bullets", "numbered"):
            items = [text(i, 400) for i in (b.get("items") or [])[:40] if text(i, 400)]
            if items:
                blocks.append({"type": kind, "items": items})
        else:
            cols = [text(c, 60) for c in (b.get("columns") or [])[:8]]
            rows = []
            for r in (b.get("rows") or [])[:60]:
                if isinstance(r, (list, tuple)):
                    rows.append([text(r[i], 150) if i < len(r) else "" for i in range(len(cols))])
            if cols and rows:
                blocks.append({"type": "table", "columns": cols, "rows": rows})
    sig = [text(x, 80) for x in (raw.get("signature") or [])[:4] if text(x, 80)]
    return {
        "kind": "document",
        "title": text(raw.get("title"), 140) or "Document",
        "subtitle": text(raw.get("subtitle"), 160),
        "blocks": blocks,
        "signature": sig,
        "sheets": blocks,  # kept so the same checks and counts work for every kind
    }


def clean_document(raw):
    """Returns (document or None, list of warnings)."""
    warnings = []
    if not isinstance(raw, dict):
        return None, warnings
    kind = text(raw.get("kind"), 20).lower()
    if kind not in KINDS:
        return None, warnings
    if kind == "datesheet":
        doc = clean_datesheet(raw, warnings)
    elif kind == "timetable":
        doc = clean_timetable(raw, warnings)
    else:
        doc = clean_general(raw, warnings)
    if not doc["sheets"]:
        return None, warnings
    return doc, warnings


def summary(doc):
    if doc["kind"] == "document":
        return "document titled " + doc["title"] + " with " + str(len(doc["blocks"])) + " part(s)"
    n = len(doc["sheets"])
    if doc["kind"] == "datesheet":
        rows = sum(len(s["rows"]) for s in doc["sheets"])
        return "datesheet with " + str(n) + " class(es) and " + str(rows) + " paper(s)"
    return "timetable with " + str(n) + " class(es)"


def build_general_pdf(doc):
    import os
    from io import BytesIO

    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import Image, ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    def esc(t):
        return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    teal = colors.HexColor("#0F766E")
    base = ParagraphStyle("b", fontName="Helvetica", fontSize=11, leading=16, alignment=TA_JUSTIFY, spaceAfter=7)
    h_style = ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=teal, spaceBefore=8, spaceAfter=5)
    title_style = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=18, leading=22, alignment=TA_CENTER, spaceAfter=4)
    sub_style = ParagraphStyle("s", fontName="Helvetica", fontSize=11, leading=15, alignment=TA_CENTER, textColor=colors.HexColor("#444444"), spaceAfter=10)
    uni_style = ParagraphStyle("u", fontName="Times-Bold", fontSize=15, leading=19, alignment=TA_CENTER)
    cell = ParagraphStyle("c", fontName="Helvetica", fontSize=9.5, leading=12)
    cell_h = ParagraphStyle("ch", fontName="Helvetica-Bold", fontSize=9.5, leading=12)

    story = []
    logo = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logo.png")
    if os.path.exists(logo):
        story.append(Image(logo, width=18 * mm, height=18 * mm, hAlign="CENTER"))
    story.append(Paragraph("The Women University Multan", uni_style))
    story.append(Spacer(1, 6))
    story.append(Paragraph(esc(doc["title"]), title_style))
    if doc.get("subtitle"):
        story.append(Paragraph(esc(doc["subtitle"]), sub_style))
    story.append(Spacer(1, 4))
    for b in doc["blocks"]:
        if b["type"] == "heading":
            story.append(Paragraph(esc(b["text"]), h_style))
        elif b["type"] == "paragraph":
            story.append(Paragraph(esc(b["text"]), base))
        elif b["type"] in ("bullets", "numbered"):
            items = [ListItem(Paragraph(esc(i), base), leftIndent=14) for i in b["items"]]
            kw = {"bulletType": "bullet", "start": "\u2022"} if b["type"] == "bullets" else {"bulletType": "1", "bulletFormat": "%s."}
            story.append(ListFlowable(items, leftIndent=16, **kw))
            story.append(Spacer(1, 4))
        else:
            data = [[Paragraph(esc(c), cell_h) for c in b["columns"]]] + [[Paragraph(esc(c), cell) for c in r] for r in b["rows"]]
            t = Table(data, repeatRows=1, hAlign="LEFT")
            t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.6, colors.black), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E0F0EE")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
            story.append(t)
            story.append(Spacer(1, 8))
    if doc.get("signature"):
        story.append(Spacer(1, 22))
        sig_style = ParagraphStyle("sg", fontName="Helvetica", fontSize=11, leading=15, leftIndent=300)
        for i, line in enumerate(doc["signature"]):
            story.append(Paragraph(("<b>" + esc(line) + "</b>") if i == 0 else esc(line), sig_style))

    def footer(canvas, d):
        canvas.saveState()
        canvas.setFont("Helvetica", 8.5)
        canvas.setFillColor(colors.HexColor("#666666"))
        canvas.drawCentredString(A4[0] / 2, 12 * mm, "The Women University Multan   |   Page " + str(d.page))
        canvas.restoreState()

    buf = BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=16 * mm, bottomMargin=20 * mm, title=doc["title"]).build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


def build_pdf(doc, department=None):
    """Builds the PDF bytes with the existing layouts."""
    if doc["kind"] == "document":
        return build_general_pdf(doc)
    if doc["kind"] == "datesheet":
        import datesheet_pdf

        data = []
        for s in doc["sheets"]:
            data.append(
                {
                    "kind": doc.get("exam_kind") or "Mid-term",
                    "term": doc.get("term") or "",
                    "program": s["program"],
                    "semester": s["semester"],
                    "session": s["session"],
                    "section": s["section"],
                    "incharge_bsit": s["incharge_bsit"],
                    "incharge_bscs": s["incharge_bscs"],
                    "director": s["director"],
                    "rows": [
                        {
                            "exam_date": datetime.date.fromisoformat(r["date"]) if r["date"] else None,
                            "subject": r["subject"],
                            "time_text": r["time"],
                            "venue": r["venue"],
                            "instructor": r["instructor"],
                            "duty": r["duty"],
                        }
                        for r in s["rows"]
                    ],
                }
            )
        return datesheet_pdf.build_pdf(data)

    import timetable_pdf

    data = []
    for s in doc["sheets"]:
        data.append(
            {
                "term": doc.get("term") or "",
                "program": s["program"],
                "semester": s["semester"],
                "section": s["section"],
                "department": department,
                "days": s["days"],
                "time_slots": s["time_slots"],
                "cells": {(c["day"], c["slot"]): (c["course_code"], c["room"]) for c in s["slots"]},
                "courses": s["courses"],
            }
        )
    return timetable_pdf.build_pdf(data)


def file_name(doc):
    base = re.sub(r"[^A-Za-z0-9]+", "_", doc.get("title") or doc["kind"]).strip("_") or doc["kind"]
    return base[:60] + ".pdf"
