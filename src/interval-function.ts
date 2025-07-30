import path from 'path';
import fs from 'fs/promises';
import { db } from './db.js';

async function deleteOldFiles() {
	const now = Date.now();
	const dayMs = 24 * 60 * 60 * 1000;
	console.log('Checking for old accounts');
	const oldAccounts = db.prepare('SELECT id FROM users WHERE created_at < ?').all(now - dayMs) as Array<{ id: string }>;
	for (const account of oldAccounts) {
		const videos = db.prepare('SELECT filename FROM videos WHERE user_id = ?').all(account.id) as Array<{ filename: string }>;
		for (const video of videos) {
			const filePath = path.join(process.cwd(), 'storage', video.filename);
			try {
				await fs.access(filePath);
				await fs.unlink(filePath);
				db.prepare('DELETE FROM videos WHERE filename = ?').run(video.filename);
				console.log('deleted old video');
			} catch (err) {
				console.error(err);
			}
		}
		db.prepare('DELETE FROM users WHERE id = ?').run(account.id);
		console.log('deleted old account');
	}
}

export default deleteOldFiles;
