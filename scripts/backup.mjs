#!/usr/bin/env node
/**
 * Snapshot cohérent de la base, même pendant que le site tourne (API de backup SQLite).
 *
 *   node scripts/backup.mjs <destination>
 *   docker exec tournoi-palet-web node scripts/backup.mjs /data/snapshot.db
 *
 * Source : ${DATA_DIR:-./data}/tournoi-palet.db. Le fichier produit est autonome (journal DELETE,
 * pas de -wal à côté), vérifié (integrity_check) puis renommé atomiquement à la destination.
 * Code de sortie : 0 = OK, 1 = échec, 2 = mauvais usage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';

const DB_FILE = 'tournoi-palet.db';

const dest = process.argv[2];
if (!dest) {
	console.error('Usage : node scripts/backup.mjs <fichier de destination>');
	process.exit(2);
}

const dataDir = process.env.DATA_DIR?.trim() || './data';
const source = path.resolve(dataDir, DB_FILE);
const target = path.resolve(dest);

if (!fs.existsSync(source)) {
	console.error(`[backup] Base introuvable : ${source}`);
	process.exit(1);
}
if (target === source) {
	console.error('[backup] La destination doit être différente de la base.');
	process.exit(2);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
const tmp = `${target}.tmp-${process.pid}`;

try {
	const db = new DatabaseSync(source, { readOnly: true });
	try {
		await backup(db, tmp);
	} finally {
		db.close();
	}

	const copy = new DatabaseSync(tmp);
	let summary;
	try {
		copy.exec('PRAGMA journal_mode = DELETE');
		const { integrity_check: integrity } = copy.prepare('PRAGMA integrity_check').get();
		if (integrity !== 'ok') throw new Error(`integrity_check : ${integrity}`);
		// Nombre de lignes par table : de quoi repérer d'un coup d'œil une sauvegarde vide.
		const tables = copy
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
			.all()
			.map((row) => row.name);
		summary = tables
			.map((t) => `${t}: ${copy.prepare(`SELECT COUNT(*) AS n FROM "${t.replaceAll('"', '""')}"`).get().n}`)
			.join(', ');
	} finally {
		copy.close();
	}

	fs.renameSync(tmp, target);
	const size = fs.statSync(target).size;
	console.log(`[backup] OK : ${target} (${size} octets${summary ? `, ${summary}` : ''})`);
} catch (err) {
	fs.rmSync(tmp, { force: true });
	console.error(`[backup] Échec : ${err instanceof Error ? err.message : err}`);
	process.exit(1);
}
