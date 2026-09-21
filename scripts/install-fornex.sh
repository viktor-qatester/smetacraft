#!/bin/sh
# Idempotent install for Fornex VPS. Run as root.
# curl -fsSL https://raw.githubusercontent.com/viktor-qatester/smetacraft/master/scripts/install-fornex.sh | sh
set -eu

apt-get update
apt-get install -y ca-certificates curl git
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

mkdir -p /opt
if [ ! -d /opt/smetacraft/.git ]; then
  git clone https://github.com/viktor-qatester/smetacraft.git /opt/smetacraft
fi
cd /opt/smetacraft
git fetch origin master
git checkout master
git pull origin master

node server/db-migrate.cjs

cat >/etc/smetacraft.env <<'EOF'
PORT=80
SMETACRAFT_BIND=0.0.0.0
SMETACRAFT_PUBLIC_ORIGIN=http://31.172.78.193,http://333428.fornex.cloud
EOF
chmod 600 /etc/smetacraft.env

cat >/etc/systemd/system/smetacraft.service <<'EOF'
[Unit]
Description=SmetaCraft
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/smetacraft
EnvironmentFile=/etc/smetacraft.env
ExecStart=/usr/bin/node server/server.cjs
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now smetacraft
systemctl restart smetacraft
systemctl --no-pager --full status smetacraft || true
echo "OK: open http://31.172.78.193/"
