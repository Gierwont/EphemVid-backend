import { exec } from 'child_process';
import path from 'path';

export function getInfo(path: string): Promise<{ duration: number; size: number }> {
	return new Promise((resolve, reject) => {
		const command = `ffprobe -v error -select_streams v:0 -show_entries format=duration,size -of default=noprint_wrappers=1:nokey=1 "${path}"`;

		exec(command, (err, stdout) => {
			if (err) {
				return reject(err);
			}

			const output = stdout.trim().split(/\r?\n/);

			if (output.length < 2) {
				return reject(new Error('Invalid ffprobe output'));
			}

			const duration = parseFloat(output[0]);
			const size = parseInt(output[1]);

			if (isNaN(duration) || isNaN(size)) {
				return reject(new Error('Could not parse duration or size'));
			}

			resolve({ duration, size });
		});
	});
}

export function createGif(path: string, outputPath: string) {
	return new Promise<void>((resolve, reject) => {
		const command = `ffmpeg -i ${path} -vf "fps=15,scale=480:-1:flags=lanczos" -loop 0 ${outputPath}`;

		exec(command, { timeout: 60000 }, (error, stdout, stderr) => {
			if (error) {
				console.error('FFmpeg error while creating gif:', stderr);
				return reject(error);
			}
			resolve();
		});
	});
}
