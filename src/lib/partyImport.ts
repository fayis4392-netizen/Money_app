import { round3 } from '@/domain/pricing'

export interface ParsedPartyRow {
  name: string
  amount: number
}

interface PdfTextItem {
  str: string
  transform: number[]
}

interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument: (src: { data: ArrayBuffer }) => {
    promise: Promise<{
      numPages: number
      getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: PdfTextItem[] }> }>
    }>
  }
}

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib
  }
}

const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load ' + src))
    document.head.appendChild(s)
  })
}

async function loadPdfJs(): Promise<PdfJsLib> {
  if (!window.pdfjsLib) await loadScript(PDFJS_URL)
  const lib = window.pdfjsLib
  if (!lib) throw new Error('PDF reader failed to initialize')
  lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL
  return lib
}

/** Extract visual text lines from a PDF file, preserving row order and left-to-right column order. */
export async function extractPdfLines(file: File): Promise<string[]> {
  const lib = await loadPdfJs()
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise
  const lines: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent()
    const rows: { y: number; cells: { x: number; s: string }[] }[] = []
    for (const it of tc.items) {
      const s = it.str.trim()
      if (!s) continue
      const x = it.transform[4]
      const y = it.transform[5]
      let r = rows.find((row) => Math.abs(row.y - y) < 3.5)
      if (!r) {
        r = { y, cells: [] }
        rows.push(r)
      }
      r.cells.push({ x, s })
    }
    rows.sort((a, b) => b.y - a.y)
    for (const r of rows) {
      r.cells.sort((a, b) => a.x - b.x)
      lines.push(r.cells.map((c) => c.s).join(' '))
    }
  }
  return lines
}

/** Parse pasted, CSV/TSV, or PDF-extracted lines into party names and signed opening balances. */
export function parsePartyImportLines(rawLines: string[]): ParsedPartyRow[] {
  const out: ParsedPartyRow[] = []
  for (const raw of rawLines) {
    let line = raw.trim()
    if (!line) continue
    if (/^(sr\s*no|s\.?\s*no|sl\s*no|name\b|customer\b)/i.test(line)) continue

    if (line.includes(',') || line.includes('\t')) {
      const cols = line.split(line.includes('\t') ? '\t' : ',').map((c) => c.replace(/^["']|["']$/g, '').trim())
      let name = ''
      let amtStr = ''
      if (cols.length >= 3 && /^\d+$/.test(cols[0])) {
        name = cols[1]
        amtStr = cols[2]
      } else {
        name = cols[0]
        amtStr = cols[1] ?? ''
      }
      if (!name || /^(name|customer)$/i.test(name)) continue
      const amt = amtStr === '' ? 0 : parseFloat(amtStr.replace(/,/g, ''))
      out.push({ name, amount: Number.isNaN(amt) ? 0 : round3(amt) })
      continue
    }

    // Pure number line (e.g. grand total at bottom of PDF) -> skip
    if (/^-?\d+(?:,\d{3})*(?:\.\d+)?$/.test(line)) continue

    // Strip optional leading serial number
    line = line.replace(/^\d+\s+/, '').trim()
    if (!line) continue

    const m = line.match(/^(.*?)\s+(-?\d+(?:,\d{3})*(?:\.\d+)?)$/)
    if (m) {
      const name = m[1].trim()
      const amt = parseFloat(m[2].replace(/,/g, ''))
      if (name && !Number.isNaN(amt)) {
        out.push({ name, amount: round3(amt) })
        continue
      }
    }

    // Line with no amount (blank amount cell -> 0)
    out.push({ name: line, amount: 0 })
  }
  return out
}

