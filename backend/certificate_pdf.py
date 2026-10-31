import math
import os
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

W, H = 792, 612  # US Letter landscape, same page as the Word certificate
LOGO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logo.png")
BLANK = "____________________"


def value(text, blank=BLANK):
    text = (text or "").strip()
    if not text:
        return blank
    return "<b>" + escape(text) + "</b>"


def draw_arch_text(c, text, cx, apex_y, radius, font, width):
    """Heading written along an arch (like the curved Word heading)."""
    size = width / stringWidth(text, font, 1)
    total = stringWidth(text, font, size)
    c.setFont(font, size)
    center_y = apex_y - radius
    angle = -total / (2.0 * radius)
    for ch in text:
        w = stringWidth(ch, font, size)
        mid = angle + (w / 2.0) / radius
        x = cx + radius * math.sin(mid)
        y = center_y + radius * math.cos(mid)
        c.saveState()
        c.translate(x, y)
        c.rotate(-math.degrees(mid))
        c.drawString(-w / 2.0, 0, ch)
        c.restoreState()
        angle += w / radius


def build_pdf(d):
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=(W, H))
    c.setTitle("Bonafide Certificate")

    # page border (3 pt, 24 pt from the page edge)
    c.setLineWidth(3)
    c.rect(24, 24, W - 48, H - 48)

    # curved university name
    c.setFillColorRGB(0, 0, 0)
    draw_arch_text(c, "THE WOMEN UNIVERSITY MULTAN", W / 2.0, H - 140, 1100, "Helvetica-Bold", 610)

    # logo
    if os.path.exists(LOGO):
        c.drawImage(LOGO, W / 2.0 - 39, H - 262, width=78, height=65, preserveAspectRatio=True, mask="auto")

    # title
    c.setFont("Times-Bold", 20)
    title = "BONAFIDE CERTIFICATE"
    c.drawCentredString(W / 2.0, H - 285, title)
    tw = stringWidth(title, "Times-Bold", 20)
    c.setLineWidth(1)
    c.line(W / 2.0 - tw / 2.0, H - 288, W / 2.0 + tw / 2.0, H - 288)

    # paragraph
    text = (
        "Certified that Ms. {name} D/O {father} University Roll No: {roll} "
        "is a regular student of this university enrolled in class ({shift}), ({program}) "
        "during the Session: {session}, Section: {section}. "
        "She is currently studying in {semester} Semester."
    ).format(
        name=value(d.get("student_name")),
        father=value(d.get("father_name")),
        roll=value(d.get("roll_no")),
        shift=value(d.get("shift"), "Morning/Evening"),
        program=value(d.get("program"), "BSCS/ BSIT"),
        session=value(d.get("session"), "___________"),
        section=value(d.get("section"), "A, B, C, and D"),
        semester=value(d.get("semester"), "________"),
    )
    style = ParagraphStyle(
        "body",
        fontName="Times-Roman",
        fontSize=12,
        leading=27,
        alignment=TA_JUSTIFY,
        firstLineIndent=36,
    )
    p = Paragraph(text, style)
    _, ph = p.wrap(W - 144, 200)
    p.drawOn(c, 72, H - 305 - ph)

    # date (left) and signature block (right)
    c.setFont("Times-Roman", 12)
    date_text = (d.get("date_text") or "").strip()
    if date_text:
        c.drawString(72, H - 438, "Dated: ")
        c.setFont("Times-Bold", 12)
        c.drawString(72 + stringWidth("Dated: ", "Times-Roman", 12), H - 438, date_text)
    else:
        c.drawString(72, H - 438, "Dated:______________________")
    c.setFont("Times-Bold", 12)
    c.drawString(530, H - 438, "Dr. Khadija Kanwal")
    c.setFont("Times-Roman", 12)
    c.drawString(530, H - 452, "Director")
    c.drawString(530, H - 466, "Institute of CS& IT")

    c.showPage()
    c.save()
    return buf.getvalue()
