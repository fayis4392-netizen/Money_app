import { MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { downloadFile } from '@/lib/export'
import { waNumber } from '@/lib/whatsapp'
import { Button, Dialog, Field, Input, Textarea } from '@/components/ui'

export interface WhatsAppShare { file: File; phone: string; message: string; name: string }

/**
 * Send a statement on WhatsApp. On phones the PDF is attached through the share sheet;
 * on computers the PDF is downloaded and WhatsApp opens with the message ready to send.
 */
export function WhatsAppDialog({ share, onClose }: { share: WhatsAppShare | null; onClose: () => void }) {
  return (
    <Dialog open={!!share} onClose={onClose} title={`Send to ${share?.name ?? ''} on WhatsApp`}>
      {share && <Body key={share.file.name + share.message} share={share} onClose={onClose} />}
    </Dialog>
  )
}

function Body({ share, onClose }: { share: WhatsAppShare; onClose: () => void }) {
  const [message, setMessage] = useState(share.message)
  const [phone, setPhone] = useState(share.phone)
  const canAttach = typeof navigator.canShare === 'function' && navigator.canShare({ files: [share.file] })

  const viaShareSheet = async () => {
    try {
      await navigator.share({ files: [share.file], text: message })
      onClose()
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast.error("Couldn't open sharing: " + (e as Error).message)
    }
  }
  const viaWhatsAppWeb = () => {
    downloadFile(share.file)
    const n = waNumber(phone)
    window.open(`https://wa.me/${n}?text=${encodeURIComponent(message)}`, '_blank', 'noopener')
    toast.success(`${share.file.name} downloaded: attach it in the WhatsApp chat (📎), then send.`, { duration: 12000 })
    onClose()
  }

  return (
    <div className="grid gap-3">
      <Field label="Message" hint="You can change it before sending."><Textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
      <p className="text-sm text-muted">Attached: <b className="text-fg">{share.file.name}</b></p>
      {canAttach ? (
        <Button variant="primary" onClick={viaShareSheet}><MessageCircle /> Share with PDF (choose WhatsApp)</Button>
      ) : (
        <>
          <Field label="WhatsApp number" hint={phone ? 'With country code, e.g. 966 50 123 4567.' : 'No phone saved for this party: type it, or leave empty to pick the chat in WhatsApp.'}>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="966 5…" />
          </Field>
          <Button variant="primary" onClick={viaWhatsAppWeb}><MessageCircle /> Download PDF and open WhatsApp</Button>
        </>
      )}
    </div>
  )
}
