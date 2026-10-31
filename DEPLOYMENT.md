# Broken Link Scanner — Production Hosting Guide

This guide covers all recommended methods to host your **Broken Link Scanner** in production, ranging from 1-click cloud platforms to dedicated Linux VPS servers with Docker or PM2.

---

## Architecture Overview

The scanner can be deployed in two modes:

| Mode | Components | Best For | Memory Footprint |
| :--- | :--- | :--- | :--- |
| **All-in-One (Single Container)** | Node.js Fastify API + Embedded SPA Dashboard | Railway, Render, Fly.io, Google Cloud Run, single VPS | ~150 MB RAM |
| **Distributed (Docker Compose)** | Node.js Server + Redis 7 + Nginx Reverse Proxy | Heavy workloads (100k+ URLs), high concurrency | ~500 MB RAM |

---

## Option 1: 1-Click Cloud Hosting (PaaS)

### A. Deploy to Railway
Railway automatically detects the root `Dockerfile` and `railway.json`.

1. Push your repository to GitHub / GitLab.
2. Go to [railway.app](https://railway.app/) and click **"New Project"** → **"Deploy from GitHub repo"**.
3. Select your repository.
4. (Optional) Click **"Add a Service"** → **"Database"** → **"Redis"** and connect the `REDIS_URL` variable for Redis-backed deduplication.
5. In **Settings** → **Networking**, click **"Generate Domain"** (e.g. `blc-production.up.railway.app`).
6. Your scanner is live!

---

### B. Deploy to Render
Render natively supports the included `render.yaml`.

1. Go to [render.com](https://render.com/) and connect your GitHub account.
2. Click **"New +"** → **"Blueprint"** and select your repository.
3. Render reads `render.yaml` and starts building the Docker container automatically.
4. When finished, Render gives you a free HTTPS URL (`https://<app-name>.onrender.com`).

---

### C. Deploy to Fly.io
Fly.io runs the Docker container globally on Firecracker microVMs.

```bash
# 1. Install Fly CLI & authenticate
curl -L https://fly.io/install.sh | sh
fly auth login

# 2. Launch the app (auto-detects Dockerfile)
fly launch --name broken-link-scanner --port 3001

# 3. Deploy
fly deploy
```

---

## Option 2: Linux VPS with Docker Compose (Recommended for Production)

Recommended for servers running **Ubuntu 22.04 / 24.04 LTS**, Debian, or AlmaLinux (DigitalOcean, Hetzner, Linode, AWS EC2, etc.).

### Step 1: Install Docker & Docker Compose
```bash
# Update and install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Enable Docker on boot
sudo systemctl enable --now docker
```

### Step 2: Clone Repository & Build
```bash
git clone https://github.com/your-username/broken-link-checker.git
cd broken-link-checker

# Start all services (Redis, Server, Nginx) in detached mode
sudo docker compose up --build -d
```

### Step 3: Verify Running Services
```bash
sudo docker compose ps
```
Your dashboard will now be accessible at `http://<your-server-ip>:8080`.

---

## Setting up Domain & Free SSL (HTTPS)

### Method A: Caddy (Easiest — Automatic Free SSL in 2 Minutes)
Caddy automatically provisions and renews Let's Encrypt SSL certificates with zero maintenance.

1. Install Caddy:
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

2. Edit `/etc/caddy/Caddyfile`:
```caddy
scanner.yourdomain.com {
    reverse_proxy localhost:8080
}
```

3. Reload Caddy:
```bash
sudo systemctl reload caddy
```
Done! `https://scanner.yourdomain.com` is now live with automatic HTTPS.

---

### Method B: Nginx + Certbot (Standard)
1. Install Nginx and Certbot:
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

2. Create `/etc/nginx/sites-available/scanner.conf`:
```nginx
server {
    server_name scanner.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable buffering for live Server-Sent Events (SSE)
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```

3. Enable site and issue SSL:
```bash
sudo ln -s /etc/nginx/sites-available/scanner.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d scanner.yourdomain.com
```

---

## Option 3: Bare Metal / VPS with Node.js & PM2 (No Docker)

If you prefer running without Docker:

```bash
# 1. Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Install PM2 process manager
sudo npm install -g pm2

# 3. Clone and build the project
git clone https://github.com/your-username/broken-link-checker.git
cd broken-link-checker
npm install
npm run build

# 4. Start with PM2
pm2 start packages/server/dist/index.js --name "broken-link-scanner"

# 5. Enable PM2 startup on reboot
pm2 startup
pm2 save
```
The application will run on port `3001` serving both the API and dashboard.

---

## Environment Variables Reference

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3001` | Server listen port |
| `HOST` | `0.0.0.0` | Server host binding (`0.0.0.0` for all interfaces) |
| `NODE_ENV` | `production` | Node environment |
| `USE_REDIS` | `false` | Enable Redis for distributed queue and deduplication |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string (if `USE_REDIS=true`) |
| `MAX_CONCURRENCY` | `30` | Default concurrent crawl workers per scan |
| `REQUEST_TIMEOUT` | `10000` | HTTP timeout in milliseconds (default 10s) |
| `CORS_ORIGIN` | `*` | Allowed CORS origins for API requests |
| `LOG_LEVEL` | `info` | Logging verbosity (`debug`, `info`, `warn`, `error`) |

---

## Performance & System Tuning (100k+ URLs)

When scanning extremely large enterprise domains, raise Linux socket and memory limits:

1. **Increase open file descriptors**:
   Add to `/etc/security/limits.conf`:
   ```text
   * soft nofile 65535
   * hard nofile 65535
   ```

2. **Increase Node.js heap memory** (for in-memory sets over 500k URLs without Redis):
   ```bash
   export NODE_OPTIONS="--max-old-space-size=4096"
   ```
