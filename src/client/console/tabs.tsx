import type { ComponentType } from 'react'
import type { AdminView } from '../../engine/index.ts'
import { JournalTab } from './JournalTab.tsx'
import { LinksTab } from './LinksTab.tsx'
import { SettingsTab } from './SettingsTab.tsx'

export interface TabProps {
  view: AdminView
}

/**
 * Onglets de `/console/:id/:tab`. Pour ajouter un onglet (inscriptions,
 * pointage, poules, tableaux, télé…), ajouter une entrée ici. Le premier est
 * l'onglet par défaut.
 */
export const EDITION_TABS: { key: string; label: string; Component: ComponentType<TabProps> }[] = [
  { key: 'reglages', label: 'Réglages', Component: SettingsTab },
  { key: 'liens', label: 'Liens publics', Component: LinksTab },
  { key: 'journal', label: 'Journal', Component: JournalTab },
]
