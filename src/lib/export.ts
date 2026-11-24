import type { Statement } from '@/domain/ledger'
import { dmy } from '@/domain/format'

/* Ledger exports in the operator's book format: DATE · PARTICULARS · QTY · RATE · CREDIT · DEBIT · BALANCE */

const n3 = (n: number) => n.toFixed(3)
const bal = (n: number) => `${Math.abs(n).toFixed(3)} ${n < -0.0005 ? 'Cr' : 'Dr'}`

/** 'agent': the Dubai agent's AED ledger, with ₹ and SAR beside each line instead of qty and rate */
export type LedgerStyle = 'books' | 'agent'
const HEAD: Record<LedgerStyle, string[]> = { books: ['DATE', 'PARTICULARS', 'QTY', 'RATE', 'CREDIT', 'DEBIT', 'BALANCE'], agent: ['DATE', 'PARTICULARS', 'INR', 'SAR', 'CREDIT', 'DEBIT', 'BALANCE'] }
type AgentRow = { inr?: number; sarEq?: number }
const n2 = (n: number) => n.toFixed(2)

function rowsOf(s: Statement, style: LedgerStyle = 'books') {
  return s.rows.map((r) => [r.opening ? '' : dmy(r.date), r.particulars,
    style === 'agent' ? ((r as AgentRow).inr != null ? n2((r as AgentRow).inr!) : '') : r.qty ? n3(r.qty) : '',
    style === 'agent' ? ((r as AgentRow).sarEq != null ? n3((r as AgentRow).sarEq!) : '') : r.rate ? n3(r.rate) : '', r.amount < 0 ? n3(-r.amount) : '', r.amount > 0 ? n3(r.amount) : '', bal(r.balance)])
}

function totalRow(s: Statement, style: LedgerStyle = 'books') {
  return [style === 'books' && s.totals.qty ? n3(s.totals.qty) : '', '', n3(s.totals.credit), n3(s.totals.debit), bal(s.totals.balance)]
}

function download(name: string, blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

export const fileName = (party: string, cur: string, from?: string, to?: string) =>
  `${party.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '')}_${cur}_ledger${from ? '_' + from : ''}${to ? '_to_' + to : ''}`

/** CSV that opens straight in Excel (UTF-8 BOM, CRLF). */
export function exportLedgerCsv(title: string, s: Statement, name: string, style: LedgerStyle = 'books') {
  const lines = [[title], HEAD[style], ...rowsOf(s, style), ['', 'Total', ...totalRow(s, style)]]
  const csv = '﻿' + lines.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  download(name + '.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
}

const purple: [number, number, number] = [128, 0, 128]
const loadPdf = () => Promise.all([import('jspdf'), import('jspdf-autotable')])
type Pdf = InstanceType<Awaited<ReturnType<typeof loadPdf>>[0]['jsPDF']>
const GRID = { theme: 'grid' as const, margin: { left: 10, right: 10, bottom: 18 }, showFoot: 'lastPage' as const,
  styles: { font: 'times', fontSize: 8.5, textColor: 20, lineColor: purple, lineWidth: 0.25, cellPadding: 1.6, valign: 'middle' as const },
  headStyles: { fillColor: [255, 255, 255] as [number, number, number], textColor: 20, fontStyle: 'normal' as const, halign: 'center' as const },
  footStyles: { fillColor: [255, 255, 255] as [number, number, number], textColor: 20, fontStyle: 'normal' as const, halign: 'right' as const } }

function pageNumbers(doc: Pdf, firstPage = 1, lastPage = doc.getNumberOfPages()) {
  for (let i = firstPage; i <= lastPage; i++) {
    doc.setPage(i)
    doc.setFont('times', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(20)
    doc.text(`Page ${i - firstPage + 1} of ${lastPage - firstPage + 1}`, 105, 289, { align: 'center' })
  }
}

async function drawLedgers(items: { title: string; s: Statement; style?: LedgerStyle }[]) {
  const [{ jsPDF }, { autoTable }] = await loadPdf()
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  items.forEach((it, i) => {
    const style = it.style ?? 'books'
    if (i > 0) doc.addPage()
    const first = doc.getNumberOfPages()
    autoTable(doc, {
      ...GRID,
      startY: 12,
      head: [[{ content: it.title, colSpan: 7, styles: { halign: 'center', fontStyle: 'bold', fontSize: 10, cellPadding: 3 } }], HEAD[style]],
      body: rowsOf(it.s, style),
      foot: [['', 'T o t a l', ...totalRow(it.s, style)]],
      columnStyles: { 0: { cellWidth: 19, fontSize: 7.5 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 19, halign: 'right' }, 3: { cellWidth: 16, halign: 'right' }, 4: { cellWidth: 22, halign: 'right' }, 5: { cellWidth: 22, halign: 'right' }, 6: { cellWidth: 27, halign: 'right' } },
      didParseCell: (h) => {
        if (h.section === 'foot' && h.column.index === 1) h.cell.styles.halign = 'left'
      },
    })
    // each ledger is numbered on its own, so a page can be sent to that customer alone
    pageNumbers(doc, first)
  })
  return doc
}

/** A4 PDF with purple grid lines, like the ledgers the operator prints today. */
export async function exportLedgerPdf(title: string, s: Statement, name: string, style: LedgerStyle = 'books') {
  download(name + '.pdf', (await drawLedgers([{ title, s, style }])).output('blob'))
}

/** Several ledgers in one PDF, each starting on a new page. */
export async function exportLedgersPdf(items: { title: string; s: Statement; style?: LedgerStyle }[], name: string) {
  download(name + '.pdf', (await drawLedgers(items)).output('blob'))
}

/** A titled summary table as an A4 PDF in the same style. `right` lists the columns to right-align. */
export async function exportTablePdf(title: string, sub: string, head: string[], body: string[][], foot: string[] | undefined, name: string, right: number[] = []) {
  const [{ jsPDF }, { autoTable }] = await loadPdf()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: head.length > 7 ? 'landscape' : 'portrait' })
  autoTable(doc, {
    ...GRID,
    startY: 12,
    head: [[{ content: title + (sub ? '\n' + sub : ''), colSpan: head.length, styles: { halign: 'center', fontStyle: 'bold', fontSize: 10, cellPadding: 3 } }], head],
    body,
    foot: foot ? [foot] : undefined,
    columnStyles: Object.fromEntries(right.map((i) => [i, { halign: 'right' as const }])),
  })
  const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight()
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('times', 'normal')
    doc.setFontSize(9)
    doc.text(`Page ${i} of ${pages}`, w / 2, h - 8, { align: 'center' })
  }
  download(name + '.pdf', doc.output('blob'))
}

/** Any table as a CSV that opens in Excel. */
export function downloadCsv(name: string, rows: string[][]) {
  const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  download(name + '.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }))
}
