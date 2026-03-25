import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  Packer,
  convertInchesToTwip,
  BorderStyle,
} from "docx";
import PDFDocument from "pdfkit";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import fs from "fs";
import path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedResumeSections {
  name: string;
  contact: string;
  summary: string;
  skills: string;
  experience: string;
  projects: string;
  education: string;
  certifications: string;
}

// ─── Template path ────────────────────────────────────────────────────────────

const TEMPLATES_DIR = path.join(process.cwd(), "server", "templates");
export const CUSTOM_TEMPLATE_PATH = path.join(TEMPLATES_DIR, "ats-resume-template.docx");

export function hasCustomTemplate(): boolean {
  return fs.existsSync(CUSTOM_TEMPLATE_PATH);
}

export function saveCustomTemplate(buffer: Buffer): void {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  fs.writeFileSync(CUSTOM_TEMPLATE_PATH, buffer);
}

export function getCustomTemplate(): Buffer {
  return fs.readFileSync(CUSTOM_TEMPLATE_PATH);
}

// ─── Section parsing ──────────────────────────────────────────────────────────

const SECTION_KEYWORD_MAP: Record<string, string[]> = {
  summary: ["summary", "objective", "professional summary", "career summary", "profile", "about me"],
  skills: [
    "skills", "technical skills", "core competencies", "competencies",
    "technologies", "tools & technologies", "tools and technologies",
    "key skills", "areas of expertise",
  ],
  experience: [
    "experience", "work experience", "professional experience",
    "employment", "work history", "employment history", "career history",
  ],
  projects: ["projects", "project experience", "key projects", "notable projects", "personal projects"],
  education: ["education", "academic background", "academic history", "academics", "academic"],
  certifications: [
    "certifications", "certificates", "professional development",
    "training", "licenses", "credentials", "professional certifications",
  ],
};

const CONTACT_PATTERNS = [
  /\b[\w.+%-]+@[\w.-]+\.\w{2,}\b/,
  /\+?[\d][\d\s\-().]{7,}/,
  /linkedin\.com/i,
  /github\.com/i,
  /\|/,
];

export function parseResumeForExport(text: string): ParsedResumeSections {
  const allLines = text.split("\n").map((l) => l.trimEnd());
  const nonEmpty = allLines.filter((l) => l.trim().length > 0);

  let name = "";
  let contactLines: string[] = [];
  let startIdx = 0;

  // First non-empty line = name (if it doesn't look like a section header)
  if (nonEmpty.length > 0) {
    const firstLine = nonEmpty[0].trim();
    const isSection = Object.values(SECTION_KEYWORD_MAP)
      .flat()
      .some((k) => firstLine.toLowerCase().startsWith(k));
    if (!isSection) {
      name = firstLine;
      startIdx = allLines.findIndex((l) => l.trim() === firstLine) + 1;
    }
  }

  // Next few lines that look like contact info (email, phone, linkedin, etc.)
  let lineIdx = startIdx;
  let lookahead = 0;
  while (lookahead < 6 && lineIdx < allLines.length) {
    const line = allLines[lineIdx].trim();
    if (!line) { lineIdx++; continue; }
    const looksContact = CONTACT_PATTERNS.some((p) => p.test(line));
    const isSection = Object.values(SECTION_KEYWORD_MAP)
      .flat()
      .some((k) => line.toLowerCase().startsWith(k));
    if (isSection) break;
    if (looksContact || (line.length < 120 && lookahead < 3)) {
      contactLines.push(line);
      lineIdx++;
      lookahead++;
    } else {
      break;
    }
  }

  // Parse remaining lines into named sections
  const sections: Record<string, string[]> = {
    summary: [], skills: [], experience: [],
    projects: [], education: [], certifications: [],
  };
  let currentSection: string | null = null;

  for (let i = lineIdx; i < allLines.length; i++) {
    const raw = allLines[i];
    const trimmed = raw.trim();
    const normalized = trimmed.toLowerCase().replace(/[:\-_|]/g, "").trim();

    let matched: string | null = null;
    for (const [sectionKey, keywords] of Object.entries(SECTION_KEYWORD_MAP)) {
      if (keywords.some((k) => normalized === k || normalized.startsWith(k + " "))) {
        if (trimmed.length < 60) { matched = sectionKey; break; }
      }
    }

    if (matched) {
      currentSection = matched;
    } else if (currentSection) {
      sections[currentSection].push(raw);
    }
  }

  const clean = (lines: string[]) =>
    lines.join("\n").replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n").trimEnd();

  return {
    name,
    contact: contactLines.join("\n"),
    summary: clean(sections.summary),
    skills: clean(sections.skills),
    experience: clean(sections.experience),
    projects: clean(sections.projects),
    education: clean(sections.education),
    certifications: clean(sections.certifications),
  };
}

