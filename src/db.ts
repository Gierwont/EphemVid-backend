import Database from 'better-sqlite3';

export const db = new Database('app.db');

export function db_init() {
	const create_table_users = `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		fingerprint TEXT NOT NULL,
		created_at INTEGER NOT NULL
	)
	`;
	const create_table_videos = `
	CREATE TABLE IF NOT EXISTS videos (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		filename STRING NOT NULL UNIQUE ,
		created_at INTEGER NOT NULL,
		duration REAL,
		size INTEGER,
		user_id TEXT NOT NULL,
  		FOREIGN KEY (user_id) REFERENCES users(id)
	)
`;

	try {
		db.exec(create_table_users);
		console.log('Users table created or exists already');

		db.exec(create_table_videos);
		console.log('Videos table created or exists already');
	} catch (err) {
		console.error('Database initialization failed:', err);
		process.exit(1);
	}
}
