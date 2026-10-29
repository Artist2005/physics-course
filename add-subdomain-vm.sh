#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Використання:"
  echo "  sudo bash add-subdomain-vm.sh <піддомен.sheua.com> [git_repo_url]"
  echo ""
  echo "Приклад:"
  echo "  sudo bash add-subdomain-vm.sh shop.sheua.com https://github.com/Artist2005/my-shop.git"
  exit 1
fi

SUBDOMAIN="$1"
GIT_REPO="${2:-}"
SITE_ROOT="/var/www/${SUBDOMAIN}"
NGINX_AVAILABLE="/etc/nginx/sites-available/${SUBDOMAIN}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${SUBDOMAIN}"

echo "=== [1/4] Підготовка папки сайту ${SITE_ROOT} ==="
sudo mkdir -p "${SITE_ROOT}"

if [ -n "${GIT_REPO}" ]; then
  TMP_CLONE="/tmp/clone-${SUBDOMAIN}-$$"
  echo "Клонування ${GIT_REPO}..."
  git clone --depth 1 "${GIT_REPO}" "${TMP_CLONE}"
  sudo rm -rf "${SITE_ROOT:?}/"*
  sudo cp -r "${TMP_CLONE}/." "${SITE_ROOT}/"
  sudo rm -rf "${SITE_ROOT}/.git" "${TMP_CLONE}"
elif [ ! -f "${SITE_ROOT}/index.html" ]; then
  cat <<EOF | sudo tee "${SITE_ROOT}/index.html" >/dev/null
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${SUBDOMAIN}</title>
</head>
<body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #111; color: #eee;">
  <h1>Сайт ${SUBDOMAIN} успішно працює!</h1>
</body>
</html>
EOF
fi

if id "www-data" >/dev/null 2>&1; then
  sudo chown -R www-data:www-data "${SITE_ROOT}"
fi
sudo chmod -R 755 "${SITE_ROOT}"

echo "=== [2/4] Створення конфігурації Nginx для ${SUBDOMAIN} ==="
cat <<EOF | sudo tee "${NGINX_AVAILABLE}" >/dev/null
server {
    listen 80;
    listen [::]:80;
    server_name ${SUBDOMAIN};

    root ${SITE_ROOT};
    index index.html;
    charset utf-8;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/html text/javascript application/javascript application/json image/svg+xml;

    location / {
        try_files \$uri \$uri.html \$uri/ /index.html;
    }
}
EOF

sudo ln -sf "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"

echo "=== [3/4] Перевірка та перезавантаження Nginx ==="
sudo nginx -t
sudo systemctl reload nginx

echo "=== [4/4] Випуск безкоштовного SSL-сертифіката (HTTPS) для ${SUBDOMAIN} ==="
if command -v certbot >/dev/null 2>&1; then
  sudo certbot --nginx -d "${SUBDOMAIN}" --non-interactive --agree-tos --redirect --register-unsafely-without-email || \
    echo "⚠️ Якщо DNS для ${SUBDOMAIN} ще не оновився, зачекайте 2 хвилини і виконайте: sudo certbot --nginx -d ${SUBDOMAIN}"
else
  echo "Для HTTPS виконайте: sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d ${SUBDOMAIN}"
fi

echo ""
echo "✅ Готово! Сайт розгорнуто у папці ${SITE_ROOT}"
echo "🌐 Адреса: https://${SUBDOMAIN}"
