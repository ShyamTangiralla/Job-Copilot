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
  skills: ["skills", "technical skills", "core competencies", "competencies", "technologies", "tools & technologies", "tools and technologies"],
  experience: ["experience", "work experience", "professional experience", "employment", "work history", "employment history"],
  projects: ["projects", "project experience", "key projects", "notable projects", "personal projects"],
  education: ["education", "academic background", "academic history", "academics"],
  certifications: ["certifications", "certificates", "professional development", "training", "licenses", "credentials"],
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

  // First non-empty line = name (if it doesn't match a section header)
  let startIdx = 0;
  if (nonEmpty.length > 0) {
    const firstLine = nonEmpty[0].trim();
    const isSection = Object.values(SECTION_KEYWORD_MAP)
      .flat()
      .some((k) => firstLine.toLowerCase().startsWith(k));
    if (!isSection) {
      name = firstLine;
      startIdx = allLines.indexOf(firstLine) + 1;
    }
  }

  // Next few lines (up to 5) that look like contact info
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

  // Parse the rest into sections
  const sections: Record<string, string[]> = {
    summary: [],
    skills: [],
    experience: [],
    projects: [],
    education: [],
    certifications: [],
  };

  let currentSection: string | null = null;

  for (let i = lineIdx; i < allLines.length; i++) {
    const raw = allLines[i];
    const trimmed = raw.trim();
    const normalized = trimmed.toLowerCase().replace(/[:\-_|]/g, "").trim();

    let matched: string | null = null;
    for (const [sectionKey, keywords] of Object.entries(SECTION_KEYWORD_MAP)) {
      if (keywords.some((k) => normalized === k || normalized.startsWith(k + " "))) {
        if (trimmed.length < 60) {
          matched = sectionKey;
          break;
        }
      }
    }

    if (matched) {
      currentSection = matched;
    } else if (currentSection) {
      sections[currentSection].push(raw);
    }
  }

  const clean = (lines: string[]) =>
    lines
      .join("\n")
      .replace(/^\n+/, "")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd();

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

// ─── DOCX Generation ──────────────────────────────────────────────────────────

const FONT = "Calibri";
const NAME_SIZE = 32;      // 16pt in half-points
const CONTACT_SIZE = 20;   // 10pt
const BODY_SIZE = 21;      // 10.5pt
const HEADER_SIZE = 22;    // 11pt

function sectionHeader(title: string): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    border: {
      bottom: { color: "222222", space: 1, style: BorderStyle.SINGLE, size: 4 },
    },
    children: [
      new TextRun({
        text: title.toUpperCase(),
        bold: true,
        size: HEADER_SIZE,
        font: FONT,
        color: "111111",
      }),
    ],
  });
}

function bodyLines(text: string): Paragraph[] {
  if (!text.trim()) return [];
  const lines = text.split("\n");
  const paras: Paragraph[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      paras.push(new Paragraph({ spacing: { before: 60 }, children: [] }));
      continue;
    }

    const isBullet = /^[\-•▪▸►◦*]\s/.test(trimmed);
    const bulletText = isBullet ? trimmed.replace(/^[\-•▪▸►◦*]\s*/, "") : trimmed;

    // Heuristic: a line in ALL CAPS or with a strong date pattern is likely a job title/company row
    const isHeadingLike =
      !isBullet &&
      ((/^[A-Z][A-Z0-9\s,\-&.'()]{5,}$/.test(trimmed) && trimmed.length < 80) ||
        /\b(20\d\d|19\d\d)\b.*[\-–]/.test(trimmed) ||
        /[\-–]\s*(present|current|now)/i.test(trimmed));

    if (isBullet) {
      paras.push(
        new Paragraph({
          indent: { left: convertInchesToTwip(0.15), hanging: convertInchesToTwip(0.15) },
          spacing: { before: 30 },
          children: [
            new TextRun({ text: "• " + bulletText, size: BODY_SIZE, font: FONT }),
          ],
        })
      );
    } else if (isHeadingLike) {
      paras.push(
        new Paragraph({
          spacing: { before: 120, after: 20 },
          children: [
            new TextRun({ text: trimmed, size: BODY_SIZE, font: FONT, bold: true }),
          ],
        })
      );
    } else {
      paras.push(
        new Paragraph({
          spacing: { before: 30 },
          children: [new TextRun({ text: trimmed, size: BODY_SIZE, font: FONT })],
        })
      );
    }
  }
  return paras;
}

export async function generateResumeDocx(
  sections: ParsedResumeSections,
  resumeName?: string
): Promise<Buffer> {
  const children: Paragraph[] = [];

  // Name
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 60 },
      children: [
        new TextRun({
          text: sections.name || resumeName || "Resume",
          bold: true,
          size: NAME_SIZE,
          font: FONT,
          color: "111111",
        }),
      ],
    })
  );

  // Contact
  if (sections.contact) {
    const contactLine = sections.contact.replace(/\n/g, " | ");
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 120 },
        children: [
          new TextRun({
            text: contactLine,
            size: CONTACT_SIZE,
            font: FONT,
            color: "333333",
          }),
        ],
      })
    );
  }

  const addSection = (title: string, content: string) => {
    if (!content.trim()) return;
    children.push(sectionHeader(title));
    children.push(...bodyLines(content));
  };

  addSection("Summary", sections.summary);
  addSection("Skills", sections.skills);
  addSection("Experience", sections.experience);
  addSection("Projects", sections.projects);
  addSection("Education", sections.education);
  addSection("Certifications", sections.certifications);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.75),
              right: convertInchesToTwip(0.75),
              bottom: convertInchesToTwip(0.75),
              left: convertInchesToTwip(0.75),
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// ─── PDF Generation ───────────────────────────────────────────────────────────

