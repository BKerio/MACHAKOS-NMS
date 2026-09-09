# SSL/HTTPS Activation: machakos.brighton.co.ke

How HTTPS was set up for the NMS-EOC (MACHAKOS-NMS) deployment on `34.30.37.245`. Same pattern as [SSL_ACTIVATION.md](SSL_ACTIVATION.md) (tasks.millenium.co.ke), read that first if this is your first time touching either server. Written after the fact as a runbook — read this before touching nginx or Certbot on this server again.

## Result

| | |
|---|---|
| Live URL | **https://machakos.brighton.co.ke/** |
| Server | `34.30.37.245` (Ubuntu 22.04.5 LTS, hostname `eocsvr`) |
| Web server | nginx 1.18.0 |
| Certificate | Let's Encrypt, RSA, auto-renewing |
| Issued | 2026-09-09 → expires 2026-12-08 |
| Certbot account email | briankerio47@gmail.com |

`http://machakos.brighton.co.ke/` and `http://34.30.37.245/` both redirect (301) to the HTTPS URL above.

## Starting point

Before this work, the app was reachable only at `http://34.30.37.245/`: one nginx site (`nms-eoc`) with `server_name _;` (catch-all, `default_server`) serving the frontend from `/var/www/MACHAKOS-NMS/frontend/dist` and proxying `/api/` and `/socket.io/` to the Node/Fastify backend on `127.0.0.1:3000` (pm2 process `nms-backend`). No domain, no TLS, no Certbot installed. See `.github/workflows/deploy.yml` and `scripts/deploy.sh` for how code gets onto this server — that pipeline only rebuilds the app; it does not touch nginx or certificates, both are managed by hand per this document.

DNS was pointed at this server (`machakos.brighton.co.ke` → `34.30.37.245`) shortly before this work; confirmed via Cloudflare's resolver (1.1.1.1) before proceeding — Google's resolver (8.8.8.8) was still serving a stale cached A record from a previous IP for a while after, which is normal TTL-driven propagation delay, not a config problem.

## What changed

### 1. Split the one catch-all nginx site into two

**`/etc/nginx/sites-available/nms-eoc`**: `server_name` changed from `_` to `machakos.brighton.co.ke`, and dropped `default_server` from both `listen` lines. Nothing else about the app (root, the `/api/` and `/socket.io/` proxy blocks) changed at this point. Backed up first to `/root/nginx-backups/nms-eoc.bak.<timestamp>`.

**`/etc/nginx/sites-available/ip-redirect`** (new): a `default_server` block that catches the bare IP (and anything else that doesn't match the domain) and 301s it to the real domain:

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name 34.30.37.245 _;

    return 301 https://machakos.brighton.co.ke$request_uri;
}
```

Enabled via symlink in `sites-enabled/`, `nginx -t` + `systemctl reload nginx` before moving on.

### 2. Installed Certbot

```bash
sudo apt-get install -y certbot python3-certbot-nginx
```

Installing the `certbot` package on Ubuntu auto-creates and enables `certbot.timer` (systemd); no separate cron/timer setup needed.

### 3. Obtained the certificate

```bash
sudo certbot --nginx -d machakos.brighton.co.ke \
  --non-interactive --agree-tos -m briankerio47@gmail.com --redirect
```

The `--nginx` plugin found the `server_name machakos.brighton.co.ke` block in `nms-eoc`, completed the HTTP-01 challenge through it, then **edited `nms-eoc` itself**: added a `listen 443 ssl` block with the `ssl_certificate`/`ssl_certificate_key` directives, and (because of `--redirect`) turned the plain port-80 block for that domain into a redirect to HTTPS. All Certbot-managed lines are tagged `# managed by Certbot` in the file; don't hand-edit those, re-run Certbot instead.

### 4. Fixed mixed content (frontend/backend still pointed at the old bare-IP HTTP origin)