// ─── LOCKED FORMATTING CONSTANTS ──────────────────────────────────────────────
//
// These values are fixed per the ATS template spec and must not be changed
// without updating the spec. All measurements are in OOXML units (twips for
// spacing/indents, half-points for font sizes).
//
// 1 inch = 1440 twips | 1 pt = 20 twips | 1 pt = 2 half-points
// ──────────────────────────────────────────────────────────────────────────────

const FONT = "Times New Roman";           // locked font family
const MARGIN_TW = convertInchesToTwip(0.5); // 720 twips — 0.5 inch margins

// Font sizes in half-points (1pt = 2hp)
const NAME_HP    = 28; // 14 pt – name only
const BODY_HP    = 20; // 10 pt – all body text, headings, contact, bullets

// Bullet hanging-indent: bullet dot at margin, wrapped text at +0.15 in
const BULLET_LEFT_TW  = 216; // 0.15 in — indent of subsequent wrapped lines
const BULLET_HANG_TW  = 216; // must equal BULLET_LEFT_TW for proper hanging

// Paragraph spacing (twips — 1 pt = 20 twips)
const SP_BEFORE_SECTION = 100; // ~5pt before each section header
const SP_AFTER_SECTION  = 20;  // ~1pt after section header (border draws the gap)
const SP_BEFORE_TITLE   = 60;  // ~3pt before job-title/company line
const SP_BULLET         = 0;   // no extra gap between bullets
const SP_BODY           = 0;   // no extra gap between body text lines
const SP_AFTER_CONTACT  = 40;  // after contact block

// Line spacing value for OOXML (240 = single = 1× line height)
const LINE_SINGLE = 240;

// ─── Section-order lock: export always emits in this exact order ──────────────
const SECTION_ORDER: Array<{ key: keyof ParsedResumeSections; title: string }> = [
  { key: "summary",        title: "SUMMARY" },
  { key: "skills",         title: "SKILLS" },
  { key: "experience",     title: "EXPERIENCE" },
  { key: "projects",       title: "PROJECTS" },
  { key: "education",      title: "EDUCATION" },
  { key: "certifications", title: "CERTIFICATIONS" },
];

// ─── Helpers: detect line types ───────────────────────────────────────────────

function isBulletLine(line: string): boolean {
  return /^[\u2022\-\*▪▸►◦•]\s/.test(line.trim());
}

/**
 * Returns true for job-title / company / date lines inside Experience/Projects.
 * These get Bold formatting to match ATS convention.
 */
function isRoleHeadingLine(line: string): boolean {
  const t = line.trim();
  if (!t || isBulletLine(t)) return false;
  // Has a year (2019-2025) — very strong signal for role/date line
  if (/\b(20\d\d|19\d\d)\b/.test(t)) return true;
  // Has "Present" or "Current" with a dash — also a date line
  if (/[\-–]\s*(present|current|now)\b/i.test(t)) return true;
  return false;
}

// ─── DOCX section header paragraph ───────────────────────────────────────────

function docxSectionHeader(title: string): Paragraph {
  return new Paragraph({
    spacing: { before: SP_BEFORE_SECTION, after: SP_AFTER_SECTION, line: LINE_SINGLE },
    border: {
      bottom: { color: "000000", space: 1, style: BorderStyle.SINGLE, size: 4 },
    },
    children: [
      new TextRun({
        text: title.toUpperCase(),
        bold: true,
        size: BODY_HP,
        font: FONT,
        color: "000000",
      }),
    ],
  });
}

// ─── DOCX body paragraphs for a section ──────────────────────────────────────

