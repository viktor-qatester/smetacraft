# Развёртывание SmetaCraft на Fornex VPS

Прод для тестеров — **этот VPS**, не GitHub Pages. Pages остаётся статическим архивом: API там нет, PDF/DOCX-блок скрыт.

VPS (Cloud NVMe 1, Ubuntu 24.04):

- IP: `31.172.78.193`
- Host: `333428.fornex.cloud`
- Testers: `http://31.172.78.193/` (TLS/домена пока нет)
- Ресурсы: 1 CPU, 1 GB RAM, 10 GB — Node + nginx достаточно. **Chromium на сервер не ставить.**

SSH: `ssh root@31.172.78.193` (пароль только в панели Fornex, не в git).

## Env (обязательно)

Создайте `/etc/smetacraft.env` **на сервере**, не коммитьте:

```
PORT=80
SMETACRAFT_BIND=0.0.0.0
SMETACRAFT_PUBLIC_ORIGIN=http://31.172.78.193,http://333428.fornex.cloud
```

- Без `SMETACRAFT_BIND=0.0.0.0` процесс слушает только `127.0.0.1` и из интернета не виден.
- Без `SMETACRAFT_PUBLIC_ORIGIN` API принимает только loopback (`127.0.0.1` / `localhost`).
- GitHub Pages (`*.github.io`) в список не входит → `403 origin_forbidden`.

Когда появится HTTPS-домен, добавьте его в `SMETACRAFT_PUBLIC_ORIGIN` через запятую и в `<meta name="smetacraft-public-origin">` в `index.html`.

## Консоль Fornex (вкладка «Консоль»)

Команды от root. Node 20+, git, порт 80.

```sh
apt-get update
apt-get install -y ca-certificates curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node -v

mkdir -p /opt
cd /opt
git clone https://github.com/viktor-qatester/smetacraft.git
cd /opt/smetacraft
git checkout master
git pull origin master

node server/db-migrate.cjs

cat >/etc/smetacraft.env <<'EOF'
PORT=80
SMETACRAFT_BIND=0.0.0.0
SMETACRAFT_PUBLIC_ORIGIN=http://31.172.78.193,http://333428.fornex.cloud
EOF
chmod 600 /etc/smetacraft.env
```

Откройте порт 80 в панели Fornex (Firewall) и при необходимости:

```sh
ufw allow OpenSSH
ufw allow 80/tcp
ufw --force enable
```

## Запуск: systemd (предпочтительно)

```sh
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
systemctl status smetacraft --no-pager
```

Проверка с самой машины: `curl -sI http://127.0.0.1/` — ожидается `200`. Снаружи testers открывают `http://31.172.78.193/`.

## Запуск: nohup (если systemd не нужен)

```sh
cd /opt/smetacraft
set -a
. /etc/smetacraft.env
set +a
nohup /usr/bin/node server/server.cjs >/var/log/smetacraft.log 2>&1 &
echo $! >/var/run/smetacraft.pid
```

Остановка: `kill $(cat /var/run/smetacraft.pid)`.

## Обновление кода

```sh
cd /opt/smetacraft
git pull origin master
node server/db-migrate.cjs
systemctl restart smetacraft
```

`data/` не в git — после pull база и blob остаются на диске.

## Бэкап `data/`

SQLite и загруженные PDF/DOCX лежат в `/opt/smetacraft/data/` (вне web root, static URL не отдаёт).

```sh
cp -a /opt/smetacraft/data /root/smetacraft-data-$(date +%F)
```

Восстановление: остановить сервис, скопировать каталог обратно, запустить.

## nginx (необязательно)

Сейчас testers ходят на Node `:80` напрямую. nginx нужен позже для TLS. Пример HTTP reverse proxy, если Node слушает `127.0.0.1:8000` (`PORT=8000`, `SMETACRAFT_BIND=127.0.0.1`):

```
server {
    listen 80;
    server_name 31.172.78.193 333428.fornex.cloud;
    client_max_body_size 6m;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header Origin $http_origin;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Тогда в env: `PORT=8000`, `SMETACRAFT_BIND=127.0.0.1`, `SMETACRAFT_PUBLIC_ORIGIN` без смены (Host с nginx всё равно `31.172.78.193`).

## Что делают testers

1. Открыть `http://31.172.78.193/`
2. Вкладка «Проект» → «Загрузить PDF или DOCX»
3. Preview → поправить вручную то, что не подписано в файле → «Применить»
4. Смета справа. Цены не импортируются.

Если сервис не запущен: страница может не открыться (это Node, не Pages). Если Node жив, а API отклонил origin — в ответе JSON `{ "ok": false, "error": "origin_forbidden" }`.
