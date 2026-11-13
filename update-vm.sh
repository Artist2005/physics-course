#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main}"
WEB_ROOT="/var/www/physics-course"
HUB_ROOT="/var/www/sheua-hub"
DOMAIN_FILE="${WEB_ROOT}/.domain"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

sudo -v

echo "=== [1/5] Отримання останніх змін із Git (гілка: ${BRANCH}) ==="
if [ -d "${SRC_DIR}/.git" ]; then
  sudo chown -R "$(id -u):$(id -g)" "${SRC_DIR}" || true
fi
git config --global --add safe.directory "${SRC_DIR}" || true
sudo git config --system --add safe.directory "${SRC_DIR}" 2>/dev/null || true

cd "${SRC_DIR}"
git -c safe.directory="${SRC_DIR}" fetch origin "${BRANCH}"
git -c safe.directory="${SRC_DIR}" reset --hard "origin/${BRANCH}"

DOMAIN="physics.sheua.com"
if [ -f "${DOMAIN_FILE}" ]; then
  DOMAIN="$(cat "${DOMAIN_FILE}")"
fi

echo "=== [2/5] Оновлення файлів 3D-лабораторії у ${WEB_ROOT} ==="
sudo mkdir -p "${WEB_ROOT}"
if [ "$(realpath "${SRC_DIR}")" != "$(realpath "${WEB_ROOT}")" ]; then
  sudo cp -a "${SRC_DIR}/index.html" "${SRC_DIR}/404.html" "${SRC_DIR}/about.html" "${SRC_DIR}/privacy.html" "${SRC_DIR}/terms.html" "${SRC_DIR}/manifest.json" "${SRC_DIR}/favicon.svg" "${SRC_DIR}/sitemap.xml" "${SRC_DIR}/robots.txt" "${SRC_DIR}/ads.txt" "${SRC_DIR}/assets" "${SRC_DIR}/sim" "${SRC_DIR}/uk" "${SRC_DIR}/sheua-root" "${WEB_ROOT}/"
fi

CACHE_VER="$(date +%s)"
sudo find "${WEB_ROOT}" -maxdepth 3 -name "*.html" ! -path "${WEB_ROOT}/sheua-root/*" -exec sed -i -E "s#assets/(app\.js|styles\.css)(\?v=[0-9a-zA-Z._-]+)?#assets/\1?v=${CACHE_VER}#g" {} +

WEB_OWNER=""
if id "www-data" >/dev/null 2>&1; then
  WEB_OWNER="www-data:www-data"
elif id "nginx" >/dev/null 2>&1; then
  WEB_OWNER="nginx:nginx"
fi

if [ -n "${WEB_OWNER}" ]; then
  sudo chown "${WEB_OWNER}" "${WEB_ROOT}"
  sudo find "${WEB_ROOT}" -mindepth 1 -maxdepth 1 ! -name ".git" -exec chown -R "${WEB_OWNER}" {} +
fi
sudo find "${WEB_ROOT}" -mindepth 1 -maxdepth 1 ! -name ".git" -exec chmod -R u=rwX,go=rX {} +

echo "=== [3/5] Оновлення кореневого порталу sheua.com із папки sheua-root ==="
if [ -d "${SRC_DIR}/sheua-root" ]; then
  HUB_LIST="$(sudo python3 - "${HUB_ROOT}" << 'PYHUB'
import glob, re, sys

roots = [sys.argv[1]]
confs = (
    glob.glob('/etc/nginx/sites-enabled/*')
    + glob.glob('/etc/nginx/sites-available/*')
    + glob.glob('/etc/nginx/conf.d/*.conf')
)
for p in sorted(set(confs)):
    try:
        txt = open(p, 'r', encoding='utf-8', errors='ignore').read()
    except Exception:
        continue
    for block in re.split(r'(?=\bserver\s*\{)', txt):
        sn = re.findall(r'server_name\s+([^;]+);', block)
        if not sn:
            continue
        names = ' '.join(sn)
        if 'sheua.com' in names and 'physics.sheua.com' not in names:
            for rm in re.findall(r'^\s*root\s+([^;\s]+)\s*;', block, flags=re.M):
                if rm not in roots and rm != '/var/www/physics-course':
                    roots.append(rm)
for r in roots:
    print(r)
