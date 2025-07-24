import 'dotenv/config';
import rateLimit from 'express-rate-limit';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import upload from './multer-config.js';
import { getInfo, createGif } from './ffmpeg-functions.js';
import fs from 'fs/promises';
import path from 'path';
import { db_init, db } from './db.js';
import auth from './auth.js';
import deleteOldFiles from './interval-function.js';

const strictLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: 10,
	message: 'Too many requests , try again later'
});
const softLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: 60,
	message: 'Too many requests , try again later'
});

const app = express();
const port = process.env.port;
app.use(express.json());
app.use(cookieParser());
app.use(
	cors({
		origin: process.env.front_url,
		credentials: true
	})
);
app.use(
	helmet({
		crossOriginResourcePolicy: { policy: 'cross-origin' }
	})
);
db_init();
setInterval(() => {
	deleteOldFiles();
}, 24 * 60 * 60 * 1000);
//-------------------------------------------------------------------
//upload endpoint

app.post('/upload', auth, strictLimiter, (req, res) => {
	const videos = db.prepare(`SELECT COUNT(*) as count FROM videos WHERE user_id = ?  AND filename NOT LIKE '%.gif'`).get(req.userId) as { count: number };
	if (videos.count >= 10) {
		console.error('Too many files');
		res.status(401).json({ message: 'Reached 10 files limit' });
		return;
	}

	const middleware = upload.single('video');
	middleware(req, res, async err => {
		if (err) {
			console.error(err);
			res.status(400).json({ message: 'Wrong type of file' });
			return;
		}
		if (!req.file) {
			console.error('file to upload is null');
			res.status(400).json({ message: 'File is missing' });
			return;
		}

		try {
			const info = await getInfo(req.file.path);
			db.prepare('INSERT INTO videos (filename,created_at,duration,size,user_id) VALUES (?,?,?,?,?)').run(req.file.filename, Date.now(), info.duration, info.size, req.userId);
			res.status(200).json({
				message: 'File uploaded succesfully'
			});
		} catch (err) {
			console.error(err);
			res.status(500).json({ message: 'Error while processing file' });
		}
	});
});

//get all filenames
app.get('/all', auth, softLimiter, (req, res) => {
	const getDirectory = db.prepare(`SELECT id,filename,created_at,duration,size FROM videos WHERE user_id = ? AND filename NOT LIKE '%.gif' ORDER BY created_at DESC`);
	const videos = getDirectory.all(req.userId);
	res.status(200).json(videos);
});

//serve 1 file endpoint
app.get('/file/single/:filename', softLimiter, async (req, res) => {
	const filename = req.params.filename;

	if (filename.includes('..')) {
		res.status(400).json({ message: 'Wrong filename' });
		return;
	}

	const filePath = path.join(process.cwd(), 'storage', filename);

	try {
		await fs.access(filePath);
		res.status(200).sendFile(filePath);
	} catch {
		res.status(404).json({ message: 'File does not exist' });
	}
});

//download gif endpoint
app.get('/download/gif/:filename', auth, strictLimiter, async (req, res) => {
	const filename = req.params.filename;
	if (filename.includes('..') || path.extname(filename) != '.mp4') {
		res.status(400).json({ message: 'Wrong filename' });
		console.error('Wrong filename: downloading gif endpoint');
		return;
	}
	const input = path.join(process.cwd(), 'storage', filename);
	const output = path.join(process.cwd(), 'storage', filename.replace('.mp4', '.gif'));
	const searchedGif = db.prepare('SELECT COUNT(*) as count FROM videos WHERE filename = ?').get(filename.replace('.mp4', '.gif')) as { count: number };
	if (searchedGif.count == 1) {
		console.log('Gif already exists no need to create new one : download gif endpoint');
		res.status(200).download(output);
		return;
	} else {
		try {
			await fs.access(input);
			await createGif(input, output);
			console.log('Created gif');
			db.prepare('INSERT INTO videos (filename,created_at,duration,size,user_id) VALUES (?,?,?,?,?)').run(filename.replace('.mp4', '.gif'), Date.now(), null, null, req.userId);

			res.status(200).download(output);
		} catch (err) {
			console.error(err);
			res.status(500).json({ message: 'Error while creating gif' });
		}
	}
});

app.listen(port, () => {
	console.log(`Server running at http://localhost:${port}`);
});
