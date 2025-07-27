import { exec, spawn } from 'child_process';
import path from 'path';
import { editOptions } from './interfaces';
function secondsToTime(seconds: number) {
	const hrs = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	const secs = (seconds % 60).toFixed(3);

	return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${secs.padStart(6, '0')}`;
}

export function getInfo(path: string): Promise<{ duration: number; size: number }> {
	return new Promise((resolve, reject) => {
		const ffprobe = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'format=duration,size', '-of', 'default=noprint_wrappers=1:nokey=1', path]);

		let stdout = '';
		let stderr = '';

		ffprobe.stdout.on('data', data => {
			stdout += data.toString();
		});

		ffprobe.stderr.on('data', data => {
			stderr += data.toString();
		});

		ffprobe.on('close', code => {
			if (code !== 0) {
				return reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
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

export function ffmpegEdit(options: editOptions, duration: number, inputPath: string, outputPath: string) {
	return new Promise<void>((resolve, reject) => {
		let command = `ffmpeg -i "${inputPath}"`;
		if (options.startTime !== undefined && options.endTime !== undefined) {
			if (options.startTime > options.endTime || options.startTime < 0 || options.endTime < 0) {
				return reject(new Error('Timestamps to cut video are invalid'));
			}
			command += ` -ss ${secondsToTime(options.startTime)} -to ${secondsToTime(options.endTime)}`;
			duration = options.endTime - options.startTime;
			if (duration <= 0) {
				return reject(new Error('Invalid duration for compression'));
			}
		}

		if (options.cropX !== undefined && options.cropY !== undefined && options.cropWidth !== undefined && options.cropHeight !== undefined) {
			command += ` -filter:v "crop=${options.cropWidth}:${options.cropHeight}:${options.cropX}:${options.cropY}"`;
		}

		if (options.compressTo !== undefined) {
			if (options.compressTo <= 0) {
				return reject(new Error('Wrong size to compress'));
			}
			if (path.extname(inputPath).toLowerCase() == '.gif') {
				return reject(new Error('Cannot compress gifs'));
			}
			const newBitrate = Math.floor((options.compressTo * 8) / Math.ceil(duration));
			const audioBitrate = 96; //KBps
			const videoBitrate = newBitrate - audioBitrate;
			if (videoBitrate <= 0) {
				return reject(new Error('New bitrate is too low , increase bitrate or shorten the video'));
			}

			if (path.extname(outputPath).toLowerCase() === '.webm') {
				command += ` -c:v libvpx-vp9 -b:v ${videoBitrate}k -c:a libopus -b:a ${audioBitrate}k`;
			} else {
				command += ` -c:v libx264 -preset fast -b:v ${videoBitrate}k -maxrate ${videoBitrate}k -bufsize ${videoBitrate * 2}k -c:a aac -b:a ${audioBitrate}k`;
			}
		}
		command += ` "${outputPath}"`;
		exec(command, { timeout: 80000 }, (error, stdout, stderr) => {
			if (error) {
				console.error('FFmpeg error:', stderr || error.message);
				return reject(error);
			}
			resolve();
		});
	});
}

export function ffmpegDownload(inputPath: string, extension: string) {
	const outputFormat = extension.toLowerCase();
	const args = ['-i', inputPath];
	args.push('-movflags', 'frag_keyframe+empty_moov');

	switch (outputFormat) {
		case 'webm':
			args.push('-f', 'webm', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-speed', '4', '-c:a', 'libopus');
			break;
		case 'mp4':
			args.push('-f', 'mp4', '-c:v', 'libx264', '-c:a', 'aac');
			break;
		case 'mkv':
			args.push('-f', 'matroska', '-c:v', 'libx264', '-c:a', 'aac');
			break;
		case 'avi':
			args.push('-f', 'avi', '-c:v', 'mpeg4', '-c:a', 'mp3');
			break;
		case 'mov':
			args.push('-f', 'mov', '-c:v', 'libx264', '-c:a', 'aac');
			break;
		case 'gif':
			args.push('-vf', 'fps=15,scale=640:-1:flags=lanczos', '-f', 'gif', '-loop', '0', '-an', '-pix_fmt', 'rgb24');
			break;
		default:
			throw new Error(`Unsupported format: ${outputFormat}`);
	}

	args.push('-');

	return spawn('ffmpeg', args);
}
