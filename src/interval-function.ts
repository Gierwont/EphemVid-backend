import { db } from './db.js';
import { S3 } from './index.js';
import { DeleteObjectsCommand } from '@aws-sdk/client-s3';

async function deleteOldFiles() {
	const now = Date.now();
	const dayMs = 24 * 60 * 60 * 1000;
	console.log('Checking for old accounts');
	const oldAccounts = db.prepare('SELECT id FROM users WHERE created_at < ?').all(now - dayMs) as Array<{ id: string }>;

	for (const account of oldAccounts) {
		const videos = db.prepare('SELECT filename AS Key FROM videos WHERE user_id = ?').all(account.id) as Array<{ Key: string }>;
		if (videos.length > 0) {
			const command = new DeleteObjectsCommand({
				Bucket: 'ephemvid',
				Delete: {
					Objects: videos,
					Quiet: true
				}
			});
			try {
				await S3.send(command);
				const filenames = videos.map(f => f.Key);
				const placeholders = filenames.map(() => '?').join(',');
				db.prepare(`DELETE FROM videos WHERE filename IN (${placeholders})`).run(...filenames);
				console.log('deleted old videos');

			} catch (err) {
				console.error(err);
			}

		}
		db.prepare('DELETE FROM users WHERE id = ?').run(account.id);
		console.log('deleted old account');
	}
}

export default deleteOldFiles;
