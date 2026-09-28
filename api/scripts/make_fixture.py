"""Generate sample lab-report PDFs that look like typical Indian lab printouts.

  fixtures/sample_report.pdf      10pt, the one offered in the web app
  fixtures/sample_report_13pt.pdf same table at 13pt, to prove the clustering
                                  thresholds are derived from the document

Ranges deliberately use en-dashes and em-dashes, names use Indian conventions
(S.G.P.T, Sr. Creatinine, Vit. D (25-OH)), and one test is not in the catalog.
Values use grouping commas ("7,200") and abnormal flags ("6.3 H", "188 *"); one
line carries an OCR-style misprint ("2.l") so the confirm screen can show it.
Values are illustrative sample data.
"""
from __future__ import annotations

import sys
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

OUT = Path(__file__).resolve().parents[1] / "fixtures"

ROWS = [
    ("HAEMATOLOGY", None, None, None),
    ("Haemoglobin", "10.4", "g/dL", "12.0 – 15.0"),
    ("Total WBC Count", "7,200", "/cumm", "4,000 – 11,000"),
    ("Platelet Count", "2.6", "lakh/cumm", "1.5 – 4.1"),
    ("LIVER FUNCTION TEST", None, None, None),
    ("S.G.P.T", "46", "U/L", "0 – 35"),
    ("S.G.O.T", "31", "U/L", "0 – 35"),
    ("KIDNEY FUNCTION TEST", None, None, None),
    ("Sr. Creatinine", "1.1", "mg/dL", "0.6 — 1.1"),
    ("Potassium", "6.3 H", "mmol/L", "3.5 - 5.1"),
    ("Serum Magnesium", "2.l", "mg/dL", "1.6 - 2.6"),
    ("LIPID PROFILE", None, None, None),
    ("LDL Cholesterol", "171", "mg/dL", "< 100"),
    ("HDL Cholesterol", "42", "mg/dL", "> 40"),
    ("Triglycerides", "188 *", "mg/dL", "< 150"),
    ("DIABETES", None, None, None),
    ("HbA1c", "7.4", "%", ""),
    ("THYROID", None, None, None),
    ("TSH", "3.1", "µIU/mL", "0.4 – 4.0"),
    ("VITAMINS", None, None, None),
    ("Vit. D (25-OH)", "14", "ng/mL", "30 – 100"),
    ("Vitamin B12", "198", "pg/mL", "211 – 911"),
    ("Serum Ferritin", "8", "ng/mL", "30 – 400"),
    ("Homocysteine", "14.2", "µmol/L", "5 – 15"),
    ("URINE ROUTINE", None, None, None),
    ("Urine Protein", "Trace", "", "Nil"),
    ("Urine Glucose", "Nil", "", "Nil"),
]


def build(path: Path, size: float) -> None:
    c = canvas.Canvas(str(path), pagesize=A4)
    c.setTitle("Sample lab report (illustrative)")
    w, h = A4
    font = "Helvetica"
    # DejaVu is not bundled; register a TTF with µ and dashes if available
    for ttf in ("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", "/Library/Fonts/Arial Unicode.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if Path(ttf).exists():
            from reportlab.pdfbase import pdfmetrics
            from reportlab.pdfbase.ttfonts import TTFont

            pdfmetrics.registerFont(TTFont("Uni", ttf))
            font = "Uni"
            break
    lh = size * 1.9
    y = h - 60
    c.setFont(font, size + 6)
    c.drawString(50, y, "Sample Diagnostics Lab")
    y -= lh * 1.4
    c.setFont(font, size)
    c.drawString(50, y, "Patient: SAMPLE PATIENT   Age/Sex: 70 Y / F")
    y -= lh
    c.drawString(50, y, "Reported Date: 12/09/2026")
    y -= lh * 1.5

    scale = size / 10
    cols = [50, 50 + 190 * scale, 50 + 270 * scale, 50 + 360 * scale]
    c.setFont(font, size)
    for x, label in zip(cols, ("Test Name", "Result", "Unit", "Biological Ref. Interval")):
        c.drawString(x, y, label)
    y -= lh
    for name, value, unit, ref in ROWS:
        if y < 60:
            c.showPage()
            c.setFont(font, size)
            y = h - 60
        if value is None:
            c.drawString(cols[0], y, name)
        else:
            for x, text in zip(cols, (name, value, unit, ref)):
                if text:
                    c.drawString(x, y, text)
        y -= lh
    y -= lh
    c.drawString(50, y, "Illustrative sample for MedSimplify. Not a real patient.")
    c.save()


def main() -> None:
    OUT.mkdir(exist_ok=True)
    build(OUT / "sample_report.pdf", 10)
    build(OUT / "sample_report_13pt.pdf", 13)
    print("wrote", *sorted(p.name for p in OUT.glob("*.pdf")), file=sys.stderr)


if __name__ == "__main__":
    main()
