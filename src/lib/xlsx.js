// Tiny dependency-free .xlsx writer: a workbook of plain sheets, no styling beyond a bold first row.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const esc = (value) =>
  String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const colName = (index) => {
  let name = "";
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
};

const sheetXml = (rows) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
  .map((row, r) => {
    const cells = row
      .map((cell, c) => {
        if (cell === null || cell === undefined || cell === "") return "";
        const ref = `${colName(c)}${r + 1}`;
        const style = r === 0 ? ' s="1"' : "";
        if (typeof cell === "number" && Number.isFinite(cell)) {
          return `<c r="${ref}"${style}><v>${cell}</v></c>`;
        }
        return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(cell)}</t></is></c>`;
      })
      .join("");
    return `<row r="${r + 1}">${cells}</row>`;
  })
  .join("")}</sheetData></worksheet>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf xfId="0"/><xf xfId="0" fontId="1" applyFont="1"/></cellXfs></styleSheet>`;

const zip = (files) => {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  files.forEach(({ name, data }) => {
    const nameBytes = encoder.encode(name);
    const bytes = encoder.encode(data);
    const crc = crc32(bytes);

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, bytes.length, true);
    localView.setUint32(22, bytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    chunks.push(local, bytes);

    const entry = new Uint8Array(46 + nameBytes.length);
    const entryView = new DataView(entry.buffer);
    entryView.setUint32(0, 0x02014b50, true);
    entryView.setUint16(4, 20, true);
    entryView.setUint16(6, 20, true);
    entryView.setUint32(16, crc, true);
    entryView.setUint32(20, bytes.length, true);
    entryView.setUint32(24, bytes.length, true);
    entryView.setUint16(28, nameBytes.length, true);
    entryView.setUint32(42, offset, true);
    entry.set(nameBytes, 46);
    central.push(entry);

    offset += local.length + bytes.length;
  });

  const centralSize = central.reduce((sum, entry) => sum + entry.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  return new Blob([...chunks, ...central, end], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
};

const workbookParts = (sheets) => {
  const sheetFiles = sheets.map((sheet, i) => ({
    name: `xl/worksheets/sheet${i + 1}.xml`,
    data: sheetXml(sheet.rows),
  }));

  const sheetEntries = sheets
    .map((sheet, i) => `<sheet name="${esc(sheet.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");

  const sheetRels = sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    )
    .join("");

  const contentTypes = sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join("");

  return [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${contentTypes}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEntries}</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: "xl/styles.xml", data: STYLES },
    ...sheetFiles,
  ];
};

export function downloadWorkbook(filename, sheets) {
  const blob = zip(workbookParts(sheets));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const NUM = (value) => Number(value) || 0;

export function researchWorkbook(researchId, research, posts) {
  const analysisRows = [
    ["Rank", "Platform", "Title", "Author", "Community", "Likes", "Comments", "Views", "Trend", "Sentiment", "Score", "Why", "Posted", "URL"],
    ...posts.map((post) => [
      NUM(post.rank),
      post.platform || "",
      post.title || "",
      post.author || "",
      post.community || "",
      NUM(post.engagement),
      NUM(post.comments),
      NUM(post.views),
      post.trend || "",
      post.sentiment || "",
      NUM(post.sentiment_score),
      post.sentiment_reason || "",
      post.published_at ? String(post.published_at).slice(0, 10) : "",
      post.url || "",
    ]),
  ];

  const topics = research.trending_topics?.length
    ? research.trending_topics
    : (research.themes || []).map((topic) => ({ topic }));

  const reportRows = [
    ["Signal Desk — analysis and recommendations"],
    ["Brand", research.brand || ""],
    ["Category", research.category || ""],
    ["Competitors", research.competitors || ""],
    ["Decision supported", research.goal || ""],
    ["Platforms", (research.platforms || []).join(", ")],
    ["Posts read", NUM(research.total_scraped)],
    ["Posts ranked", posts.length],
    [],
    ["Sentiment", "Count"],
    ["Positive", NUM(research.positive_count)],
    ["Neutral", NUM(research.neutral_count)],
    ["Negative", NUM(research.negative_count)],
    ["Average score", NUM(research.avg_sentiment)],
    [],
    ["What the conversation says"],
    [research.summary || ""],
    [],
    ["Recommended move"],
    [research.recommendation || ""],
    [],
    ["Top topics", "Mentions", "Sentiment"],
    ...topics.map((topic) => [topic.topic || "", NUM(topic.mentions), topic.sentiment || ""]),
    ...(research.warnings?.length ? [[], ["Warnings"], ...research.warnings.map((w) => [w])] : []),
  ];

  const name = `${research.brand || "signal-desk"} social listening ${(research.created_date || "").slice(0, 10)}`
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    filename: `${name || `signal-desk-${researchId}`}.xlsx`,
    sheets: [
      { name: "Analysis table", rows: analysisRows },
      { name: "Recommendations", rows: reportRows },
    ],
  };
}