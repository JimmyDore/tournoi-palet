import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildApp } from './app.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// En local, mot de passe `admin` par défaut ; en production, il est obligatoire.
if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD?.trim()) {
  console.error('ADMIN_PASSWORD manquant : refus de démarrer la console sans mot de passe.')
  process.exit(1)
}

const app = await buildApp({
  dataDir: process.env.DATA_DIR?.trim() || path.join(root, 'data'),
  staticDir: path.join(root, 'dist'),
  logger: true,
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0))
  })
}

await app.listen({ host: process.env.HOST || '0.0.0.0', port: Number(process.env.PORT) || 8787 })
