import io
import os
import re
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

try:
    import arabic_reshaper
    from bidi.algorithm import get_display
    HAS_BIDI = True
except ImportError:
    HAS_BIDI = False


FONTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "static", "fonts")
_FONTS_INITIALIZED = False
_RTL_FONT_NAME = "Helvetica"
_RTL_BOLD_FONT_NAME = "Helvetica-Bold"

RTL_CHAR_PATTERN = re.compile(r'[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]')

# Configure reshaper with full Sindhi, Urdu, and Arabic ligatures
_RESHAPER_CONFIG = {
    'delete_harakat': False,
    'support_ligatures': True,
    'sindhi': True,
    'urdu': True
}
_reshaper_instance = arabic_reshaper.ArabicReshaper(configuration=_RESHAPER_CONFIG) if HAS_BIDI else None


def register_fonts():
    """Registers Unicode TrueType fonts that support Urdu, Sindhi, and Arabic."""
    global _FONTS_INITIALIZED, _RTL_FONT_NAME, _RTL_BOLD_FONT_NAME
    if _FONTS_INITIALIZED:
        return

    arabic_reg = os.path.join(FONTS_DIR, "NotoSansArabic-Regular.ttf")
    arabic_bold = os.path.join(FONTS_DIR, "NotoSansArabic-Bold.ttf")
    urdu_reg = os.path.join(FONTS_DIR, "NotoNastaliqUrdu-Regular.ttf")
    urdu_bold = os.path.join(FONTS_DIR, "NotoNastaliqUrdu-Bold.ttf")

    registered = False

    # 1. Try Noto Sans Arabic (Best full glyph coverage for Sindhi and Urdu)
    if os.path.exists(arabic_reg):
        try:
            pdfmetrics.registerFont(TTFont("NotoArabic", arabic_reg))
            _RTL_FONT_NAME = "NotoArabic"
            registered = True
            if os.path.exists(arabic_bold):
                pdfmetrics.registerFont(TTFont("NotoArabic-Bold", arabic_bold))
                _RTL_BOLD_FONT_NAME = "NotoArabic-Bold"
            else:
                _RTL_BOLD_FONT_NAME = "NotoArabic"
        except Exception:
            pass

    # 2. Try Noto Nastaliq Urdu
    if os.path.exists(urdu_reg):
        try:
            pdfmetrics.registerFont(TTFont("NotoUrdu", urdu_reg))
            if not registered:
                _RTL_FONT_NAME = "NotoUrdu"
                registered = True
            if os.path.exists(urdu_bold):
                pdfmetrics.registerFont(TTFont("NotoUrdu-Bold", urdu_bold))
                if _RTL_BOLD_FONT_NAME == "Helvetica-Bold":
                    _RTL_BOLD_FONT_NAME = "NotoUrdu-Bold"
        except Exception:
            pass

    # 3. Windows Tahoma Fallback
    if not registered:
        win_tahoma = r"C:\Windows\Fonts\tahoma.ttf"
        win_tahoma_bd = r"C:\Windows\Fonts\tahomabd.ttf"
        if os.path.exists(win_tahoma):
            try:
                pdfmetrics.registerFont(TTFont("Tahoma", win_tahoma))
                _RTL_FONT_NAME = "Tahoma"
                if os.path.exists(win_tahoma_bd):
                    pdfmetrics.registerFont(TTFont("Tahoma-Bold", win_tahoma_bd))
                    _RTL_BOLD_FONT_NAME = "Tahoma-Bold"
                else:
                    _RTL_BOLD_FONT_NAME = "Tahoma"
                registered = True
            except Exception:
                pass

    _FONTS_INITIALIZED = True


def is_rtl(text: str) -> bool:
    """Checks if a string contains Urdu, Sindhi, or Arabic characters."""
    if not text:
        return False
    return bool(RTL_CHAR_PATTERN.search(str(text)))


def shape_text(text: str) -> str:
    """Reshapes Arabic/Urdu/Sindhi text with correct Bidi algorithm order."""
    if not text:
        return ""
    text_str = str(text)
    if is_rtl(text_str) and HAS_BIDI and _reshaper_instance:
        try:
            reshaped = _reshaper_instance.reshape(text_str)
            return get_display(reshaped)
        except Exception:
            return text_str
    return text_str


