import { useEffect, useState } from 'react'

/**
 * Refus du moteur affiché dans un onglet. Il disparaît dès qu'une nouvelle
 * vue arrive (une commande a réussi, ici ou sur un autre PC) : un refus ne
 * reste jamais à l'écran une fois périmé.
 */
export function useRefusal(view: unknown) {
  const [refusal, setRefusal] = useState<string | null>(null)
  useEffect(() => setRefusal(null), [view])
  return [refusal, setRefusal] as const
}
