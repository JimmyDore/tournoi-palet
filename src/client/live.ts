import { useEffect, useState } from 'react'
import type { AdminView, PublicView } from '../engine/index.ts'

export type LiveStatus = 'connecting' | 'live' | 'offline' | 'not-found' | 'unauthorized'

export interface Live<T> {
  view: T | null
  status: LiveStatus
}

const RETRY_MS = [500, 1000, 2000, 5000]

/** Écart entre l'horloge du serveur et celle de cet appareil (ms). */
let serverOffset = 0

/** Recale l'écart sur l'heure du serveur reçue avec chaque vue (à la latence près). */
function noteServerNow(serverNow: number): void {
  serverOffset = serverNow - Date.now()
}

/** Heure du serveur, vue depuis cet appareil : télé et téléphones affichent le même chrono. */
export function serverNow(): number {
  return Date.now() + serverOffset
}

/**
 * Ouvre le WebSocket, s'abonne, et renvoie la dernière vue reçue. Se
 * reconnecte tout seul (et se réabonne) si la connexion tombe.
 */
function useLive<T>(subscription: Record<string, unknown> | null): Live<T> {
  const key = subscription ? JSON.stringify(subscription) : null
  const [live, setLive] = useState<Live<T>>({ view: null, status: 'connecting' })

  useEffect(() => {
    setLive({ view: null, status: 'connecting' })
    if (!key) return
    let ws: WebSocket | null = null
    let attempt = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false

    const connect = () => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(`${protocol}//${location.host}/ws`)
      ws.onmessage = (event) => {
        const msg = JSON.parse(String(event.data))
        if (msg.type === 'hello') ws?.send(key)
        else if (msg.type === 'view') {
          attempt = 0
          if (typeof msg.serverNow === 'number') noteServerNow(msg.serverNow)
          setLive({ view: msg.view as T, status: 'live' })
        } else if (msg.type === 'error') {
          stopped = true
          setLive({ view: null, status: msg.reason === 'unauthorized' ? 'unauthorized' : 'not-found' })
        }
      }
      // Une erreur ferme le socket avant toute reconnexion : jamais deux sockets ouverts pour un même abonnement.
      const socket = ws
      ws.onerror = () => socket.close()
      ws.onclose = () => {
        if (stopped || ws !== socket) return
        setLive((prev) => ({ ...prev, status: 'offline' }))
        timer = setTimeout(connect, RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)])
      }
    }
    connect()
    return () => {
      stopped = true
      clearTimeout(timer)
      ws?.close()
    }
  }, [key])

  return live
}

/** Vue publique d'une édition (`k` : jeton d'une édition de test). */
export function useEditionView(editionId: string | null, k?: string | null): Live<PublicView> {
  return useLive<PublicView>(editionId ? { type: 'subscribe', editionId, ...(k ? { k } : {}) } : null)
}

/** Vue console d'une édition (session requise). */
export function useAdminView(editionId: string | null): Live<AdminView> {
  return useLive<AdminView>(editionId ? { type: 'subscribe-admin', editionId } : null)
}
