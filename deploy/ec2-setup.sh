#!/bin/bash
# One-time EC2 setup: Node, Caddy (HTTPS via <ip>.sslip.io), and SideKick as a systemd service.
# Run as root from a git clone: sudo bash deploy/ec2-setup.sh
set -euo pipefail

NODE_VERSION=24.3.0
CADDY_VERSION=2.8.4
NTFY_VERSION=2.32.0
MODEL_ID="${BEDROCK_MODEL_ID:-us.amazon.nova-pro-v1:0}"
# Bedrock model access and the us.* inference profile live in this region, not necessarily the VM's.
BEDROCK_REGION="${BEDROCK_REGION:-us-east-1}"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
REPO_URL="$(git -C "$SRC" remote get-url origin)"

case "$(uname -m)" in
  aarch64) NODE_ARCH=arm64; CADDY_ARCH=arm64 ;;
  x86_64) NODE_ARCH=x64; CADDY_ARCH=amd64 ;;
  *) echo "Unsupported architecture $(uname -m)"; exit 1 ;;
esac

imds() {
  local token
  token=$(curl -sf -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
  curl -sf -H "X-aws-ec2-metadata-token: $token" "http://169.254.169.254/latest/meta-data/$1"
}
PUBLIC_IP=$(imds public-ipv4)
HOST="${PUBLIC_IP//./-}.sslip.io"

dnf install -y tar gzip xz openssl git
if [[ "$(node -v 2>/dev/null)" != "v$NODE_VERSION" ]]; then
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$NODE_ARCH.tar.xz" | tar -xJ -C /usr/local --strip-components=1
  # sudo's secure_path excludes /usr/local/bin.
  ln -sf /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/npx /usr/bin/
fi
[[ -x /usr/local/bin/caddy ]] || curl -fsSL "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_linux_${CADDY_ARCH}.tar.gz" | tar -xz -C /usr/local/bin caddy
if [[ ! -x /usr/local/bin/ntfy ]]; then
  curl -fsSL "https://github.com/binwiederhier/ntfy/releases/download/v${NTFY_VERSION}/ntfy_${NTFY_VERSION}_linux_${CADDY_ARCH}.tar.gz" | tar -xz -C /tmp
  install -m 755 "/tmp/ntfy_${NTFY_VERSION}_linux_${CADDY_ARCH}/ntfy" /usr/local/bin/ntfy
fi

id sidekick &>/dev/null || useradd --system --create-home --home-dir /var/lib/sidekick --shell /bin/bash sidekick
id caddy &>/dev/null || useradd --system --create-home --home-dir /var/lib/caddy --shell /sbin/nologin caddy
id ntfy &>/dev/null || useradd --system --create-home --home-dir /var/lib/ntfy --shell /sbin/nologin ntfy

if [[ ! -d /opt/sidekick/app/.git ]]; then
  install -d -o sidekick -g sidekick /opt/sidekick
  sudo -u sidekick -H git clone "$REPO_URL" /opt/sidekick/app
fi

if [[ ! -f /etc/sidekick.env ]]; then
  umask 027
  cat > /etc/sidekick.env <<EOF
SIDEKICK_SOURCE=live
SIDEKICK_HOST=127.0.0.1
SIDEKICK_PORT=8787
SIDEKICK_TOKEN=$(openssl rand -hex 32)
SIDEKICK_DB=/var/lib/sidekick/sidekick.db
AWS_REGION=$BEDROCK_REGION
BEDROCK_MODEL_ID=$MODEL_ID
EOF
  chown root:sidekick /etc/sidekick.env
  umask 022
fi

# Private ntfy server: the iPhone app mirrors its notifications (with action buttons) to the watch.
mkdir -p /etc/ntfy
cat > /etc/ntfy/server.yml <<EOF
base-url: "https://ntfy.$HOST"
listen-http: "127.0.0.1:2586"
behind-proxy: true
cache-file: "/var/lib/ntfy/cache.db"
cache-duration: "2h"
auth-file: "/var/lib/ntfy/user.db"
auth-default-access: "deny-all"
# Only a content-free "poll request" goes upstream so iOS can wake up; messages stay on this server.
upstream-base-url: "https://ntfy.sh"
EOF

cat > /etc/systemd/system/ntfy.service <<'EOF'
[Unit]
Description=ntfy notifications for SideKick
After=network-online.target
[Service]
User=ntfy
ExecStart=/usr/local/bin/ntfy serve --config /etc/ntfy/server.yml
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF
# The ntfy user/token CLI refuses to run until the server has created its auth database.
systemctl daemon-reload
systemctl restart ntfy
for _ in $(seq 1 20); do [[ -f /var/lib/ntfy/user.db ]] && break; sleep 0.5; done
[[ -f /var/lib/ntfy/user.db ]] || { echo "ntfy did not start:"; journalctl -u ntfy -n 20 --no-pager; exit 1; }

if ! grep -q '^NTFY_TOKEN=' /etc/sidekick.env; then
  TOPIC="sidekick-$(openssl rand -hex 8)"
  PHONE_PASSWORD=$(openssl rand -hex 12)
  ntfyctl() { sudo -u ntfy env NTFY_PASSWORD="${NTFY_PASSWORD:-}" /usr/local/bin/ntfy "$@"; }
  # Remove leftovers from an earlier interrupted run so re-running is safe.
  ntfyctl user del sidekick >/dev/null 2>&1 || true
  ntfyctl user del phone >/dev/null 2>&1 || true
  NTFY_PASSWORD=$(openssl rand -hex 16) ntfyctl user add sidekick
  ntfyctl access sidekick "$TOPIC" write-only
  NTFY_TOKEN=$(ntfyctl token add sidekick | grep -oE 'tk_[A-Za-z0-9]+' | head -1)
  NTFY_PASSWORD="$PHONE_PASSWORD" ntfyctl user add phone
  ntfyctl access phone "$TOPIC" read-only
  cat >> /etc/sidekick.env <<EOF
NTFY_URL=http://127.0.0.1:2586
NTFY_TOPIC=$TOPIC
NTFY_TOKEN=$NTFY_TOKEN
SIDEKICK_PUBLIC_URL=https://$HOST
EOF
  umask 077
  cat > /root/sidekick-ntfy.txt <<EOF
Server:   https://ntfy.$HOST
Topic:    $TOPIC
Username: phone
Password: $PHONE_PASSWORD
EOF
  umask 022
fi

mkdir -p /etc/caddy
cat > /etc/caddy/Caddyfile <<EOF
$HOST {
  reverse_proxy 127.0.0.1:8787
}
ntfy.$HOST {
  reverse_proxy 127.0.0.1:2586
}
EOF

cat > /etc/systemd/system/caddy.service <<'EOF'
[Unit]
Description=Caddy HTTPS proxy for SideKick
After=network-online.target
Wants=network-online.target
[Service]
User=caddy
Environment=XDG_DATA_HOME=/var/lib/caddy XDG_CONFIG_HOME=/var/lib/caddy
AmbientCapabilities=CAP_NET_BIND_SERVICE
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/sidekick.service <<'EOF'
[Unit]
Description=SideKick
After=network-online.target
[Service]
User=sidekick
WorkingDirectory=/opt/sidekick/app
EnvironmentFile=/etc/sidekick.env
ExecStart=/opt/sidekick/app/node_modules/.bin/tsx src/main.ts
Restart=on-failure
RestartSec=10
[Install]
WantedBy=multi-user.target
EOF

cat > /usr/bin/sidekick-update <<'EOF'
#!/bin/bash
set -euo pipefail
cd /opt/sidekick/app
sudo -u sidekick -H git pull --ff-only
sudo -u sidekick -H npm ci --no-audit --no-fund
systemctl restart sidekick
systemctl --no-pager status sidekick | head -5
EOF
chmod 755 /usr/bin/sidekick-update

cat > /usr/bin/sidekick-replay <<'EOF'
#!/bin/bash
# Usage: sudo sidekick-replay <file.jsonl>  (pauses the live service; Ctrl+C resumes it)
set -euo pipefail
FILE="${1:?usage: sudo sidekick-replay <file.jsonl>}"
systemctl stop sidekick
# Earlier manual runs can outlive their terminal (or be suspended with Ctrl+Z) and keep holding
# the port; tsx rewrites the process title, so find them by port rather than by command line.
holders() { ss -ltnpH 'sport = :8787' | grep -oP 'pid=\K[0-9]+' | sort -u || true; }
for pid in $(holders); do kill -CONT "$pid" 2>/dev/null || true; kill "$pid" 2>/dev/null || true; done
for _ in $(seq 1 10); do [[ -z "$(holders)" ]] && break; sleep 0.5; done
for pid in $(holders); do kill -9 "$pid" 2>/dev/null || true; done
sleep 0.5
if [[ -n "$(holders)" ]]; then
  echo "Port 8787 is still in use:"; ss -ltnp 'sport = :8787'; systemctl start sidekick; exit 1
fi
trap 'systemctl start sidekick; echo "Live service resumed."' EXIT
cd /opt/sidekick/app
# Replays use a throwaway memory so test people never leak into the live one.
rm -f /var/lib/sidekick/replay.db*
sudo -u sidekick -H bash -c "set -a; . /etc/sidekick.env; SIDEKICK_DB=/var/lib/sidekick/replay.db SIDEKICK_SOURCE=replay SIDEKICK_REPLAY_FILE='$FILE' npx tsx src/main.ts"
EOF
chmod 755 /usr/bin/sidekick-replay

(cd /opt/sidekick/app && sudo -u sidekick -H npm ci --no-audit --no-fund)
systemctl daemon-reload
systemctl enable caddy ntfy sidekick
# Restart so a re-run picks up a changed public IP and notification settings.
systemctl restart ntfy caddy
systemctl try-restart sidekick

echo
echo "Public URL: https://$HOST"
echo "Wrist notifications: subscribe in the ntfy iPhone app with:"
cat /root/sidekick-ntfy.txt 2>/dev/null || echo "(not found: /root/sidekick-ntfy.txt)"
echo "Next (first install only): cd /opt/sidekick/app && sudo -u sidekick -H npx bee login && sudo systemctl restart sidekick"
