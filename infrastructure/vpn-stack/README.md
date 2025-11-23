# VPN Stack

Docker Compose stack for secure torrent downloading through ProtonVPN using Gluetun.

## Services

| Service | Port | Description |
|---------|------|-------------|
| **Gluetun** | - | VPN container (ProtonVPN + WireGuard) |
| **qBittorrent** | 8090 | Torrent client (routed through VPN) |
| **Prowlarr** | 9696 | Indexer manager (routed through VPN) |
| **FlareSolverr** | 8191 | Cloudflare bypass proxy |

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │              Gluetun VPN                │
                    │         (ProtonVPN/WireGuard)           │
                    │                                         │
Internet ◄──────────┤   ┌─────────────┐  ┌─────────────┐     │
                    │   │ qBittorrent │  │   Prowlarr  │     │
                    │   │   :8090     │  │    :9696    │     │
                    │   └─────────────┘  └─────────────┘     │
                    └─────────────────────────────────────────┘

                    ┌─────────────────┐
Internet ◄──────────┤  FlareSolverr   │  (Direct connection)
                    │     :8191       │
                    └─────────────────┘
```

## Setup

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Add your ProtonVPN WireGuard private key to `.env`:
   - Get your key from: https://account.protonvpn.com/downloads
   - Select WireGuard configuration

3. Create required directories on your NAS:
   ```bash
   mkdir -p /volume3/docker/storagami/vpn-project/gluetun
   mkdir -p /volume3/docker/storagami/vpn-project/qbittorrent
   mkdir -p /volume3/docker/storagami/vpn-project/prowlarr
   mkdir -p /volume1/media/torrents
   ```

4. Start the stack:
   ```bash
   docker-compose up -d
   ```

## Access

- **qBittorrent**: http://your-nas-ip:8090
- **Prowlarr**: http://your-nas-ip:9696
- **FlareSolverr**: http://your-nas-ip:8191

## Port Forwarding

Gluetun is configured to automatically update qBittorrent's listening port when ProtonVPN assigns a forwarded port. This enables better torrent connectivity.

## Network Configuration

- Uses `synobridge` network mode (Synology NAS compatible)
- qBittorrent and Prowlarr traffic routed through Gluetun VPN
- FlareSolverr runs on direct connection (not through VPN)
- Firewall allows outbound to: `172.20.0.0/16`, `192.168.4.0/24`

## Volumes

| Container | Host Path | Container Path |
|-----------|-----------|----------------|
| Gluetun | `/volume3/docker/storagami/vpn-project/gluetun` | `/gluetun` |
| qBittorrent | `/volume3/docker/storagami/vpn-project/qbittorrent` | `/config` |
| qBittorrent | `/volume1/media/torrents` | `/media/torrents` |
| Prowlarr | `/volume3/docker/storagami/vpn-project/prowlarr` | `/config` |

## User/Group IDs

All containers run with:
- **PUID**: 1027
- **PGID**: 65536

Adjust these to match your NAS user permissions.

## Troubleshooting

### Check VPN connection
```bash
docker exec gluetun wget -qO- https://ipinfo.io
```

### View Gluetun logs
```bash
docker logs gluetun
```

### Restart the stack
```bash
docker-compose down && docker-compose up -d
```
