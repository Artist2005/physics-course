#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main}"
WEB_ROOT="/var/www/physics-course"
DOMAIN_FILE="${WEB_ROOT}/.domain"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== [1/3] Отримання останніх змін із Git (гілка: ${BRANCH}) ==="
cd "${SRC_DIR}"
git fetch origin "${BRANCH}"
git reset --hard "origin/${BRANCH}"

DOMAIN="sheua.com"
if [ -f "${DOMAIN_FILE}" ]; then
  DOMAIN="$(cat "${DOMAIN_FILE}")"
fi

echo "=== [2/3] Оновлення файлів сайту у ${WEB_ROOT} ==="
sudo mkdir -p "${WEB_ROOT}"
sudo cp -r "${SRC_DIR}/index.html" "${SRC_DIR}/favicon.svg" "${SRC_DIR}/sitemap.xml" "${SRC_DIR}/robots.txt" "${SRC_DIR}/ads.txt" "${SRC_DIR}/assets" "${SRC_DIR}/sim" "${SRC_DIR}/uk" "${WEB_ROOT}/"

if [ "${DOMAIN}" != "_" ] && [ -n "${DOMAIN}" ]; then
  sudo sed -i "s|https://sheua.com|https://${DOMAIN}|g; s|https://example.com|https://${DOMAIN}|g" "${WEB_ROOT}/sitemap.xml" "${WEB_ROOT}/robots.txt"
fi

if id "www-data" >/dev/null 2>&1; then
  sudo chown -R www-data:www-data "${WEB_ROOT}"
elif id "nginx" >/dev/null 2>&1; then
  sudo chown -R nginx:nginx "${WEB_ROOT}"
fi
sudo chmod -R 755 "${WEB_ROOT}"

echo "=== [3/3] Перевірка та м'яке перезавантаження Nginx (без скидання SSL) ==="
sudo nginx -t
sudo systemctl reload nginx

echo "✅ Сайт успішно оновлено з гілки origin/${BRANCH}!"
