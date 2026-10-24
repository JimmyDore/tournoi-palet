const dateFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** « samedi 19 décembre 2026 » */
export function formatDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? date : dateFormat.format(d)
}

/** « 14:00 » → « 14h00 » */
export function formatTime(time: string): string {
  return time.replace(':', 'h')
}

export function formatPrice(price: number): string {
  return `${price.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`
}

const timestampFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' })

export function formatTimestamp(ms: number): string {
  return timestampFormat.format(new Date(ms))
}

/** Un numéro de téléphone dans le contact devient un lien `tel:`. */
export function phoneHref(contact: string): string | null {
  const match = contact.match(/(\+?\d[\d .-]{7,}\d)/)
  return match ? `tel:${match[1].replace(/[ .-]/g, '')}` : null
}
