# EphemVid Backend 🎬

The backend of **EphemVid** is a **TypeScript + Express** API responsible for handling ephemeral video uploads, processing, storage, and expiration.  
It enables the frontend SPA to allow users to upload, edit, convert, and download videos **anonymously**, with automatic deletion after 24 hours.  

🌐 Live frontend: [ephemvid.com](https://ephemvid.com)

---

## ⚙️ How It Works

1. **Upload Handling** – Users upload videos (MP4, MOV, WEBM) via HTTPS. Multer temporarily stores files on disk before sending them to AWS S3.  
2. **Processing** – Videos are processed with **FFmpeg** for trimming, cropping, compression, and format conversion.  
3. **Storage** – Processed videos are uploaded to **AWS S3**.  
4. **Security** – Express API is secured with **helmet**, **cors**, and **express-rate-limit** to prevent abuse.  
5. **Delivery** – Videos are served via **CloudFront / Nginx / Cloudflare**, ensuring fast and secure distribution.  
6. **Expiration** – A scheduled cleanup job automatically deletes videos from S3 and associated records from SQLite after 24 hours.  

---

## ✨ Features

- 🔒 Anonymous usage — no permanent accounts  
- 📤 Upload up to 10 videos per account
- 🎬 Video processing:
  - Trim (adjust video length)  
  - Crop (change video frame)  
  - Compress (reduce file size)  
  - Convert between multiple formats  
- ⏳ Automatic deletion after 24 hours  
- ⚡ Security with Helmet, CORS, and rate limiting  

---

## 📂 Supported Formats

**Upload:** MP4 · MOV · WEBM  
**Download:** MP4 · MOV · WEBM · MKV · AVI · GIF  

---

## 🛠️ Tech Stack

- **Language:** TypeScript  
- **Backend Framework:** Express  
- **File Handling:** Multer (temporary disk storage before S3)  
- **Video Processing:** FFmpeg  
- **Storage:** AWS S3  
- **Database:** SQLite (better-sqlite3) for temporary accounts and video metadata
- **Containerization:** Docker (for easy deployment and development)
- **Authentication:** JWT for anonymous user identification  
- **Security:** Helmet, CORS, express-rate-limit  
- **Delivery / Infrastructure:** CloudFront CDN, Nginx reverse proxy, Cloudflare edge security  

---

## 🏗️ Architecture Overview

```text
Client (Frontend SPA)
       |
       | -> Upload video via HTTPS
       v
Express API (TypeScript)
       |
       | -> Multer stores files temporarily on disk
       | -> FFmpeg processes video (trim, crop, compress, convert)
       | -> AWS S3 stores processed video
       | -> SQLite stores anonymous account + video metadata
       | -> JWT identifies anonymous session
       |
       | -> Security: Helmet, CORS, Rate Limit
       v
AWS S3 (Storage)
       |
       | -> Served via CloudFront / Nginx / Cloudflare
[Cleanup Job] -> Deletes expired videos and SQLite records after 24h
```
Created by Gierwin
