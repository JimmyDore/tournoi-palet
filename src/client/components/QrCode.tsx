import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

/** QR code SVG (net à toute taille), bleu pétrole sur blanc. */
export function QrCode({ url, className }: { url: string; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#0b4f5cff', light: '#ffffffff' } })
      .then((text) => !cancelled && setSvg(text))
      .catch(() => !cancelled && setSvg(null))
    return () => {
      cancelled = true
    }
  }, [url])
  if (!svg) return <div className={className} aria-hidden="true" />
  return <div className={className} role="img" aria-label={`QR code vers ${url}`} dangerouslySetInnerHTML={{ __html: svg }} />
}
