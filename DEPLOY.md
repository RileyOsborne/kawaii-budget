# Self-Hosting Kawaii Budget

Kawaii Budget is designed to be easily self-hosted using Docker. The image is automatically built and pushed to the GitHub Container Registry (GHCR).

## Quick Start

The simplest way to run Kawaii Budget is using `docker-compose`.

```yaml
services:
  app:
    image: ghcr.io/rileyosborne/kawaii-budget:latest
    container_name: kawaii-budget
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - kawaii-budget-data:/data
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATA_DIR=/data

volumes:
  kawaii-budget-data:
```

## TrueNAS / Custom App Setup

When setting up a Custom App in TrueNAS (or any other container manager), use these settings:

### Port Forwarding / Network
TrueNAS requires specifying both a Container Port and a Host Port:
- **Container Port:** `3000` (**Must be `3000`** — internal server & health check port)
- **Host Port:** `3000` (or any available port on TrueNAS, e.g. `3080`)
- **Protocol:** `TCP`

### Environment Variables
| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Production mode |
| `PORT` | `3000` | HTTP listening port |
| `DATA_DIR` | `/data` | Path to persistent storage |

### Storage (Volumes)
Map a persistent host volume or dataset to:
- **Mount Path:** `/data`
- This ensures your SQLite database, transaction ledgers, goals, and automated daily backup archives are preserved when the container restarts or updates.

## Backup & Data Restore
- Automatic daily backups are created at midnight in `/data/backups/`.
- You can export and download your complete database anytime from the **⚙️ Backup & Docker** tab in the web UI.
- To restore from an existing backup snapshot, simply place your backup archive or `kawaii_budget.sqlite` into the mapped `/data` volume.
