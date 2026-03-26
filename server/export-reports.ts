import PDFDocument from "pdfkit";

// ─── Shared PDF helpers ────────────────────────────────────────────────────────

interface PDFOptions {
  title: string;
  subtitle?: string;
}

function buildPdf(
  opts: PDFOptions,
  draw: (doc: InstanceType<typeof PDFDocument>, y: () => number, setY: (v: number) => void) => void
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 48, info: { Title: opts.title } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width - 96; // usable width
    let curY = 48;
    const getY = () => curY;
    const setY = (v: number) => { curY = v; };

    // Header bar
    doc.rect(48, 48, W, 46).fill("#1e293b");
    doc.fillColor("#ffffff").fontSize(15).font("Helvetica-Bold")
      .text(opts.title, 60, 57, { width: W - 120 });
    doc.fontSize(9).font("Helvetica").fillColor("#94a3b8")
      .text(`Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, 60, 76, { width: W - 120 });
    if (opts.subtitle) {
      doc.fillColor("#cbd5e1").text(opts.subtitle, W - 60, 60, { align: "right", width: 80 });
    }
    curY = 108;

    draw(doc, getY, setY);

    // Footer
    doc.fontSize(8).fillColor("#94a3b8").font("Helvetica")
      .text("Job Copilot — Exported Report", 48, doc.page.height - 36, { width: W, align: "center" });

    doc.end();
  });
}

function sectionHeader(doc: InstanceType<typeof PDFDocument>, title: string, y: number, W: number): number {
  doc.rect(48, y, W, 22).fill("#f1f5f9");
  doc.fillColor("#1e293b").fontSize(10).font("Helvetica-Bold")
    .text(title, 54, y + 6, { width: W });
  return y + 30;
}

function kpiRow(doc: InstanceType<typeof PDFDocument>, items: { label: string; value: string }[], y: number, W: number): number {
  const colW = W / items.length;
  items.forEach((item, i) => {
    const x = 48 + i * colW;
    doc.rect(x + 2, y, colW - 4, 44).fill("#f8fafc").stroke("#e2e8f0");
    doc.fillColor("#64748b").fontSize(8).font("Helvetica").text(item.label, x + 8, y + 6, { width: colW - 16 });
    doc.fillColor("#1e293b").fontSize(16).font("Helvetica-Bold").text(item.value, x + 8, y + 16, { width: colW - 16 });
  });
  return y + 52;
}

function tableHeader(doc: InstanceType<typeof PDFDocument>, cols: { label: string; width: number }[], y: number, startX = 48): number {
  doc.rect(startX, y, cols.reduce((s, c) => s + c.width, 0), 18).fill("#e2e8f0");
  let x = startX;
  cols.forEach(col => {
    doc.fillColor("#475569").fontSize(8).font("Helvetica-Bold").text(col.label, x + 4, y + 5, { width: col.width - 8 });
    x += col.width;
  });
  return y + 18;
}

function tableRow(doc: InstanceType<typeof PDFDocument>, cols: { width: number }[], values: string[], y: number, even: boolean, startX = 48): number {
  const rowH = 16;
  if (even) doc.rect(startX, y, cols.reduce((s, c) => s + c.width, 0), rowH).fill("#f8fafc");
  let x = startX;
  cols.forEach((col, i) => {
    doc.fillColor("#334155").fontSize(8).font("Helvetica").text(values[i] ?? "", x + 4, y + 4, { width: col.width - 8, ellipsis: true });
    x += col.width;
  });
  return y + rowH;
}

function ensurePage(doc: InstanceType<typeof PDFDocument>, y: number, needed = 60): number {
  if (y + needed > doc.page.height - 60) {
    doc.addPage();
    return 48;
  }
  return y;
}

// ─── 1. Applications CSV ───────────────────────────────────────────────────────

export function buildApplicationsCsv(jobs: any[]): string {
  const headers = [
    "Title", "Company", "Source", "Location", "Work Mode", "Date Posted",
    "Date Applied", "Status", "Priority", "Fit Label", "Role Classification",
    "ATS Score at Apply", "Interview Date", "Interview Round", "Interview Result",
    "Recruiter Name", "Recruiter Email", "Recruiter Contact Date",
    "Offer Salary", "Offer Date", "Offer Decision",
    "Decision Date", "Salary Min", "Salary Max",
    "Follow-Up Date", "Apply Link", "Notes",
  ];

  const esc = (v: any): string => {
    const s = v == null ? "" : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const rows = jobs.map(j => [
    j.title, j.company, j.source, j.location, j.workMode, j.datePosted,
    j.dateApplied, j.status, j.priority, j.fitLabel, j.roleClassification,
    j.atsScoreAtApply ?? "", j.interviewDate, j.interviewRound, j.interviewResult,
    j.recruiterName, j.recruiterEmail, j.recruiterContactDate ?? "",
    j.offerSalary, j.offerDate, j.offerDecision,
    j.decisionDate ?? "", j.salaryMin ?? "", j.salaryMax ?? "",
    j.followUpDate, j.applyLink, j.notes,
  ].map(esc).join(","));

  return [headers.join(","), ...rows].join("\n");
}

// ─── 2. Analytics Summary PDF ──────────────────────────────────────────────────

export async function buildAnalyticsSummaryPdf(data: {
  totalJobs: number;
  totalApplications: number;
  totalInterviews: number;
  totalOffers: number;
  conversionRate: number;
  avgAtsScoreApplied: number;
  avgDaysAppliedToInterview: number | null;
  avgDaysAppliedToOffer: number | null;
  avgTotalHiringTimeline: number | null;
  pipelineFunnel: { stage: string; count: number; conversionFromPrev: number }[];
  topCompanies: { company: string; count: number }[];
  applicationsByRoleType: { role: string; count: number }[];
  sourceAnalytics: { source: string; applied: number; interviews: number; offers: number; interviewRate: number }[];
  weeklyActivity?: { week: string; applications: number; interviews: number }[];
}): Promise<Buffer> {
  return buildPdf({ title: "Analytics Summary Report", subtitle: "Job Copilot" }, (doc, getY, setY) => {
    const W = doc.page.width - 96;
    let y = getY();

    // KPIs
    y = sectionHeader(doc, "Key Performance Indicators", y, W);
    y = kpiRow(doc, [
      { label: "Total Jobs", value: String(data.totalJobs) },
      { label: "Applications", value: String(data.totalApplications) },
      { label: "Interviews", value: String(data.totalInterviews) },
      { label: "Offers", value: String(data.totalOffers) },
    ], y, W);
    y += 8;
    y = kpiRow(doc, [
      { label: "Conversion Rate", value: `${data.conversionRate}%` },
      { label: "Avg ATS Score", value: data.avgAtsScoreApplied > 0 ? `${data.avgAtsScoreApplied}%` : "—" },
      { label: "Days to Interview", value: data.avgDaysAppliedToInterview != null ? `${data.avgDaysAppliedToInterview}d` : "—" },
      { label: "Days to Offer", value: data.avgDaysAppliedToOffer != null ? `${data.avgDaysAppliedToOffer}d` : "—" },
    ], y, W);
    y += 16;

    // Pipeline Funnel
    y = ensurePage(doc, y, 120);
    y = sectionHeader(doc, "Application Pipeline", y, W);
    const fCols = [{ width: 200 }, { width: 80 }, { width: 80 }, { width: 120 }];
    y = tableHeader(doc, [
      { label: "Stage", width: 200 }, { label: "Count", width: 80 },
      { label: "Conversion %", width: 80 }, { label: "From Previous", width: 120 },
    ], y);
    data.pipelineFunnel.forEach((row, i) => {
      y = ensurePage(doc, y);
      y = tableRow(doc, fCols, [
        row.stage, String(row.count),
        row.stage !== "Discovered" ? `${row.conversionFromPrev}%` : "—",
        "",
      ], y, i % 2 === 0);
    });
    y += 16;

    // Sources
    if (data.sourceAnalytics.length > 0) {
      y = ensurePage(doc, y, 80);
      y = sectionHeader(doc, "Source Performance", y, W);
      const sCols = [{ width: 160 }, { width: 80 }, { width: 80 }, { width: 80 }, { width: 80 }];
      y = tableHeader(doc, [
        { label: "Source", width: 160 }, { label: "Applied", width: 80 },
        { label: "Interviews", width: 80 }, { label: "Offers", width: 80 },
        { label: "Interview Rate", width: 80 },
      ], y);
      data.sourceAnalytics.slice(0, 10).forEach((row, i) => {
        y = ensurePage(doc, y);
        y = tableRow(doc, sCols, [row.source, String(row.applied), String(row.interviews), String(row.offers), `${row.interviewRate}%`], y, i % 2 === 0);
      });
      y += 16;
    }

    // Role type breakdown
    if (data.applicationsByRoleType.length > 0) {
      y = ensurePage(doc, y, 80);
      y = sectionHeader(doc, "Applications by Role Type", y, W);
      const rCols = [{ width: 300 }, { width: 100 }];
      y = tableHeader(doc, [{ label: "Role", width: 300 }, { label: "Count", width: 100 }], y);
      data.applicationsByRoleType.forEach((row, i) => {
        y = ensurePage(doc, y);
        y = tableRow(doc, rCols, [row.role, String(row.count)], y, i % 2 === 0);
      });
      y += 16;
    }

    // Top Companies
    if (data.topCompanies.length > 0) {
      y = ensurePage(doc, y, 80);
      y = sectionHeader(doc, "Top Companies Applied", y, W);
      const cCols = [{ width: 340 }, { width: 100 }];
      y = tableHeader(doc, [{ label: "Company", width: 340 }, { label: "Applications", width: 100 }], y);
      data.topCompanies.slice(0, 15).forEach((row, i) => {
        y = ensurePage(doc, y);
        y = tableRow(doc, cCols, [row.company, String(row.count)], y, i % 2 === 0);
      });
    }

    setY(y);
  });
}

// ─── 3. Resume Performance PDF ─────────────────────────────────────────────────

export async function buildResumePerformancePdf(data: {
  versions: {
    version: string; applied: number; interviews: number; offers: number;
    interviewRate: number; offerRate: number; avgAts: number;
  }[];
  bestVersion: { version: string; interviewRate: number } | null;
  avgAtsBefore: number;
  avgAtsAfter: number;
  totalVersions: number;
}): Promise<Buffer> {
  return buildPdf({ title: "Resume Performance Report", subtitle: "Job Copilot" }, (doc, getY, setY) => {
    const W = doc.page.width - 96;
    let y = getY();

    // Summary KPIs
    y = sectionHeader(doc, "Resume Vault Summary", y, W);
    y = kpiRow(doc, [
      { label: "Total Versions", value: String(data.totalVersions) },
      { label: "Best Version", value: data.bestVersion?.version ?? "—" },
      { label: "Avg ATS Before", value: data.avgAtsBefore > 0 ? `${Math.round(data.avgAtsBefore)}%` : "—" },
      { label: "Avg ATS After", value: data.avgAtsAfter > 0 ? `${Math.round(data.avgAtsAfter)}%` : "—" },
    ], y, W);
    y += 16;

    // Version performance table
    y = ensurePage(doc, y, 80);
    y = sectionHeader(doc, "Version Performance Breakdown", y, W);
    const vCols = [
      { width: 160 }, { width: 64 }, { width: 64 }, { width: 64 },
      { width: 74 }, { width: 74 },
    ];
    y = tableHeader(doc, [
      { label: "Resume Version", width: 160 }, { label: "Applied", width: 64 },
      { label: "Interviews", width: 64 }, { label: "Offers", width: 64 },
      { label: "Interview Rate", width: 74 }, { label: "Offer Rate", width: 74 },
    ], y);
    if (data.versions.length === 0) {
      doc.fillColor("#64748b").fontSize(9).font("Helvetica")
        .text("No resume versions with application data yet.", 54, y + 6);
      y += 24;
    } else {
      data.versions.forEach((v, i) => {
        y = ensurePage(doc, y);
        y = tableRow(doc, vCols, [
          v.version, String(v.applied), String(v.interviews), String(v.offers),
          `${v.interviewRate}%`, `${v.offerRate}%`,
        ], y, i % 2 === 0);
      });
    }
    y += 16;

    // ATS improvement note
    if (data.avgAtsBefore > 0 && data.avgAtsAfter > 0) {
      const delta = Math.round(data.avgAtsAfter - data.avgAtsBefore);
      y = ensurePage(doc, y, 60);
      y = sectionHeader(doc, "ATS Score Improvement", y, W);
      doc.fillColor("#334155").fontSize(10).font("Helvetica")
        .text(
          `Average ATS score improved from ${Math.round(data.avgAtsBefore)}% to ${Math.round(data.avgAtsAfter)}% ` +
          `(${delta >= 0 ? "+" : ""}${delta} points) after resume optimization.`,
          54, y + 6, { width: W - 12 }
        );
      y += 36;
    }

    setY(y);
  });
}

// ─── 4. Job Search Activity Report PDF ────────────────────────────────────────

export async function buildJobActivityPdf(data: {
  score: number;
  grade: string;
  weeklyActivity: { week: string; applications: number; interviews: number; rejections: number; networkingContacts: number; followUps: number }[];
  offersPerMonth: { month: string; count: number }[];
  companyAnalytics: { company: string; applied: number; interviews: number; offers: number; interviewRate: number }[];
  totalApplications: number;
  totalInterviews: number;
  totalOffers: number;
  conversionRate: number;
}): Promise<Buffer> {
  return buildPdf({ title: "Job Search Activity Report", subtitle: "Job Copilot" }, (doc, getY, setY) => {
    const W = doc.page.width - 96;
    let y = getY();

    // Job Search Score highlight
    y = sectionHeader(doc, "Job Search Score", y, W);
    const scoreColor = data.grade === "Excellent" ? "#10b981" : data.grade === "Good" ? "#3b82f6" : data.grade === "Fair" ? "#f59e0b" : "#ef4444";
    doc.rect(48, y, W, 52).fill("#f8fafc").stroke("#e2e8f0");
    doc.fillColor(scoreColor).fontSize(32).font("Helvetica-Bold").text(String(data.score), 60, y + 8);
    doc.fillColor("#1e293b").fontSize(14).font("Helvetica-Bold").text(data.grade, 110, y + 18);
    doc.fillColor("#64748b").fontSize(9).font("Helvetica").text("out of 100 · based on weekly activity", 110, y + 36);
    y += 60;

    // Overall KPIs
    y = kpiRow(doc, [
      { label: "Total Applications", value: String(data.totalApplications) },
      { label: "Interviews", value: String(data.totalInterviews) },
      { label: "Offers", value: String(data.totalOffers) },
      { label: "Conversion Rate", value: `${data.conversionRate}%` },
    ], y, W);
    y += 16;

    // Weekly Activity table (last 8 weeks)
    const recentWeeks = data.weeklyActivity.slice(-8);
    if (recentWeeks.length > 0) {
      y = ensurePage(doc, y, 100);
      y = sectionHeader(doc, "Weekly Activity — Last 8 Weeks", y, W);
      const wCols = [{ width: 80 }, { width: 80 }, { width: 74 }, { width: 74 }, { width: 80 }, { width: 80 }];
      y = tableHeader(doc, [
        { label: "Week", width: 80 }, { label: "Applications", width: 80 },
        { label: "Interviews", width: 74 }, { label: "Rejections", width: 74 },
        { label: "Networking", width: 80 }, { label: "Follow-Ups", width: 80 },
      ], y);
      [...recentWeeks].reverse().forEach((w, i) => {
        y = ensurePage(doc, y);
        y = tableRow(doc, wCols, [
          w.week, String(w.applications), String(w.interviews),
          String(w.rejections), String(w.networkingContacts), String(w.followUps),
        ], y, i % 2 === 0);
      });
      y += 16;
    }

    // Offers per month
    const monthsWithOffers = data.offersPerMonth.filter(o => o.count > 0);
    if (monthsWithOffers.length > 0) {
      y = ensurePage(doc, y, 80);
      y = sectionHeader(doc, "Offers per Month", y, W);
      const oCols = [{ width: 200 }, { width: 100 }];
      y = tableHeader(doc, [{ label: "Month", width: 200 }, { label: "Offers", width: 100 }], y);
      monthsWithOffers.forEach((o, i) => {
        y = ensurePage(doc, y);
        y = tableRow(doc, oCols, [o.month, String(o.count)], y, i % 2 === 0);
      });
      y += 16;
    }

    // Company performance
    if (data.companyAnalytics.length > 0) {
      y = ensurePage(doc, y, 80);
      y = sectionHeader(doc, "Company Performance (Top 20)", y, W);
      const cCols = [{ width: 180 }, { width: 70 }, { width: 70 }, { width: 70 }, { width: 80 }];
      y = tableHeader(doc, [
        { label: "Company", width: 180 }, { label: "Applied", width: 70 },
        { label: "Interviews", width: 70 }, { label: "Offers", width: 70 },
        { label: "Interview Rate", width: 80 },
      ], y);
      data.companyAnalytics.slice(0, 20).forEach((c, i) => {
        y = ensurePage(doc, y);
        y = tableRow(doc, cCols, [c.company, String(c.applied), String(c.interviews), String(c.offers), `${c.interviewRate}%`], y, i % 2 === 0);
      });
    }

    setY(y);
  });
}
