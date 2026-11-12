#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main}"
WEB_ROOT="/var/www/physics-course"
HUB_ROOT="/var/www/sheua-hub"
DOMAIN_FILE="${WEB_ROOT}/.domain"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== [1/4] Отримання останніх змін із Git (гілка: ${BRANCH}) ==="
cd "${SRC_DIR}"
git fetch origin "${BRANCH}"
git reset --hard "origin/${BRANCH}"

DOMAIN="physics.sheua.com"
if [ -f "${DOMAIN_FILE}" ]; then
  DOMAIN="$(cat "${DOMAIN_FILE}")"
fi

echo "=== [2/4] Оновлення файлів 3D-лабораторії у ${WEB_ROOT} ==="
sudo mkdir -p "${WEB_ROOT}"
if [ "${SRC_DIR}" != "${WEB_ROOT}" ]; then
  sudo cp -r "${SRC_DIR}/index.html" "${SRC_DIR}/404.html" "${SRC_DIR}/about.html" "${SRC_DIR}/privacy.html" "${SRC_DIR}/terms.html" "${SRC_DIR}/manifest.json" "${SRC_DIR}/favicon.svg" "${SRC_DIR}/sitemap.xml" "${SRC_DIR}/robots.txt" "${SRC_DIR}/ads.txt" "${SRC_DIR}/assets" "${SRC_DIR}/sim" "${SRC_DIR}/uk" "${WEB_ROOT}/"
fi

CACHE_VER="$(date +%s)"
sudo find "${WEB_ROOT}" -maxdepth 3 -name "*.html" -exec sed -i -E "s|assets/(app\.js|styles\.css)(\?v=[0-9a-zA-Z._-]+)?|assets/\1?v=${CACHE_VER}|g" {} +

if id "www-data" >/dev/null 2>&1; then
  sudo chown -R www-data:www-data "${WEB_ROOT}"
elif id "nginx" >/dev/null 2>&1; then
  sudo chown -R nginx:nginx "${WEB_ROOT}"
fi
sudo chmod -R 755 "${WEB_ROOT}"

echo "=== [3/4] Оновлення кореневого порталу sheua.com із папки sheua-root ==="
DETECTED_HUB=$(grep -rn "server_name.*sheua\.com" /etc/nginx/ 2>/dev/null | grep -v "physics\." | head -n 1 | cut -d: -f1 | xargs -r grep -E "^\s*root\s+" | head -n 1 | awk '{print $2}' | tr -d ';' || true)
TARGET_HUB="${DETECTED_HUB:-${HUB_ROOT}}"
if [ -d "${SRC_DIR}/sheua-root" ]; then
  sudo mkdir -p "${TARGET_HUB}"
  sudo cp -r "${SRC_DIR}/sheua-root/"* "${TARGET_HUB}/"
  if id "www-data" >/dev/null 2>&1; then
    sudo chown -R www-data:www-data "${TARGET_HUB}"
  fi
  sudo chmod -R 755 "${TARGET_HUB}"
  echo "Оновлено кореневий домен у ${TARGET_HUB}"
fi

echo "=== [4/4] Оновлення правил 404 та заголовків безпеки в Nginx ==="
sudo python3 - << 'PYEOF'
import glob, re

confs = glob.glob('/etc/nginx/sites-available/*') + glob.glob('/etc/nginx/conf.d/*.conf')
for path in set(confs):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            txt = f.read()
    except Exception:
        continue
    if 'physics-course' not in txt and 'sheua' not in txt:
        continue
    orig = txt
    # Fix Soft-404 fallback /index.html -> =404
    txt = re.sub(
        r'try_files\s+\$uri\s+\$uri\.html\s+\$uri/\s+/index\.html\s*;',
        'try_files $uri $uri.html $uri/ =404;',
        txt
    )
    # Ensure error_page 404 /404.html is present before location /
    if 'error_page 404 /404.html;' not in txt:
        txt = txt.replace('location / {', 'error_page 404 /404.html;\n\n    location / {', 1)
    # Ensure 301 canonical redirects for legacy URLs
    if 'rewrite ^/sim/brewster' not in txt and 'physics-course' in txt:
        redirects = (
            '    rewrite ^/sim/brewster(\\.html)?$ /sim/malus permanent;\n'
            '    rewrite ^/uk/sim/brewster(\\.html)?$ /uk/sim/malus permanent;\n'
            '    rewrite ^/sim/chem_arrhenius(\\.html)?$ /sim/chem_kinetics permanent;\n'
            '    rewrite ^/uk/sim/chem_arrhenius(\\.html)?$ /uk/sim/chem_kinetics permanent;\n\n    '
        )
        txt = txt.replace('location / {', redirects + 'location / {', 1)
    # Ensure security headers are inside location / so add_header Cache-Control doesn't strip them
    if 'X-Content-Type-Options' not in txt.split('location / {')[-1]:
        txt = txt.replace(
            'try_files $uri $uri.html $uri/ =404;',
            'add_header Cache-Control "no-cache" always;\n        add_header X-Content-Type-Options "nosniff" always;\n        add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n        add_header X-Frame-Options "SAMEORIGIN" always;\n        try_files $uri $uri.html $uri/ =404;'
        )
    if txt != orig:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(txt)
        print(f'Updated Nginx config: {path}')
PYEOF

sudo nginx -t
sudo systemctl reload nginx

echo "Готово! Обидва домени sheua.com та physics.sheua.com успішно оновлено."
