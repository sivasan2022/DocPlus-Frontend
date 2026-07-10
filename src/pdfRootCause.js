import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const ROOT_CAUSE_HEADING_RE = /\broot\s+cause\s+analysis\b/i;
const ROOT_CAUSE_ANY_RE = /\broot\s+cause\b/i;
const HYPOTHESIS_ID_RE = /\bHYP[-\s]?\d{1,4}\b/i;
const NEXT_SECTION_RE = /^\s*\d{1,2}\.\s+(?!Root\s+Cause\s+Analysis\b)[A-Z][A-Za-z0-9 /&(),-]{2,}$/i;

function normalizeSpaces(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function removeSquareBracketContent(value) {
  return normalizeSpaces(
    String(value || "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\s+([,.;:])/g, "$1"),
  );
}

function normalizePdfText(value) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function itemToPlainObject(item, pageNumber) {
  const transform = item.transform || [1, 0, 0, 1, 0, 0];
  const x = Number(transform[4] || 0);
  const y = Number(transform[5] || 0);
  const width = Number(item.width || 0);
  const height = Math.abs(Number(transform[3] || item.height || 0));

  return {
    pageNumber,
    str: String(item.str || ""),
    x,
    y,
    width,
    height,
    endX: x + width,
    centerX: x + width / 2,
  };
}

function joinItems(items) {
  return normalizeSpaces(
    [...items]
      .sort((a, b) => a.x - b.x)
      .map((item) => item.str)
      .join(" "),
  );
}

function groupItemsIntoLines(items) {
  const sorted = [...items]
    .filter((item) => normalizeSpaces(item.str))
    .sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      if (Math.abs(b.y - a.y) > 2.8) return b.y - a.y;
      return a.x - b.x;
    });

  const lines = [];
  const lineTolerance = 2.8;

  for (const item of sorted) {
    const last = lines[lines.length - 1];

    if (!last || last.pageNumber !== item.pageNumber || Math.abs(last.y - item.y) > lineTolerance) {
      lines.push({
        pageNumber: item.pageNumber,
        y: item.y,
        x: item.x,
        items: [item],
        text: normalizeSpaces(item.str),
      });
    } else {
      last.items.push(item);
      last.y = (last.y * (last.items.length - 1) + item.y) / last.items.length;
      last.x = Math.min(last.x, item.x);
      last.text = joinItems(last.items);
    }
  }

  return lines.map((line) => ({
    ...line,
    items: [...line.items].sort((a, b) => a.x - b.x),
    text: joinItems(line.items),
  }));
}

function findLineIndex(lines, predicate, startIndex = 0) {
  for (let index = Math.max(0, startIndex); index < lines.length; index += 1) {
    if (predicate(lines[index], index)) return index;
  }
  return -1;
}

function findHeaderLineIndex(lines) {
  const headingIndex = findLineIndex(lines, (line) => ROOT_CAUSE_HEADING_RE.test(line.text));
  const searchFrom = headingIndex >= 0 ? headingIndex + 1 : 0;

  const headerIndex = findLineIndex(
    lines,
    (line) => {
      const text = line.text.toLowerCase();
      return (
        text.includes("hypothesis") &&
        (text.includes("probability") || text.includes("affected") || text.includes("why"))
      );
    },
    searchFrom,
  );

  if (headerIndex >= 0) return headerIndex;

  return findLineIndex(lines, (line) => {
    const text = line.text.toLowerCase();
    return text.includes("id") && text.includes("hypothesis") && text.includes("probability");
  });
}

function findHeaderStartX(headerLine, words) {
  const lowerWords = words.map((word) => word.toLowerCase());
  const item = headerLine.items.find((candidate) => {
    const text = normalizeSpaces(candidate.str).toLowerCase();
    return lowerWords.some((word) => text === word || text.includes(word));
  });

  return Number.isFinite(item?.x) ? item.x : undefined;
}

function buildColumns(headerLine, followingLines) {
  const relevantLines = [headerLine, ...followingLines.slice(0, 20)];
  const allItems = relevantLines.flatMap((line) => line.items);
  const minX = Math.min(...allItems.map((item) => item.x));
  const maxX = Math.max(...allItems.map((item) => item.endX));
  const tableWidth = Math.max(1, maxX - minX);

  const idX = findHeaderStartX(headerLine, ["id"]) ?? minX;
  const hypothesisX = findHeaderStartX(headerLine, ["hypothesis"]) ?? minX + tableWidth * 0.1;
  const probabilityX = findHeaderStartX(headerLine, ["probability"]) ?? minX + tableWidth * 0.34;
  const affectedX = findHeaderStartX(headerLine, ["affected", "area"]) ?? minX + tableWidth * 0.48;
  const whyX = findHeaderStartX(headerLine, ["key", "why", "chain"]) ?? minX + tableWidth * 0.66;

  const starts = [idX, hypothesisX, probabilityX, affectedX, whyX]
    .map((value) => Number(value))
    .sort((a, b) => a - b);

  const uniqueStarts = [];
  for (const value of starts) {
    if (!uniqueStarts.length || Math.abs(uniqueStarts[uniqueStarts.length - 1] - value) > 8) {
      uniqueStarts.push(value);
    }
  }

  const fallbackFractions = [0, 0.1, 0.34, 0.48, 0.66];
  while (uniqueStarts.length < 5) {
    uniqueStarts.push(minX + tableWidth * fallbackFractions[uniqueStarts.length]);
  }

  const [idStart, hypStart, probStart, areaStart, whyStart] = uniqueStarts.slice(0, 5);

  return [
    { key: "id", start: idStart - 4, end: hypStart - 2 },
    { key: "hypothesis", start: hypStart - 2, end: probStart - 2 },
    { key: "probability", start: probStart - 2, end: areaStart - 2 },
    { key: "affected_area", start: areaStart - 2, end: whyStart - 2 },
    { key: "key_why_chain", start: whyStart - 2, end: maxX + 20 },
  ];
}

