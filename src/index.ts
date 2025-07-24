import 'dotenv/config';
import rateLimit from 'express-rate-limit';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import upload from './multer-config.js';
import { getInfo } from './ffmpeg-functions.js';

import { db_init, db } from './db.js';
import { auth } from './auth.js';

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
//-------------------------------------------------------------------
//upload endpoint

app.post('/upload', auth, strictLimiter, (req, res) => {
	const videos = db.prepare('SELECT COUNT(*) as count FROM videos WHERE user_id = ?').get(req.userId) as { count: number };
	if (videos.count >= 10) {
		console.error('Too many files');
		res.status(401).json({ message: 'Reached 10 files limit' });
		return;
	}

	const middleware = upload.single('video');
	middleware(req, res, async err => {
		if (!req.file) {
			console.error('file to upload is null');
			res.status(400).json({ message: 'File is missing' });
			return;
		}
		if (err) {
			console.error(err);
			res.status(400).json({ message: 'Wrong type of file' });
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

app.listen(port, () => {
	console.log(`Server running at http://localhost:${port}`);
});
