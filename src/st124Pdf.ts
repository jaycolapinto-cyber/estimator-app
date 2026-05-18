// src/st124Pdf.ts
//
// Generates a populated NY State ST-124 Certificate of Capital Improvement
// PDF by overlaying contract data onto the official fillable form.
//
// Strategy:
//   1. Try to fetch the official PDF from /forms/st124_fill_in.pdf (local,
//      bundled in the app's public/ folder — no CORS, works offline).
//   2. Fall back to the live NY State URL (typically blocked by browser
//      CORS, but works in Electron and from same-origin server proxies).
//   3. Use pdf-lib to enumerate AcroForm text fields, fuzzy-match them to
//      our logical field names, and write the contract data into the
//      matched fields. Unmatched fields are skipped silently and listed
//      in console.warn so we can sharpen the matcher over time.
//   4. Return a Blob of the populated PDF for download/print.

import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";

const LOCAL_FORM_URL = "/forms/st124_fill_in.pdf";
const REMOTE_FORM_URL =
  "https://www.tax.ny.gov/pdf/current_forms/st/st124_fill_in.pdf";

export type ST124FormData = {
  customerName: string;
  customerStreet: string;
  customerCity: string;
  customerState: string;
  customerZip: string;
  customerCityStateZip: string; // pre-joined fallback
  customerPhone: string;
  customerEmail: string;
  projectDescription: string;
  projectStreet: string;
  projectCityStateZip: string;
  date: string;
  contractorName: string;
  contractorStreet: string;
  contractorCity: string;
  contractorState: string;
  contractorZip: string;
  contractorCityStateZip: string;
  contractorPhone: string;
};

// ----------------------------------------------------------------------------
// Field matcher
// ----------------------------------------------------------------------------
// The official PDF's AcroForm field names aren't published; common NY tax
// form conventions use names like "Purchaser_name", "Address_1", etc. We
// fuzzy-match by lowercased substring keywords (any-of). The first PDF
// text field whose name contains ALL keywords (in any order) wins.
//
// Order of entries matters: more specific patterns first so they're
// consumed before broader ones.

type MatcherEntry = {
  keywords: string[]; // all must appear in field name (lowercased)
  notKeywords?: string[]; // none of these may appear
  value: () => string;
};

function buildMatchers(data: ST124FormData): MatcherEntry[] {
  return [
    // ---------- Contractor (Part 2) ----------
    { keywords: ["contractor", "name"], value: () => data.contractorName },
    { keywords: ["contractor", "street"], value: () => data.contractorStreet },
    {
      keywords: ["contractor", "address"],
      notKeywords: ["city", "state", "zip"],
      value: () => data.contractorStreet,
    },
    { keywords: ["contractor", "city"], value: () => data.contractorCity },
    { keywords: ["contractor", "state"], value: () => data.contractorState },
    { keywords: ["contractor", "zip"], value: () => data.contractorZip },
    { keywords: ["contractor", "phone"], value: () => data.contractorPhone },

    // ---------- Customer / Purchaser (Part 1) ----------
    { keywords: ["purchaser", "name"], value: () => data.customerName },
    {
      keywords: ["customer", "name"],
      notKeywords: ["printed"],
      value: () => data.customerName,
    },
    { keywords: ["purchaser", "street"], value: () => data.customerStreet },
    {
      keywords: ["purchaser", "address"],
      notKeywords: ["city", "state", "zip"],
      value: () => data.customerStreet,
    },
    {
      keywords: ["customer", "street"],
      value: () => data.customerStreet,
    },
    {
      keywords: ["customer", "address"],
      notKeywords: ["city", "state", "zip"],
      value: () => data.customerStreet,
    },
    { keywords: ["purchaser", "city"], value: () => data.customerCity },
    { keywords: ["customer", "city"], value: () => data.customerCity },
    { keywords: ["purchaser", "state"], value: () => data.customerState },
    { keywords: ["customer", "state"], value: () => data.customerState },
    { keywords: ["purchaser", "zip"], value: () => data.customerZip },
    { keywords: ["customer", "zip"], value: () => data.customerZip },

    // ---------- Project location ----------
    { keywords: ["job", "street"], value: () => data.projectStreet },
    { keywords: ["project", "street"], value: () => data.projectStreet },
    { keywords: ["location", "street"], value: () => data.projectStreet },
    {
      keywords: ["project", "address"],
      notKeywords: ["city", "state", "zip"],
      value: () => data.projectStreet,
    },
    {
      keywords: ["job", "address"],
      notKeywords: ["city", "state", "zip"],
      value: () => data.projectStreet,
    },
    { keywords: ["job", "city"], value: () => data.customerCity },
    { keywords: ["project", "city"], value: () => data.customerCity },
    { keywords: ["job", "state"], value: () => data.customerState },
    { keywords: ["project", "state"], value: () => data.customerState },
    { keywords: ["job", "zip"], value: () => data.customerZip },
    { keywords: ["project", "zip"], value: () => data.customerZip },

    // ---------- Description / Date ----------
    { keywords: ["description"], value: () => data.projectDescription },
    { keywords: ["explanation"], value: () => data.projectDescription },
    { keywords: ["nature"], value: () => data.projectDescription },
    { keywords: ["date"], value: () => data.date },
  ];
}

