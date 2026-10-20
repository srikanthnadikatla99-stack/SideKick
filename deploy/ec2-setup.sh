#!/bin/bash
# One-time EC2 setup: Node, Caddy (HTTPS via <ip>.sslip.io), and SideKick as a systemd service.
# Run as root from a git clone: sudo bash deploy/ec2-setup.sh
set -euo pipefail

NODE_VERSION=24.3.0
CADDY_VERSION=2.8.4
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

id sidekick &>/dev/null || useradd --system --create-home --home-dir /var/lib/sidekick --shell /bin/bash sidekick
id caddy &>/dev/null || useradd --system --create-home --home-dir /var/lib/caddy --shell /sbin/nologin caddy

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

mkdir -p /etc/caddy
cat > /etc/caddy/Caddyfile <<EOF
$HOST {
  reverse_proxy 127.0.0.1:8787
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
holders() { ss -ltnpH 'sport = :8787' | grep -oP 'pid=\K[0-9]+' | sort -u; }
for pid in $(holders); do kill -CONT "$pid"; kill "$pid"; done
sleep 2
for pid in $(holders); do kill -9 "$pid"; done
trap 'systemctl start sidekick; echo "Live service resumed."' EXIT
cd /opt/sidekick/app
sudo -u sidekick -H bash -c "set -a; . /etc/sidekick.env; SIDEKICK_SOURCE=replay SIDEKICK_REPLAY_FILE='$FILE' npx tsx src/main.ts"
EOF
chmod 755 /usr/bin/sidekick-replay

(cd /opt/sidekick/app && sudo -u sidekick -H npm ci --no-audit --no-fund)
systemctl daemon-reload
systemctl enable caddy sidekick
# Restart so a re-run picks up a changed public IP in the Caddyfile.
systemctl restart caddy

echo
echo "Public URL: https://$HOST"
echo "Next: cd /opt/sidekick/app && sudo -u sidekick -H npx bee login && sudo systemctl restart sidekick"
