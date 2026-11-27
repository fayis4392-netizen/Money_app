import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { saveParty } from '@/data/actions'
import { useAppState } from '@/data/store'
import { drcr, f3, todayStr } from '@/domain/format'
import { round3 } from '@/domain/pricing'
import { OPENING_CURRENCY, PARTY_TYPE_LABEL, type PartyType } from '@/domain/types'
import { extractPdfLines, parsePartyImportLines, type ParsedPartyRow } from '@/lib/partyImport'
import { attempt } from '@/lib/utils'
import { Button, Dialog, Empty, Field, Input, Select, Textarea } from '@/components/ui'

const PLURAL_LABEL: Record<PartyType, string> = {
  saudi_customer: 'Saudi Customers',
  saudi_collector: 'Saudi Collectors',
  dubai_collector: 'Dubai Collectors',
  dubai_agent: 'Dubai Agents',
  distributor: 'Distributors',
  operator: 'Operator Cash',
}

export function ImportPartiesDialog({ open, type, onClose }: { open: boolean; type: PartyType; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={`Import ${PLURAL_LABEL[type]} (PDF / CSV)`}
    >
      {open && <ImportPartiesBody key={type} type={type} onDone={onClose} />}
    </Dialog>
  )
}

function ImportPartiesBody({ type, onDone }: { type: PartyType; onDone: () => void }) {
  const parties = useAppState((s) => s.parties)
  const regions = useAppState((s) => s.regions)
  const cur = OPENING_CURRENCY[type]

  const [date, setDate] = useState(todayStr())
  const [regionId, setRegionId] = useState(regions[0]?.id ?? '')
  const [text, setText] = useState('')
  const [updateExisting, setUpdateExisting] = useState(true)
  const [pdfRows, setPdfRows] = useState<ParsedPartyRow[] | null>(null)
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'reading' | 'error'>('idle')

  const parsed = useMemo(() => {
    if (pdfRows !== null) return pdfRows
    return parsePartyImportLines(text.split(/\r?\n/))
  }, [pdfRows, text])

  const net = useMemo(() => round3(parsed.reduce((s, r) => s + r.amount, 0)), [parsed])

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (/\.pdf$/i.test(file.name)) {
      setPdfStatus('reading')
      setPdfRows(null)
      try {
        const lines = await extractPdfLines(file)
        setPdfRows(parsePartyImportLines(lines))
        setPdfStatus('idle')
      } catch (err) {
        setPdfStatus('error')
        toast.error('Could not read PDF: ' + (err instanceof Error ? err.message : String(err)))
      }
    } else {
      const content = await file.text()
      setPdfRows(null)
      setPdfStatus('idle')
      setText(content)
    }
  }

  function handleImport() {
    if (!parsed.length) return
    let added = 0
    let updated = 0
    const ok = attempt(() => {
      for (const r of parsed) {
        const existing = updateExisting ? parties.find((p) => p.type === type && p.name.trim().toLowerCase() === r.name.toLowerCase()) : undefined
        saveParty({
          id: existing?.id,
          type,
          name: r.name,
          phone: existing?.phone ?? '',
          regionId: type === 'distributor' ? (existing?.regionId ?? regionId) : undefined,
          notes: existing?.notes ?? '',
          active: existing ? existing.active : true,
          feePerLakh: existing?.feePerLakh,
          openingAmount: Math.abs(r.amount),
          openingSide: r.amount < 0 ? 'Cr' : 'Dr',
          openingDate: date || todayStr(),
        })
        if (existing) updated++
        else added++
      }
    }, `Imported ${added} new${updated ? `, updated ${updated}` : ''}`)
    if (ok) onDone()
  }

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <Field label="Upload PDF or CSV file">
          <Input type="file" accept=".pdf,.csv,.txt" onChange={onFileChange} className="py-1.5" />
        </Field>
        <Field label="Opening balance date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      {type === 'distributor' && (
        <Field label="Default region for new distributors">
          <Select value={regionId} onChange={(e) => setRegionId(e.target.value)}>
            <option value="">Choose</option>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
      )}

      <Field label={<>Or paste rows (one per line: <code>NAME AMOUNT</code> or <code>NAME,AMOUNT</code>)</>}>
        <Textarea
          rows={4}
          value={text}
          onChange={(e) => {
            setPdfRows(null)
            setPdfStatus('idle')
            setText(e.target.value)
          }}
          placeholder={'ABBAS -13\nADRU 262\nISMAIL 52166.025'}
        />
      </Field>

      <label className="flex items-center gap-2 text-xs text-fg">
        <input
          type="checkbox"
          checked={updateExisting}
          onChange={(e) => setUpdateExisting(e.target.checked)}
          className="size-4 accent-accent"
        />
        Update existing {PARTY_TYPE_LABEL[type].toLowerCase()} if name matches
      </label>

      <div className="text-xs text-muted">
        Positive amount = <b className="text-fg">Dr (owes you)</b> · Negative amount (<code>-</code>) = <b className="text-fg">Cr (you owe)</b>
      </div>

      {pdfStatus === 'reading' ? (
        <Empty>Reading PDF…</Empty>
      ) : pdfStatus === 'error' ? (
        <Empty>Failed to read PDF — try pasting or uploading CSV</Empty>
      ) : !parsed.length ? (
        <Empty>{text || pdfRows !== null ? 'No valid rows found' : 'Choose a PDF/CSV file or paste rows above to preview'}</Empty>
      ) : (
        <div className="grid gap-2">
          <div className="flex items-center justify-between text-xs">
            <span><b>{parsed.length}</b> {PLURAL_LABEL[type].toLowerCase()} ready</span>
            <span>Net total: <b>{cur} {drcr(net)}</b></span>
          </div>
          <div className="max-h-60 overflow-auto rounded-xl border border-border">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 text-right font-semibold">Amount ({cur})</th>
                  <th className="px-3 py-2 font-semibold">Side</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {parsed.map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 text-xs text-muted">{i + 1}</td>
                    <td className="px-3 py-1.5 font-medium">{r.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{f3(Math.abs(r.amount))}</td>
                    <td className="px-3 py-1.5 text-xs">
                      {r.amount < 0 ? (
                        <span className="text-neg">Cr · you owe</span>
                      ) : r.amount > 0 ? (
                        <span className="text-pos">Dr · owes you</span>
                      ) : (
                        <span className="text-muted">Zero</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" disabled={!parsed.length || pdfStatus === 'reading'} onClick={handleImport}>
          Import {parsed.length}
        </Button>
      </div>
    </div>
  )
}