// ----------------------------------------------------------------------------
// Fetch helper — local first, remote fallback, useful error message.
// ----------------------------------------------------------------------------
async function fetchOfficialPdf(): Promise<ArrayBuffer> {
  try {
    const res = await fetch(LOCAL_FORM_URL);
    if (res.ok) {
      const ct = res.headers.get("content-type") || "";
      // CRA dev server returns index.html for missing /forms/*. Reject HTML.
      if (!ct.includes("html")) {
        return await res.arrayBuffer();
      }
    }
  } catch {
    /* fall through to remote */
  }

  try {
    const res = await fetch(REMOTE_FORM_URL);
    if (!res.ok) {
      throw new Error(`Remote fetch returned ${res.status}`);
    }
    return await res.arrayBuffer();
  } catch (err: any) {
    throw new Error(
      "Couldn't load the official ST-124 PDF. " +
        "Download it from " +
        REMOTE_FORM_URL +
        " and save to public/forms/st124_fill_in.pdf in the app, then try again. " +
        "(" +
        (err?.message || String(err)) +
        ")"
    );
  }
}

// ----------------------------------------------------------------------------
// Main: fetch, fill, return Blob
// ----------------------------------------------------------------------------
export async function generateST124Pdf(data: ST124FormData): Promise<Blob> {
  const pdfBytes = await fetchOfficialPdf();
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  const matchers = buildMatchers(data);
  const used = new Set<string>();
  const filledLog: { field: string; value: string }[] = [];
  const skippedLog: string[] = [];

  for (const field of fields) {
    const name = field.getName();
    const lower = name.toLowerCase();

    // Only fill text fields (skip checkboxes/radios/sigs)
    if (!(field instanceof PDFTextField)) continue;

    const match = matchers.find(
      (m) =>
        !used.has(m.keywords.join("|")) &&
        m.keywords.every((k) => lower.includes(k)) &&
        (m.notKeywords?.every((k) => !lower.includes(k)) ?? true)
    );

    if (!match) {
      skippedLog.push(name);
      continue;
    }

    const value = (match.value() || "").trim();
    if (!value) {
      skippedLog.push(name + " (empty value)");
      continue;
    }

    try {
      (field as PDFTextField).setText(value);
      // Each logical matcher fills at most one field — don't consume
      // 'Date' on first match if there are multiple date fields. For
      // single-use matchers we tag with the keywords joined.
      used.add(match.keywords.join("|"));
      filledLog.push({ field: name, value });
    } catch (e) {
      skippedLog.push(`${name} (setText failed: ${e})`);
    }
  }

  // Surface diagnostics in dev so we can sharpen the matcher.
  if (typeof console !== "undefined") {
    console.info("ST-124 PDF: filled fields", filledLog);
    if (skippedLog.length) {
      console.info(
        "ST-124 PDF: unmatched/skipped fields",
        skippedLog,
        "— if any of these should have been filled, share the names with the dev to add matchers."
      );
    }
  }

  // Don't flatten — leave fields editable in case the user wants to
  // hand-correct anything in Acrobat before printing.
  // form.flatten();

  const filledBytes = await pdfDoc.save();
  return new Blob([filledBytes], { type: "application/pdf" });
}

// ----------------------------------------------------------------------------
// Trigger a browser download of the generated Blob.
// ----------------------------------------------------------------------------
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke so the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Suppress unused-import warning for PDFCheckBox; reserved for future
// checkbox handling (e.g. "is/is not of the essence" checkboxes if the
// official form includes them).
void PDFCheckBox;
