import multer from 'multer';
import path from 'path';
import { randomBytes } from 'crypto';

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, 'storage/');
	},
	filename: (req, file, cb) => {
		const extName = path.extname(file.originalname);
		const sanitizeFilename = (name: string) => name.replace(/[^a-zA-Z0-9\-_.]/g, '');
		const baseName = sanitizeFilename(path.basename(file.originalname, extName));
		const randomSuffix = randomBytes(2).toString('hex');
		cb(null, `${baseName}_${randomSuffix}${extName}`);
	}
});

const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
	const supportedMimetypes = [
		'video/mp4',
		'video/quicktime', // .mov
		'video/webm'
	];
	const supportedExtensions = ['.mp4', '.mov', '.webm'];

	if (supportedMimetypes.includes(file.mimetype) && supportedExtensions.includes(path.extname(file.originalname).toLowerCase())) {
		cb(null, true);
	} else {
		cb(new Error('Wrong type of file'));
	}
};

const upload = multer({
	storage,
	fileFilter,
	limits: {
		fileSize: 200 * 1024 * 1024
	}
});
export default upload;