PYHUB
  )"

  SRC_SHEUA_REAL="$(realpath "${SRC_DIR}/sheua-root")"
  while IFS= read -r TARGET_HUB; do
    [ -z "${TARGET_HUB}" ] && continue
    sudo mkdir -p "${TARGET_HUB}"
    if [ "$(realpath "${TARGET_HUB}")" != "${SRC_SHEUA_REAL}" ]; then
      sudo cp -a "${SRC_DIR}/sheua-root/." "${TARGET_HUB}/"
    fi
    if [ -n "${WEB_OWNER}" ]; then
      sudo chown -R "${WEB_OWNER}" "${TARGET_HUB}"
    fi
    sudo chmod -R u=rwX,go=rX "${TARGET_HUB}"
    echo "Оновлено кореневий домен sheua.com у ${TARGET_HUB}"
  done <<< "${HUB_LIST}"
fi

echo "=== [4/5] Оновлення правил ads.txt, редиректів та 404 у Nginx ==="
sudo python3 - << 'PYEOF'
import glob, re, subprocess

confs = glob.glob('/etc/nginx/sites-available/*') + glob.glob('/etc/nginx/conf.d/*.conf')
for path in sorted(set(confs)):
    if path.endswith('.bak'):
        continue
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
    if 'error_page 404 /404.html;' not in txt and 'location / {' in txt:
        txt = txt.replace('location / {', 'error_page 404 /404.html;\n\n    location / {', 1)

    # Fix chem_arrhenius canonical 301 target to chem_orders
    txt = txt.replace('/sim/chem_arrhenius(\\.html)?$ /sim/chem_kinetics permanent;', '/sim/chem_arrhenius(\\.html)?$ /sim/chem_orders permanent;')
    txt = txt.replace('/uk/sim/chem_arrhenius(\\.html)?$ /uk/sim/chem_kinetics permanent;', '/uk/sim/chem_arrhenius(\\.html)?$ /uk/sim/chem_orders permanent;')

    # Ensure 301 canonical redirects for legacy URLs on physics.sheua.com
    if 'rewrite ^/sim/brewster' not in txt and 'physics-course' in txt and 'location / {' in txt:
        redirects = (
            '    rewrite ^/sim/brewster(\\.html)?$ /sim/malus permanent;\n'
            '    rewrite ^/uk/sim/brewster(\\.html)?$ /uk/sim/malus permanent;\n'
            '    rewrite ^/sim/chem_arrhenius(\\.html)?$ /sim/chem_orders permanent;\n'
            '    rewrite ^/uk/sim/chem_arrhenius(\\.html)?$ /uk/sim/chem_orders permanent;\n\n    '
        )
        txt = txt.replace('location / {', redirects + 'location / {', 1)

    # Ensure explicit location = /ads.txt block
    if 'location = /ads.txt' not in txt and 'location / {' in txt:
        ads_block = (
            'location = /ads.txt {\n'
            '        default_type text/plain;\n'
            '        add_header Cache-Control "public, max-age=3600" always;\n'
            '        add_header X-Content-Type-Options "nosniff" always;\n'
            '        try_files /ads.txt =404;\n'
            '    }\n\n    '
        )
        txt = txt.replace('location / {', ads_block + 'location / {', 1)

    # Ensure security headers inside location /
    if 'location / {' in txt and 'X-Content-Type-Options' not in txt.split('location / {')[-1]:
        txt = txt.replace(
            'try_files $uri $uri.html $uri/ =404;',
            'add_header Cache-Control "no-cache" always;\n        add_header X-Content-Type-Options "nosniff" always;\n        add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n        add_header X-Frame-Options "SAMEORIGIN" always;\n        try_files $uri $uri.html $uri/ =404;'
        )

    if txt != orig:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(txt)
        chk = subprocess.run(['nginx', '-t'], capture_output=True)
        if chk.returncode != 0:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(orig)
            print(f'Skipped Nginx patch for {path} (kept existing valid config)')
        else:
            print(f'Updated Nginx config: {path}')
PYEOF

sudo nginx -t
sudo systemctl reload nginx

echo "=== [5/5] Перевірка доступності ads.txt та нових розділів sheua.com ==="
for CHECK_URL in \
  "https://sheua.com/" \
  "https://sheua.com/ads.txt" \
  "https://sheua.com/mechanics-conservation.html" \
  "https://sheua.com/si-constants-handbook.html" \
  "https://physics.sheua.com/ads.txt"; do
  STATUS="$(curl -ksIL --max-time 8 -o /dev/null -w '%{http_code}' "${CHECK_URL}" || echo 'ERR')"
  echo "  ${STATUS}  ${CHECK_URL}"
done

echo "Готово! Обидва домени sheua.com та physics.sheua.com успішно оновлено."
