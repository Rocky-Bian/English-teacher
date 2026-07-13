#!/usr/bin/env python3
"""Convert project quotation markdown to PDF (Chinese-friendly)."""

import re
import sys
from pathlib import Path

import fitz
import markdown

CSS = """
body {
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 10.5pt;
  line-height: 1.55;
  color: #222;
}
h1 { font-size: 18pt; margin: 0 0 12pt; }
h2 { font-size: 13pt; margin: 18pt 0 8pt; border-bottom: 1px solid #e5e5e5; padding-bottom: 4pt; }
h3 { font-size: 11.5pt; margin: 14pt 0 6pt; }
p { margin: 6pt 0; }
ul, ol { margin: 6pt 0 6pt 18pt; padding: 0; }
li { margin: 3pt 0; }
table {
  border-collapse: collapse;
  width: 100%;
  margin: 10pt 0;
  font-size: 10pt;
}
th, td {
  border: 1px solid #d0d0d0;
  padding: 6pt 8pt;
  text-align: left;
  vertical-align: top;
}
th {
  background: #c0392b;
  color: #fff;
  font-weight: 600;
}
tr:nth-child(even) td { background: #fafafa; }
blockquote {
  border-left: 4px solid #c0392b;
  background: #fdf5f5;
  margin: 10pt 0;
  padding: 8pt 12pt;
  color: #444;
}
code, pre {
  font-family: Menlo, Consolas, monospace;
  font-size: 9pt;
  background: #f5f5f5;
}
pre {
  padding: 8pt;
  border: 1px solid #e8e8e8;
  white-space: pre-wrap;
}
hr { border: none; border-top: 1px solid #e0e0e0; margin: 16pt 0; }
a { color: #1a5fb4; text-decoration: none; }
strong { font-weight: 600; }
"""


def preprocess_md(text: str) -> str:
    """Replace mermaid blocks with a short note for PDF."""
    return re.sub(
        r"```mermaid\n[\s\S]*?```",
        "> *（系统架构示意图见 Markdown 源文件中的 Mermaid 图）*",
        text,
    )


def md_to_pdf(md_path: Path, pdf_path: Path) -> None:
    raw = md_path.read_text(encoding="utf-8")
    body = markdown.markdown(
        preprocess_md(raw),
        extensions=["tables", "fenced_code", "nl2br", "sane_lists"],
    )
    html = (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        f"<style>{CSS}</style></head><body>{body}</body></html>"
    )

    story = fitz.Story(html=html)
    writer = fitz.DocumentWriter(str(pdf_path))
    mediabox = fitz.paper_rect("a4")
    margin = 42
    where = mediabox + (margin, margin, -margin, -margin)

    while True:
        dev = writer.begin_page(mediabox)
        more, _ = story.place(where)
        story.draw(dev)
        writer.end_page()
        if not more:
            break

    writer.close()


def main() -> None:
    md_path = Path(
        sys.argv[1]
        if len(sys.argv) > 1
        else "/Users/mac/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/rock_jay_6dd0/temp/drag/04_项目交付承诺与报价书_客户版.md"
    )
    pdf_path = Path(
        sys.argv[2]
        if len(sys.argv) > 2
        else "/Users/mac/Desktop/04_项目交付承诺与报价书_客户版.pdf"
    )

    if not md_path.exists():
        raise SystemExit(f"Markdown not found: {md_path}")

    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    md_to_pdf(md_path, pdf_path)
    print(f"PDF saved: {pdf_path}")


if __name__ == "__main__":
    main()
