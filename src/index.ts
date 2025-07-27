import 'dotenv/config';
import rateLimit from 'express-rate-limit';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import upload from './multer-config.js';
import { getInfo, ffmpegEdit, ffmpegDownload } from './ffmpeg-functions.js';
import fs from 'fs/promises';
import path from 'path';
import { db_init, db } from './db.js';
import auth from './auth.js';
import deleteOldFiles from './interval-function.js';
import { editOptions, Video } from './interfaces.js';

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

deleteOldFiles();
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
			try {
				await fs.unlink(req.file.path);
			} catch (err) {
				console.error('Error deleting file:', err);
			}
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

//download endpoint
app.get('/download/:extension/:filename', auth, strictLimiter, async (req, res) => {
	const extension = req.params.extension;
	const filename = req.params.filename;
	if (filename.includes('..') || extension.includes('..')) {
		res.status(400).json({ message: 'Wrong extension or filename' });
		console.error('Wrong filename or extension: downloading gif endpoint');
		return;
	}

	const input = path.join(process.cwd(), 'storage', filename);

	try {
		await fs.access(input);
	} catch (err) {
		res.status(404).json({ message: 'File does not exist' });
		return;
	}

	if ('.' + extension == path.extname(filename)) {
		res.status(200).download(input);
	} else {
		const baseName = path.basename(filename, path.extname(filename));
		const outputName = `${baseName}.${extension}`;
		try {
			const ffmpeg = ffmpegDownload(input, extension);

			res.setHeader('Content-Disposition', `attachment; filename="${outputName}"`);

			ffmpeg.stdout.pipe(res);

			ffmpeg.on('error', err => {
				console.error('ffmpeg error:', err);
				if (!res.headersSent) {
					res.status(500).end('FFmpeg failed');
				}
			});
		} catch (err) {
			console.error('Streaming failed in download endpoint:', err);
			res.status(500).json({ message: 'Error while streaming file' });
		}
	}
});

//edit video endpoint
app.patch('/edit', strictLimiter, async (req, res) => {
	const options: editOptions = req.body;
	if (!options.id) {
		console.error('No id : edit endpoint');
		res.status(400).json({ message: 'Video id is missing' });
		return;
	}
	const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(options.id) as Video | undefined;

	if (!video || !video.duration) {
		res.status(404).json({ message: 'Cannot edit : video not found' });
		return;
	}
	const filePath = path.join(process.cwd(), 'storage', video.filename);
	const tempOutput = path.join(process.cwd(), 'storage', 'temp_' + video.filename);
	try {
		await fs.access(filePath);
	} catch (err) {
		console.error('Trying to edit file that doesnt exist: ', err);
		res.status(404).json({ message: 'File not found' });
		return;
	}

	try {
		await ffmpegEdit(options, video.duration, filePath, tempOutput);
		await fs.rename(tempOutput, filePath);
		const info = await getInfo(filePath);
		db.prepare(`UPDATE videos SET duration = ?,size= ? WHERE id = ? `).run(info.duration, info.size, video.id);
		res.status(200).json({ message: 'succesfully edited video' });
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: 'Something went wrong during editing' });
	}
});
//delete video endpoint
app.delete('/delete/:id', softLimiter, async (req, res) => {
	const id = req.params.id;
	const result = db.prepare('SELECT filename FROM videos WHERE id = ?').get(id) as { filename: string } | undefined;
	if (!result) {
		res.status(404).json({ message: "Video doesn't exist" });
		return;
	}
	const filePath = path.join(process.cwd(), 'storage', result.filename);

	try {
		await fs.access(filePath);
		await fs.unlink(filePath);
	} catch {
		console.warn('File not found on disk, deleting from DB anyway');
		res.status(404).json({ message: "File doesn't exist" });
		return;
	}

	db.prepare('DELETE FROM videos WHERE id = ?').run(id);
	res.status(200).json({ message: 'Video deleted' });
});

app.listen(port, () => {
	console.log(`Server running at http://localhost:${port}`);
});