function docxBodyParagraphs(text: string): Paragraph[] {
  if (!text.trim()) return [];
  const paras: Paragraph[] = [];

  for (const raw of text.split("\n")) {
    const line = raw.trim();

    // Blank line → tiny spacer (keeps blank lines between job entries compact)
    if (!line) {
      paras.push(
        new Paragraph({
          spacing: { before: 0, after: 0, line: 120 }, // half-line spacer
          children: [],
        })
      );
      continue;
    }

    if (isBulletLine(line)) {
      // Strip the leading bullet character (any variety) and add the standard • char
      const bulletText = line.replace(/^[\u2022\-\*▪▸►◦•]\s*/, "");
      paras.push(
        new Paragraph({
          // Hanging indent: bullet at margin, text at margin+0.15in, wrapped lines same
          indent: { left: BULLET_LEFT_TW, hanging: BULLET_HANG_TW },
          spacing: { before: SP_BULLET, after: SP_BULLET, line: LINE_SINGLE },
          children: [
            new TextRun({
              text: "\u2022 " + bulletText, // Unicode bullet
              size: BODY_HP,
              font: FONT,
              color: "000000",
            }),
          ],
        })
      );
    } else if (isRoleHeadingLine(line)) {
      // Job title / company / date — bold
      paras.push(
        new Paragraph({
          spacing: { before: SP_BEFORE_TITLE, after: 0, line: LINE_SINGLE },
          children: [
            new TextRun({
              text: line,
              bold: true,
              size: BODY_HP,
              font: FONT,
              color: "000000",
            }),
          ],
        })
      );
    } else {
      // Regular body text (summary paragraph, skill line, education line, etc.)
      paras.push(
        new Paragraph({
          spacing: { before: SP_BODY, after: SP_BODY, line: LINE_SINGLE },
          children: [
            new TextRun({
              text: line,
              size: BODY_HP,
              font: FONT,
              color: "000000",
            }),
          ],
        })
      );
    }
  }

  return paras;
}

// ─── DOCX export (locked ATS layout) ─────────────────────────────────────────

