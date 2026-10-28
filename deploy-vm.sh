#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-sheua.com}"
WEB_ROOT="/var/www/physics-course"
NGINX_AVAILABLE="/etc/nginx/sites-available/physics-course"
NGINX_ENABLED="/etc/nginx/sites-enabled/physics-course"
NGINX_CONF_D="/etc/nginx/conf.d/physics-course.conf"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== [1/4] Перевірка та встановлення Nginx ==="
if ! command -v nginx >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -y
    sudo apt-get install -y nginx
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y nginx
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y nginx
  else
    echo "Встановіть nginx вручну та запустіть скрипт повторно."
    exit 1
  fi
fi

echo "=== [2/4] Копіювання файлів сайту у ${WEB_ROOT} ==="
sudo mkdir -p "${WEB_ROOT}"
sudo rm -rf "${WEB_ROOT:?}/"*
sudo cp -r "${SRC_DIR}/index.html" "${SRC_DIR}/favicon.svg" "${SRC_DIR}/sitemap.xml" "${SRC_DIR}/robots.txt" "${SRC_DIR}/ads.txt" "${SRC_DIR}/assets" "${SRC_DIR}/sim" "${SRC_DIR}/uk" "${WEB_ROOT}/"

if id "www-data" >/dev/null 2>&1; then
  sudo chown -R www-data:www-data "${WEB_ROOT}"
elif id "nginx" >/dev/null 2>&1; then
  sudo chown -R nginx:nginx "${WEB_ROOT}"
fi
sudo chmod -R 755 "${WEB_ROOT}"

echo "=== [3/4] Налаштування віртуального хоста Nginx (server_name: ${DOMAIN}) ==="
SERVER_NAMES="${DOMAIN}"
if [ "${DOMAIN}" != "_" ] && [[ "${DOMAIN}" != www.* ]]; then
  SERVER_NAMES="${DOMAIN} www.${DOMAIN}"
fi

if [ "${DOMAIN}" != "_" ]; then
  echo "${DOMAIN}" | sudo tee "${WEB_ROOT}/.domain" >/dev/null
  sudo sed -i "s|https://sheua.com|https://${DOMAIN}|g; s|https://example.com|https://${DOMAIN}|g" "${WEB_ROOT}/sitemap.xml" "${WEB_ROOT}/robots.txt"
fi

CACHE_VER="$(date +%s)"
sudo find "${WEB_ROOT}" -name "*.html" -exec sed -i -E "s|assets/(app\.js|styles\.css)(\?v=[0-9a-zA-Z._-]+)?|assets/\1?v=${CACHE_VER}|g" {} +

if [ -d "/etc/nginx/sites-available" ]; then
  if [ -f "${NGINX_AVAILABLE}" ] && grep -q "managed by Certbot" "${NGINX_AVAILABLE}"; then
    echo "ℹ️ Знайдено існуючу HTTPS-конфігурацію Certbot у ${NGINX_AVAILABLE} — зберігаємо SSL без перезапису."
  else
    sudo cp "${SRC_DIR}/nginx-vm.conf" "${NGINX_AVAILABLE}"
    sudo sed -i "s/server_name _;/server_name ${SERVER_NAMES};/" "${NGINX_AVAILABLE}"
    sudo ln -sf "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"
    if [ -f "/etc/nginx/sites-enabled/default" ]; then
      sudo rm -f /etc/nginx/sites-enabled/default
    fi
  fi
else
  if [ -f "${NGINX_CONF_D}" ] && grep -q "managed by Certbot" "${NGINX_CONF_D}"; then
    echo "ℹ️ Знайдено існуючу HTTPS-конфігурацію Certbot у ${NGINX_CONF_D} — зберігаємо SSL без перезапису."
  else
    sudo cp "${SRC_DIR}/nginx-vm.conf" "${NGINX_CONF_D}"
    sudo sed -i "s/server_name _;/server_name ${SERVER_NAMES};/" "${NGINX_CONF_D}"
  fi
fi

echo "=== [4/4] Перевірка конфігурації та перезапуск Nginx ==="
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

echo ""
echo "✅ Сайт успішно розгорнуто!"
if [ "${DOMAIN}" != "_" ]; then
  echo "🌐 Адреса: http://${DOMAIN} (також оновлено sitemap.xml і robots.txt)"
  echo "🔒 Щоб увімкнути безкоштовний HTTPS (Let's Encrypt), виконайте:"
  echo "   sudo apt update && sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
else
  echo "🌐 Сайт доступний за IP-адресою вашої віртуальної машини (порт 80)."
fi