export async function generateResumePdf(
  sections: ParsedResumeSections,
  resumeName?: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 54, size: "LETTER", autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const MARGIN = 54;
    const PAGE_WIDTH = doc.page.width;
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

    // ── Name ──
    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .fillColor("#111111")
      .text(sections.name || resumeName || "Resume", MARGIN, MARGIN, {
        width: CONTENT_WIDTH,
        align: "center",
      });

    // ── Contact ──
    if (sections.contact) {
      const contactLine = sections.contact.replace(/\n/g, " | ");
      doc
        .font("Helvetica")
        .fontSize(9.5)
        .fillColor("#444444")
        .text(contactLine, MARGIN, doc.y + 2, { width: CONTENT_WIDTH, align: "center" });
    }

    const addSectionHeader = (title: string) => {
      const y = doc.y + 10;
      doc
        .font("Helvetica-Bold")
        .fontSize(10.5)
        .fillColor("#111111")
        .text(title.toUpperCase(), MARGIN, y, { width: CONTENT_WIDTH });
      const lineY = doc.y + 1;
      doc.moveTo(MARGIN, lineY).lineTo(PAGE_WIDTH - MARGIN, lineY).strokeColor("#222222").lineWidth(0.75).stroke();
      doc.y = lineY + 4;
    };

    const addBodyText = (text: string) => {
      if (!text.trim()) return;
      const lines = text.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          doc.y += 4;
          continue;
        }
        const isBullet = /^[\-•▪▸►◦*]\s/.test(trimmed);
        const bulletText = isBullet ? trimmed.replace(/^[\-•▪▸►◦*]\s*/, "") : trimmed;

        const isHeadingLike =
          !isBullet &&
          ((/^[A-Z][A-Z0-9\s,\-&.'()]{5,}$/.test(trimmed) && trimmed.length < 80) ||
            /\b(20\d\d|19\d\d)\b.*[\-–]/.test(trimmed) ||
            /[\-–]\s*(present|current|now)/i.test(trimmed));

        if (isBullet) {
          doc
            .font("Helvetica")
            .fontSize(10)
            .fillColor("#111111")
            .text("• " + bulletText, MARGIN + 10, doc.y, {
              width: CONTENT_WIDTH - 10,
              indent: 0,
            });
        } else if (isHeadingLike) {
          doc
            .font("Helvetica-Bold")
            .fontSize(10)
            .fillColor("#111111")
            .text(trimmed, MARGIN, doc.y + 5, { width: CONTENT_WIDTH });
        } else {
          doc
            .font("Helvetica")
            .fontSize(10)
            .fillColor("#111111")
            .text(trimmed, MARGIN, doc.y, { width: CONTENT_WIDTH });
        }
      }
      doc.y += 4;
    };

    const addSection = (title: string, content: string) => {
      if (!content.trim()) return;
      doc.y += 6;
      addSectionHeader(title);
      addBodyText(content);
    };

    addSection("Summary", sections.summary);
    addSection("Skills", sections.skills);
    addSection("Experience", sections.experience);
    addSection("Projects", sections.projects);
    addSection("Education", sections.education);
    addSection("Certifications", sections.certifications);

    doc.end();
  });
}

// ─── Template-based DOCX (user-uploaded template with {{PLACEHOLDER}} tags) ──

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
    CONTACT: sections.contact.replace(/\n/g, " | "),
    SUMMARY: sections.summary,
    SKILLS: sections.skills,
    EXPERIENCE: sections.experience,
    PROJECTS: sections.projects,
    EDUCATION: sections.education,
    CERTIFICATIONS: sections.certifications,
  });

  return docx.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}
