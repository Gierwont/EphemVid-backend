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
import https from 'https';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import util from 'util';
import stream from 'stream';
import type { GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { createWriteStream, write } from 'fs';

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
const port = process.env.PORT;
app.use(express.json());
app.use(cookieParser());
app.use(
	cors({
		origin: process.env.FRONT_URL,
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
const pipeline = util.promisify(stream.pipeline);

//-----------------------------------------------------------------s3 config
if (!process.env.ACCESS_KEY_ID || !process.env.SECRET_ACCESS_KEY) {
	throw new Error('Missing CloudFlare credentials in environment variable');
}
const S3 = new S3Client({
	region: 'auto',
	endpoint: `https://${process.env.ACCOUNT_ID}.r2.cloudflarestorage.com`,
	credentials: {
		accessKeyId: process.env.ACCESS_KEY_ID,
		secretAccessKey: process.env.SECRET_ACCESS_KEY
	}
});
//-------------------------------------------------------------------
//upload endpoint
app.post('/upload', auth, strictLimiter, (req, res) => {
	const videos = db.prepare(`SELECT COUNT(*) as count FROM videos WHERE user_id = ?`).get(req.userId) as { count: number };
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
			const fileContent = await fs.readFile(req.file.path);
			const uploadParams = {
				Bucket: 'ephemvid',
				Key: req.file.filename,
				Body: fileContent,
				ContentType: req.file.mimetype
			};
			const data = await S3.send(new PutObjectCommand(uploadParams));
			res.status(200).json({
				message: 'File uploaded succesfully'
			});
		} catch (err) {
			console.error(err);
			res.status(500).json({ message: 'Error while processing file' });
		} finally {
			try {
				await fs.unlink(req.file.path);
			} catch (err) {
				console.error('Error deleting file:', err);
			}
		}
	});
});

//get all filenames
app.get('/all', auth, softLimiter, (req, res) => {
	const getDirectory = db.prepare(`SELECT id,filename,created_at,duration,size FROM videos WHERE user_id = ? ORDER BY created_at DESC`);
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

	try {
		const command = new GetObjectCommand({
			Bucket: 'ephemvid',
			Key: filename
		});
		const data = await S3.send(command);

		if (data.ContentType) {
			res.setHeader('Content-Type', data.ContentType);
		}
		if (data.ContentLength) {
			res.setHeader('Content-Length', data.ContentLength.toString());
		}
		res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

		await pipeline(data.Body as stream.Readable, res);
	} catch (err) {
		console.error('Error streaming file:', err);
		res.status(404).json({ message: 'File does not exist or cannot be read' });
		return;
	}
});

//download endpoint
app.get('/download/:extension/:filename', auth, strictLimiter, async (req, res) => {
	const extension = req.params.extension;
	const filename = req.params.filename;
	if (filename.includes('..') || extension.includes('..')) {
		res.status(400).json({ message: 'Wrong extension or filename' });
		console.error('Wrong filename or extension: downloading endpoint');
		return;
	}

	let data: GetObjectCommandOutput;
	try {
		const command = new GetObjectCommand({
			Bucket: 'ephemvid',
			Key: filename
		});
		data = await S3.send(command);
	} catch (err) {
		console.error('Error reading file:', err);
		res.status(404).json({ message: 'File does not exist or cannot be read' });
		return;
	}

	//if target download ext == original ext , just stream it to user
	if ('.' + extension == path.extname(filename)) {
		res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
		if (data.ContentType) {
			res.setHeader('Content-Type', data.ContentType);
		}
		if (data.ContentLength) {
			res.setHeader('Content-Length', data.ContentLength.toString());
		}
		try {
			await pipeline(data.Body as stream.Readable, res);
		} catch (err) {
			console.error('Error streaming file:', err, '    download endpoint');
		}
	}
	//if user requests changing extension , download it and stream it
	else {
		const baseName = path.basename(filename, path.extname(filename));
		const input = path.join(process.cwd(), 'storage', filename);
		const outputName = `${baseName}.${extension}`;
		try {
			const writeStream = createWriteStream(input);
			await pipeline(data.Body as stream.Readable, writeStream);

			const ffmpeg = ffmpegDownload(input, extension);

			res.setHeader('Content-Disposition', `attachment; filename="${outputName}"`);

			ffmpeg.stdout.pipe(res);

			ffmpeg.on('error', err => {
				console.error('ffmpeg error:', err);
				if (!res.headersSent) {
					res.status(500).end('FFmpeg failed');
				}
			});

			res.on('close', async () => {
				try {
					await fs.unlink(input);
				} catch (err) {
					console.warn('Could not delete temp file:', err);
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
	//tytah
	let data: GetObjectCommandOutput;
	const filePath = path.join(process.cwd(), 'storage', video.filename);
	const tempOutput = path.join(process.cwd(), 'storage', 'temp_' + video.filename);
	try {
		const getVideo = new GetObjectCommand({
			Bucket: 'ephemvid',
			Key: video.filename
		});
		data = await S3.send(getVideo);
		const writeStream = createWriteStream(filePath);
		await pipeline(data.Body as stream.Readable, writeStream);
	} catch (err) {
		console.error('Problems downloading file (edit endpoint): ', err);
		res.status(404).json({ message: 'File not found' });
		return;
	}
	try {
		await ffmpegEdit(options, video.duration, filePath, tempOutput);
		// await fs.rename(tempOutput, filePath);
		const info = await getInfo(tempOutput);
		db.prepare(`UPDATE videos SET duration = ?,size= ? WHERE id = ? `).run(info.duration, info.size, video.id);
		const fileContent = await fs.readFile(tempOutput);
		const uploadParams = {
			Bucket: 'ephemvid',
			Key: video.filename,
			Body: fileContent,
			ContentType: data.ContentType
		};
		await S3.send(new PutObjectCommand(uploadParams));
		res.on('close', async () => {
			try {
				await fs.unlink(filePath);
				await fs.unlink(tempOutput);
			} catch (err) {
				console.warn('Could not delete temp file:', err);
			}
		});
		res.status(200).json({ message: 'succesfully edited video' });
	} catch (err) {
		console.error(err);
		try {
			await fs.unlink(filePath);
			await fs.unlink(tempOutput);
		} catch (err) {
			console.warn('Could not delete temp file:', err);
		}
		if (err instanceof Error && err.message.includes('New bitrate is too low, increase bitrate or shorten the video')) {
			res.status(400).json({ message: 'New bitrate is too low — increase bitrate or shorten the video.' });
		} else {
			res.status(500).json({ message: 'Something went wrong during editing' });
		}
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

	try {
		const deleteParams = {
			Bucket: 'ephemvid',
			Key: result.filename
		};
		const data = await S3.send(new DeleteObjectCommand(deleteParams));
		db.prepare('DELETE FROM videos WHERE id = ?').run(id);
		res.status(200).json({ message: 'Video deleted' });
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: 'Could not delete file' });
	}
});

if (process.env.SSL_ENABLE === 'true') {
	const sslOptions = {
		key: await fs.readFile(process.env.KEY_PATH!),
		cert: await fs.readFile(process.env.CERT_PATH!)
	};

	https.createServer(sslOptions, app).listen(port, () => {
		console.log(`SSL server running at https://localhost:${port}`);
	});
} else {
	app.listen(port, () => {
		console.log(`Server running at http://localhost:${port}`);
	});
}
