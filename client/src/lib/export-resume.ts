function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-]/g, "_").replace(/_+/g, "_").substring(0, 60);
}

function buildFilename(resumeName: string, ext: string): string {
  const date = new Date().toISOString().split("T")[0];
  return `Resume_${sanitizeFilename(resumeName)}_${date}.${ext}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportTxt(plainText: string, resumeName: string) {
  const blob = new Blob([plainText], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, buildFilename(resumeName, "txt"));
}

export function exportDoc(plainText: string, resumeName: string) {
  const lines = plainText.split("\n");
  const paragraphs = lines
    .map((line) => {
      const escaped = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      if (escaped.trim() === "") return "<p>&nbsp;</p>";
      return `<p>${escaped}</p>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>${resumeName}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>90</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; margin: 1in; line-height: 1.4; }
    p { margin: 0 0 4pt 0; }
  </style>
</head>
<body>${paragraphs}</body>
</html>`;

  const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
  triggerDownload(blob, buildFilename(resumeName, "doc"));
}

export function exportPdf(plainText: string, resumeName: string) {
  const lines = plainText.split("\n");
  const paragraphs = lines
    .map((line) => {
      const escaped = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      if (escaped.trim() === "") return "<p style='margin:0;height:8pt'>&nbsp;</p>";
      return `<p style='margin:0 0 2pt 0'>${escaped}</p>`;
    })
    .join("\n");

  const filename = buildFilename(resumeName, "pdf");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${filename}</title>
  <style>
    @page { margin: 0.75in; size: letter; }
    * { box-sizing: border-box; }
    body { font-family: Calibri, Arial, sans-serif; font-size: 10.5pt; line-height: 1.35; color: #111; }
    p { margin: 0; padding: 0; }
  </style>
</head>
<body>${paragraphs}</body>
</html>`;

  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) {
    alert("Please allow pop-ups to export PDF.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 400);
}