function splitLineIntoColumns(line, columns) {
  const cells = Object.fromEntries(columns.map((column) => [column.key, []]));

  for (const item of line.items) {
    const centerX = item.centerX;
    let column = columns.find((candidate) => centerX >= candidate.start && centerX < candidate.end);

    if (!column) {
      if (centerX < columns[0].start) column = columns[0];
      else if (centerX >= columns[columns.length - 1].end) column = columns[columns.length - 1];
    }

    if (column) cells[column.key].push(item);
  }

  return Object.fromEntries(
    Object.entries(cells).map(([key, value]) => [key, joinItems(value)]),
  );
}

function appendCellValue(row, key, value) {
  const cleanValue = normalizeSpaces(value);
  if (!cleanValue) return;

  if (!row[key]) {
    row[key] = cleanValue;
    return;
  }

  const existing = String(row[key]);
  if (existing.endsWith(cleanValue)) return;

  row[key] = `${existing} ${cleanValue}`.trim();
}

function isRepeatedTableHeader(text) {
  const lower = text.toLowerCase();
  return lower.includes("hypothesis") && lower.includes("probability");
}

function cleanHypothesisId(value) {
  const match = String(value || "").match(HYPOTHESIS_ID_RE);
  return match ? match[0].replace(/\s+/, "-").toUpperCase() : normalizeSpaces(value);
}

function cleanRow(row) {
  return {
    id: cleanHypothesisId(row.id),
    hypothesis: removeSquareBracketContent(row.hypothesis),
    probability: removeSquareBracketContent(row.probability),
    affected_area: removeSquareBracketContent(row.affected_area),
    key_why_chain: removeSquareBracketContent(row.key_why_chain),
  };
}

function extractRootCauseTable(lines) {
  const headerIndex = findHeaderLineIndex(lines);
  if (headerIndex < 0) return [];

  const headerLine = lines[headerIndex];
  const followingLines = lines.slice(headerIndex + 1);
  const columns = buildColumns(headerLine, followingLines);
  const rows = [];
  const seenIds = new Set();
  let currentRow = null;

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const text = normalizeSpaces(line.text);

    if (!text) continue;
    if (isRepeatedTableHeader(text)) continue;

    if (rows.length || currentRow) {
      if (NEXT_SECTION_RE.test(text) && !HYPOTHESIS_ID_RE.test(text)) {
        break;
      }

      if (/\b(evidence\s+balance|similar\s+incident|cross[-\s]?check)\b/i.test(text)) {
        break;
      }
    }

    const cells = splitLineIntoColumns(line, columns);
    const idMatch = cells.id.match(HYPOTHESIS_ID_RE) || text.match(/^\s*(HYP[-\s]?\d{1,4})\b/i);

    if (idMatch) {
      const cleanId = cleanHypothesisId(idMatch[0]);

      if (currentRow) {
        const completed = cleanRow(currentRow);
        if (completed.id) seenIds.add(completed.id);
        rows.push(completed);
      }

      if (seenIds.has(cleanId)) {
        break;
      }

      currentRow = {
        id: cleanId,
        hypothesis: "",
        probability: "",
        affected_area: "",
        key_why_chain: "",
      };

      appendCellValue(currentRow, "hypothesis", cells.hypothesis);
      appendCellValue(currentRow, "probability", cells.probability);
      appendCellValue(currentRow, "affected_area", cells.affected_area);
      appendCellValue(currentRow, "key_why_chain", cells.key_why_chain);
      continue;
    }

    if (!currentRow) continue;

    appendCellValue(currentRow, "hypothesis", cells.hypothesis);
    appendCellValue(currentRow, "probability", cells.probability);
    appendCellValue(currentRow, "affected_area", cells.affected_area);
    appendCellValue(currentRow, "key_why_chain", cells.key_why_chain);
  }

  if (currentRow) rows.push(cleanRow(currentRow));

  return rows.filter((row) => row.id || row.hypothesis || row.key_why_chain);
}

function extractRootCauseSectionText(lines) {
  const headingIndex = findLineIndex(lines, (line) => ROOT_CAUSE_ANY_RE.test(line.text));
  if (headingIndex < 0) return "";

  const sectionLines = [];

  for (let index = headingIndex; index < lines.length; index += 1) {
    const line = lines[index];
    const text = normalizeSpaces(line.text);

    if (index > headingIndex && NEXT_SECTION_RE.test(text)) break;
    sectionLines.push(text);
  }

  return normalizePdfText(sectionLines.join("\n"));
}

export async function extractRootCauseFromPdf(pdfUrl) {
  const loadingTask = pdfjsLib.getDocument({
    url: pdfUrl,
    withCredentials: false,
  });

  const pdf = await loadingTask.promise;
  const allItems = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    for (const item of content.items || []) {
      allItems.push(itemToPlainObject(item, pageNumber));
    }
  }

  const lines = groupItemsIntoLines(allItems);
  const rootCauseTable = extractRootCauseTable(lines);
  const rootCauseText = removeSquareBracketContent(extractRootCauseSectionText(lines));
  const fullPdfText = normalizePdfText(lines.map((line) => line.text).join("\n"));

  return {
    rootCauseTable,
    rootCauseRows: rootCauseTable,
    rootCauseText,
    rawRootCauseSection: rootCauseText,
    fullPdfText,
  };
}
