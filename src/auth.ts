import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db';

declare global {
	namespace Express {
		interface Request {
			userId?: string;
		}
	}
}
const JWT_SECRET = process.env.JWT_SECRET;

export function auth(req: Request, res: Response, next: NextFunction) {
	const token = req.cookies?.token as string | undefined;
	const fingerprint = req.cookies?.fingerprint as string;
	if (!JWT_SECRET) {
		throw new Error('JWT_SECRET environment variable not set');
		return;
	}
	if (!fingerprint) {
		res.status(400).json({ error: 'Browser fingerprint missing from cookie' });
		return;
	}

	if (token) {
		try {
			const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
			const users = db.prepare('SELECT COUNT(*) as count FROM users WHERE id = ?').get(decoded.userId) as { count: number };
			if (users.count == 1) {
				req.userId = decoded.userId;
				next();
				return;
			}
		} catch (err) {
			console.warn('Bad token:', err);
		}
	}

	const fingerprints = db.prepare('SELECT COUNT(*) as count FROM users WHERE fingerprint = ?').get(fingerprint) as { count: number };
	if (fingerprints.count >= 3) {
		res.status(403).json({ error: 'Too many accounts from this device ,try again later' });
		// next();
		return;
	}
	const newUserId = uuidv4();
	db.prepare('INSERT INTO users (id,fingerprint, created_at) VALUES (?,?, ?)').run(newUserId, fingerprint, Date.now());

	const newToken = jwt.sign({ userId: newUserId }, JWT_SECRET, { expiresIn: '1d' });
	res.cookie('token', newToken, {
		httpOnly: true,
		sameSite: 'lax',
		secure: false, // true w HTTPS
		maxAge: 1000 * 60 * 60 * 24
	});
	req.userId = newUserId;
	next();
}