def generate_question_paper_pdf(
    school_name: str,
    exam_term: str,
    grade: str,
    subject: str,
    time_allowed: str,
    total_marks: str,
    teacher_name: str,
    instructions: str,
    sec_a_title: str,
    sec_a_marks: str,
    sec_a_content: str,
    sec_b_title: str,
    sec_b_marks: str,
    sec_b_content: str,
    sec_c_title: str,
    sec_c_marks: str,
    sec_c_content: str
) -> bytes:
    """
    Generates a professional PDF question paper with seamless multilingual
    support for English, Urdu, and Sindhi languages.
    """
    register_fonts()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()

    # Base Typography Styles
    title_style = ParagraphStyle(
        'HeaderTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=16,
        leading=20,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#1E293B')
    )

    subtitle_style = ParagraphStyle(
        'HeaderSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#334155')
    )

    meta_val_style = ParagraphStyle(
        'MetaValue',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#334155')
    )

    # LTR Styles (English)
    ltr_sec_header_style = ParagraphStyle(
        'LtrSectionHeader',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#1E3A8A'),
        spaceBefore=10,
        spaceAfter=6
    )

    ltr_body_style = ParagraphStyle(
        'LtrPaperBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=15,
        alignment=TA_LEFT,
        textColor=colors.HexColor('#0F172A')
    )

    ltr_instruction_style = ParagraphStyle(
        'LtrInstructionText',
        parent=styles['Italic'],
        fontName='Helvetica-Oblique',
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor('#475569')
    )

    # RTL Styles (Urdu / Sindhi / Arabic)
    rtl_sec_header_style = ParagraphStyle(
        'RtlSectionHeader',
        parent=styles['Heading2'],
        fontName=_RTL_BOLD_FONT_NAME,
        fontSize=13,
        leading=22,
        alignment=TA_RIGHT,
        textColor=colors.HexColor('#1E3A8A'),
        spaceBefore=10,
        spaceAfter=6
    )

    rtl_body_style = ParagraphStyle(
        'RtlPaperBody',
        parent=styles['Normal'],
        fontName=_RTL_FONT_NAME,
        fontSize=11,
        leading=20,
        alignment=TA_RIGHT,
        textColor=colors.HexColor('#0F172A')
    )

    rtl_instruction_style = ParagraphStyle(
        'RtlInstructionText',
        parent=styles['Normal'],
        fontName=_RTL_FONT_NAME,
        fontSize=10.5,
        leading=18,
        alignment=TA_RIGHT,
        textColor=colors.HexColor('#475569')
    )

    story = []

    # 1. School Header
    story.append(Paragraph(shape_text(school_name.upper()), title_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph(f"EXAMINATION PAPER — {shape_text(exam_term.upper())}", subtitle_style))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#1E3A8A'), spaceBefore=2, spaceAfter=8))

    # 2. Metadata Table Grid
    disp_subject = shape_text(subject)
    disp_teacher = shape_text(teacher_name)
    disp_time = shape_text(time_allowed)
    disp_marks = shape_text(total_marks)
    disp_grade = shape_text(grade)

    meta_data = [
        [
            Paragraph(f"<b>Grade / Class:</b> {disp_grade}", meta_val_style),
            Paragraph(f"<b>Subject:</b> {disp_subject}", meta_val_style)
        ],
        [
            Paragraph(f"<b>Time Allowed:</b> {disp_time}", meta_val_style),
            Paragraph(f"<b>Total Marks:</b> {disp_marks}", meta_val_style)
        ],
        [
            Paragraph(f"<b>Teacher / Examiner:</b> {disp_teacher}", meta_val_style),
            Paragraph("<b>Date:</b> _________________", meta_val_style)
        ]
    ]

    meta_table = Table(meta_data, colWidths=[270, 270])
    meta_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 10))

    # 3. General Instructions
    if instructions and instructions.strip():
        inst_is_rtl = is_rtl(instructions)
        hdr_label = shape_text("ہدایات برائے طلباء:" if inst_is_rtl else "General Instructions:")
        hdr_style = ParagraphStyle(
            'InstHdr', parent=styles['Normal'],
            fontName=_RTL_BOLD_FONT_NAME if inst_is_rtl else 'Helvetica-Bold',
            fontSize=10.5 if inst_is_rtl else 10,
            leading=16,
            alignment=TA_RIGHT if inst_is_rtl else TA_LEFT,
            textColor=colors.HexColor('#0F172A')
        )
        story.append(Paragraph(f"<b>{hdr_label}</b>", hdr_style))
        story.append(Spacer(1, 2))

        for line in instructions.strip().split('\n'):
            line_clean = line.strip()
            if line_clean:
                line_rtl = is_rtl(line_clean)
                st_to_use = rtl_instruction_style if line_rtl else ltr_instruction_style
                bullet_prefix = "• " if not line_rtl else "• "
                story.append(Paragraph(f"{bullet_prefix}{shape_text(line_clean)}", st_to_use))
                story.append(Spacer(1, 2))
        story.append(Spacer(1, 8))

    story.append(HRFlowable(width="100%", thickness=0.75, color=colors.HexColor('#94A3B8'), spaceBefore=2, spaceAfter=10))

    # Helper function to append section
    def append_section(title, marks, content):
        if not content or not content.strip():
            return
        
        sec_title_rtl = is_rtl(title)
        formatted_title = shape_text(title)
        
        if marks and marks.strip():
            formatted_marks = shape_text(marks)
            sec_hdr_text = f"{formatted_title} <font color='#64748B'>({formatted_marks})</font>"
        else:
            sec_hdr_text = formatted_title

        hdr_style = rtl_sec_header_style if sec_title_rtl else ltr_sec_header_style
        story.append(Paragraph(sec_hdr_text, hdr_style))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#CBD5E1'), spaceBefore=2, spaceAfter=6))

        for block in content.strip().split('\n'):
            block_clean = block.strip()
            if block_clean:
                line_rtl = is_rtl(block_clean)
                body_st = rtl_body_style if line_rtl else ltr_body_style
                shaped_line = shape_text(block_clean).replace('\t', '&nbsp;&nbsp;&nbsp;&nbsp;')
                story.append(Paragraph(shaped_line, body_st))
                story.append(Spacer(1, 4))
        story.append(Spacer(1, 8))

    # 4. Render Sections
    append_section(sec_a_title or "Section A", sec_a_marks, sec_a_content)
    append_section(sec_b_title or "Section B", sec_b_marks, sec_b_content)
    append_section(sec_c_title or "Section C", sec_c_marks, sec_c_content)

    doc.build(story)
    pdf_data = buffer.getvalue()
    buffer.close()
    return pdf_data
