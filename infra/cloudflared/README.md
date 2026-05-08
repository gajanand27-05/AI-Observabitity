# Cloudflare Tunnel — local backend → public URL

The Python backend runs on your laptop. Cloudflare Tunnel exposes it to the internet (so Vercel can reach it) without port-forwarding or exposing your home IP.

## Two options

### Option A — Quick tunnel (zero setup, random URL)

Best for getting started. URL is `https://<random>.trycloudflare.com`. URL changes if you stop/start.

```powershell
# After the FastAPI backend is running on http://127.0.0.1:8000:
cloudflared tunnel --url http://127.0.0.1:8000
```

Copy the printed URL into `.env` as `PUBLIC_BACKEND_URL` and `NEXT_PUBLIC_BACKEND_URL`.

### Option B — Named tunnel (stable URL, your own domain)

Use this once we have a working setup and you want a permanent URL. Requires a domain you've added to Cloudflare (free).

1. `cloudflared tunnel login`  *(opens browser, authorise the domain)*
2. `cloudflared tunnel create ai-observability`
3. Edit `config.yml` (copy from `config.yml.example`) — paste the tunnel UUID and pick your hostname.
4. `cloudflared tunnel route dns ai-observability api.<your-domain>`
5. `cloudflared tunnel --config ./config.yml run`

## Install

Download `cloudflared` for Windows from:
https://github.com/cloudflare/cloudflared/releases

Pick `cloudflared-windows-amd64.exe`, rename to `cloudflared.exe`, put it on your PATH.

Verify:
```powershell
cloudflared --version
```