The frontend had been built with `VITE_API_BASE_URL=http://34.30.37.245/api` and `VITE_SOCKET_URL=http://34.30.37.245`, and the backend had `CORS_ORIGIN=*`. Loaded over HTTPS, browsers block bare-HTTP API/socket calls as mixed content, so the app would look deployed but login/API calls would silently fail.

Fixed by updating, then rebuilding:

- `/var/www/MACHAKOS-NMS/frontend/.env` → `VITE_API_BASE_URL=https://machakos.brighton.co.ke/api`, `VITE_SOCKET_URL=https://machakos.brighton.co.ke`, then `npm run build`.
- `/var/www/MACHAKOS-NMS/backend/.env` → `CORS_ORIGIN=https://machakos.brighton.co.ke` (was `*`), then `pm2 reload nms-backend --update-env`.

Verified afterward: TLS handshake (TLSv1.3), `/api/` proxy returns the backend's JSON health payload over HTTPS, and an `OPTIONS` preflight against `/api/auth/login` with `Origin: https://machakos.brighton.co.ke` comes back with a matching `Access-Control-Allow-Origin`.

The Flutter mobile app (`nccg/`) was checked too — it takes its API base URL via a `--dart-define=API_BASE_URL` build-time flag (`nccg/lib/config/server.dart`), not a hardcoded IP, so it wasn't affected by tightening `CORS_ORIGIN` (CORS is a browser-enforced mechanism anyway; native HTTP clients ignore it). No change needed there.

### 5. Added cache-control headers (preemptively, same stale-bundle bug as the millenium deploy)

nginx wasn't sending `Cache-Control` on anything. Added to `nms-eoc`:

```nginx
location = /index.html {
    add_header Cache-Control "no-cache";
}

location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
}
```

`index.html` is always revalidated (so a new deploy is visible immediately); the hashed `/assets/*` bundle files are cached forever, safe since Vite gives every build new filenames.

## Renewal

Certbot's systemd timer (`certbot.timer`) runs automatically (twice daily, standard Ubuntu package default) and only actually renews when a certificate is within 30 days of expiring. Nothing to schedule manually. Confirmed `enabled` + `active` right after install.

To check it:

```bash
systemctl status certbot.timer
systemctl list-timers certbot.timer
sudo certbot certificates
```

To test renewal without actually renewing:

```bash
sudo certbot renew --dry-run --non-interactive < /dev/null
```

(See [SSL_ACTIVATION.md](SSL_ACTIVATION.md)'s gotcha note: never run `certbot renew --dry-run` without `--non-interactive` over a non-interactive SSH session — it hangs waiting on a prompt with no TTY to answer it.)

## Files touched, for reference

| File | What |
|---|---|
| `/etc/nginx/sites-available/nms-eoc` | `server_name` → domain, dropped `default_server`; Certbot added the 443/SSL block + domain redirect; cache-control locations added |
| `/etc/nginx/sites-available/ip-redirect` | New: bare-IP to HTTPS-domain redirect |
| `/etc/letsencrypt/live/machakos.brighton.co.ke/` | Certificate + key (managed by Certbot, don't touch by hand) |
| `/etc/letsencrypt/renewal/machakos.brighton.co.ke.conf` | Renewal config (authenticator/installer = nginx) |
| `/var/www/MACHAKOS-NMS/frontend/.env` | API/socket URLs → HTTPS domain |
| `/var/www/MACHAKOS-NMS/backend/.env` | `CORS_ORIGIN` → HTTPS domain |
| `/root/nginx-backups/` | Pre-edit backups of `nms-eoc`, timestamped |

## What CI does *not* handle

`.github/workflows/deploy.yml` (via `scripts/deploy.sh`) rebuilds the app on every push to `master` but never touches nginx config, Certbot, or the `.env` files (both are gitignored, by design). If the domain, CORS origin, or nginx routing ever need to change again, it's a manual step on the server; update this document when it happens.
