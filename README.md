---
title: Broken Link Scanner
emoji: 🔗
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 3001
pinned: false
---

# Broken Link Scanner 🚀

> High-performance, production-ready broken link crawler and real-time diagnostic dashboard built without artificial page limits or scan caps.

![Broken Link Scanner](https://img.shields.io/badge/License-MIT-blue.svg)
![Node](https://img.shields.io/badge/Node-20%2B-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)

---

## Key Features

- ⚡ **Unlimited BFS Crawling**: Recursively crawls entire origins without arbitrary depth or page caps.
- 🚀 **High-Throughput Network Engine**: Lightweight `HEAD` probes with automatic scoped `GET` fallback (`Range: bytes=0-8192`) on 405/406/403.
- 🧠 **Global Deduplication**: `xxHash64` memory sets or Redis sets to guarantee no URL is verified twice during a session.
- 📡 **Real-Time Streaming**: Live scan progress, queue size, speed (pages/sec), and link diagnostics streamed via Server-Sent Events (SSE) and WebSockets.
- 🎨 **Light & Dark Theme**: Built-in instant theme switcher with persistent preference and high-contrast UI.
- 📊 **Targeted Exports**: Export filtered datasets directly to CSV or JSON (e.g. Broken Only, HTTP Errors 4xx/5xx, Timeouts, DNS, etc.).
- 📋 **One-Click Anchor / Alt Copy**: Inline clipboard copy for all discovered anchor texts and image alt tags.
- 🐳 **All-in-One or Distributed**: Single container or Docker Compose (Redis + Nginx).

---

## Tech Stack

- **Crawler Engine**: Node.js / TypeScript, `undici` connection pooling, `cheerio` HTML parsing, `robots-parser`.
- **Backend API**: Fastify v5, `@fastify/websocket`, `@fastify/cors`, `@fastify/static`, Server-Sent Events (SSE).
- **Frontend Dashboard**: React 19, Vite 6, Tailwind CSS, TanStack Virtual Table (renders 50,000+ rows without lag), Lucide Icons.
- **Queue / Storage**: In-memory xxHash Set (default) or Redis 7 (optional for multi-container clusters).

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 20+
- npm 9+

### Installation & Run

```bash
# Clone the repository
git clone https://github.com/your-username/broken-link-checker.git
cd broken-link-checker

# Install all workspace dependencies
npm install

# Build all packages
npm run build

# Run both backend API (3001) and frontend dashboard (5173) in dev mode
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Hosting in Production

Complete hosting instructions are available in [DEPLOYMENT.md](file:///c:/Users/mak/WorkSpace/Tools/broken-link-checker/DEPLOYMENT.md).

### 1. Docker Compose (VPS / Server)
```bash
docker compose up --build -d
```
Access dashboard at `http://your-server-ip:8080`.

### 2. Single Docker Container (Railway, Render, Fly.io, Cloud Run)
```bash
docker build -t broken-link-checker .
docker run -p 3001:3001 broken-link-checker
```
Access dashboard at `http://localhost:3001`.

### 3. Node.js with PM2 (Bare Metal / VPS)
```bash
npm install
npm run build
pm2 start packages/server/dist/index.js --name "broken-link-scanner"
```

---

## License

MIT