export async function generateResumeDocx(
  sections: ParsedResumeSections,
  resumeName?: string
): Promise<Buffer> {
  const children: Paragraph[] = [];

  // ── Name (14 pt, Bold, centered) ──────────────────────────────────────────
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 20, line: LINE_SINGLE },
      children: [
        new TextRun({
          text: sections.name || resumeName || "Resume",
          bold: true,
          size: NAME_HP,
          font: FONT,
          color: "000000",
        }),
      ],
    })
  );

  // ── Contact line (10 pt, centered, all on one line) ───────────────────────
  if (sections.contact.trim()) {
    const contactLine = sections.contact
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" | ");
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: SP_AFTER_CONTACT, line: LINE_SINGLE },
        children: [
          new TextRun({
            text: contactLine,
            size: BODY_HP,
            font: FONT,
            color: "000000",
          }),
        ],
      })
    );
  }

  // ── Sections in locked order ───────────────────────────────────────────────
  for (const { key, title } of SECTION_ORDER) {
    const content = sections[key];
    if (!content?.trim()) continue;
    children.push(docxSectionHeader(title));
    children.push(...docxBodyParagraphs(content));
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top:    MARGIN_TW,
              right:  MARGIN_TW,
              bottom: MARGIN_TW,
              left:   MARGIN_TW,
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// ─── PDF export (locked ATS layout) ──────────────────────────────────────────
//
// Uses pdfkit's built-in Times-Roman / Times-Bold (identical to Times New Roman
// for ATS readers). Bullets use doc.list() for proper hanging indent.
// ──────────────────────────────────────────────────────────────────────────────

const PDF_MARGIN    = 36;         // 0.5 inch at 72pt/inch
const PDF_FONT_R    = "Times-Roman";
const PDF_FONT_B    = "Times-Bold";
const PDF_NAME_PT   = 14;
const PDF_BODY_PT   = 10;
const PDF_LINE_GAP  = 1.5;       // tight leading between lines
const PDF_BULLET_INDENT = 10;    // pt — text indented from bullet dot

export async function generateResumePdf(
  sections: ParsedResumeSections,
  resumeName?: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: PDF_MARGIN,
      size: "LETTER",
      autoFirstPage: true,
      bufferPages: false,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW       = doc.page.width;                       // 612pt
    const contentW    = pageW - PDF_MARGIN * 2;               // 540pt

    // ── Name ──────────────────────────────────────────────────────────────────
    doc
      .font(PDF_FONT_B)
      .fontSize(PDF_NAME_PT)
      .fillColor("#000000")
      .text(sections.name || resumeName || "Resume", PDF_MARGIN, PDF_MARGIN, {
        width: contentW,
        align: "center",
        lineGap: 0,
      });

    // ── Contact ───────────────────────────────────────────────────────────────
    if (sections.contact.trim()) {
      const contactLine = sections.contact
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join(" | ");
      doc
        .font(PDF_FONT_R)
        .fontSize(PDF_BODY_PT)
        .fillColor("#000000")
        .text(contactLine, PDF_MARGIN, doc.y + 1, {
          width: contentW,
          align: "center",
          lineGap: 0,
        });
    }

    // ── Section renderer ──────────────────────────────────────────────────────
    const drawSectionHeader = (title: string) => {
      const y = doc.y + 5; // small gap before section
      doc
        .font(PDF_FONT_B)
        .fontSize(PDF_BODY_PT)
        .fillColor("#000000")
        .text(title.toUpperCase(), PDF_MARGIN, y, {
          width: contentW,
          lineGap: 0,
        });
      // Underline rule beneath heading
      const lineY = doc.y + 1;
      doc
        .moveTo(PDF_MARGIN, lineY)
        .lineTo(pageW - PDF_MARGIN, lineY)
        .strokeColor("#000000")
        .lineWidth(0.5)
        .stroke();
      doc.y = lineY + 3; // tight gap after rule
    };

    const drawBodyText = (text: string) => {
      if (!text.trim()) return;
      const lines = text.split("\n");
      let bulletBatch: string[] = [];

      const flushBullets = () => {
        if (bulletBatch.length === 0) return;
        doc
          .font(PDF_FONT_R)
          .fontSize(PDF_BODY_PT)
          .fillColor("#000000")
          .list(bulletBatch, PDF_MARGIN, doc.y, {
            width: contentW,
            bulletRadius: 1.8,
            bulletIndent: 0,
            textIndent: PDF_BULLET_INDENT,
            lineGap: PDF_LINE_GAP,
            paragraphGap: 0,
          } as any);
        bulletBatch = [];
      };

      for (const raw of lines) {
        const line = raw.trim();

        if (!line) {
          flushBullets();
          doc.y += 2; // tiny gap for blank lines between job entries
          continue;
        }

        const isBullet = /^[\u2022\-\*▪▸►◦•]\s/.test(line);

        if (isBullet) {
          // Accumulate consecutive bullets for one doc.list() call
          bulletBatch.push(line.replace(/^[\u2022\-\*▪▸►◦•]\s*/, ""));
        } else {
          flushBullets();

          const isTitle = isRoleHeadingLine(line);
          doc
            .font(isTitle ? PDF_FONT_B : PDF_FONT_R)
            .fontSize(PDF_BODY_PT)
            .fillColor("#000000")
            .text(line, PDF_MARGIN, doc.y + (isTitle ? 4 : 0), {
              width: contentW,
              lineGap: PDF_LINE_GAP,
            });
        }
      }

      flushBullets();
    };

    // ── Sections in locked order ──────────────────────────────────────────────
    for (const { key, title } of SECTION_ORDER) {
      const content = sections[key];
      if (!content?.trim()) continue;
      drawSectionHeader(title);
      drawBodyText(content);
    }

    doc.end();
  });
}

// ─── Template-based DOCX (user-uploaded .docx with {{PLACEHOLDER}} tags) ─────
//
// When the user uploads a custom template, docxtemplater fills the placeholders.
// linebreaks:true converts \n in content to <w:br/> (soft line breaks within
// the placeholder's paragraph — preserves the template paragraph's formatting).
// ──────────────────────────────────────────────────────────────────────────────

export function fillDocxTemplate(
  templateBuffer: Buffer,
  sections: ParsedResumeSections
): Buffer {
  const zip = new PizZip(templateBuffer);
  const docx = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
  } as any);

  docx.render({
    NAME: sections.name,
    CONTACT: sections.contact
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" | "),
    SUMMARY:        sections.summary,
    SKILLS:         sections.skills,
    EXPERIENCE:     sections.experience,
    PROJECTS:       sections.projects,
    EDUCATION:      sections.education,
    CERTIFICATIONS: sections.certifications,
  });

  return docx.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}
