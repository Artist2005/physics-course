#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main}"
WEB_ROOT="/var/www/physics-course"
HUB_ROOT="/var/www/sheua-hub"
DOMAIN_FILE="${WEB_ROOT}/.domain"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

echo "=== [4/5] Оновлення 301-редиректів, ads.txt та 404 у Nginx ==="
sudo python3 - << 'PYEOF'
import glob, re, subprocess

HUB_REDIRECTS = """    # BEGIN SHEUA SEO REDIRECTS
    if ($host = www.sheua.com) {
        return 301 https://sheua.com$request_uri;
    }
    rewrite ^/sim/brewster(\\.html)?$ https://physics.sheua.com/sim/malus permanent;
    rewrite ^/uk/sim/brewster(\\.html)?$ https://physics.sheua.com/uk/sim/malus permanent;
    rewrite ^/sim/chem_arrhenius(\\.html)?$ https://physics.sheua.com/sim/chem_orders permanent;
    rewrite ^/uk/sim/chem_arrhenius(\\.html)?$ https://physics.sheua.com/uk/sim/chem_orders permanent;
    rewrite ^/sim/([^/.?]+)\\.html$ https://physics.sheua.com/sim/$1 permanent;
    rewrite ^/sim/([^/.?]+)$ https://physics.sheua.com/sim/$1 permanent;
    rewrite ^/uk/sim/([^/.?]+)\\.html$ https://physics.sheua.com/uk/sim/$1 permanent;
    rewrite ^/uk/sim/([^/.?]+)$ https://physics.sheua.com/uk/sim/$1 permanent;
    rewrite ^/uk(/index\\.html|/)?$ https://physics.sheua.com/uk/ permanent;
    if ($request_uri ~ ^/(en/)?index\\.html(\\?.*)?$) {
        return 301 https://sheua.com/$1$is_args$args;
    }
    # END SHEUA SEO REDIRECTS

"""

LAB_REDIRECTS = """    # BEGIN SHEUA SEO REDIRECTS
    rewrite ^/sim/brewster(\\.html)?$ https://physics.sheua.com/sim/malus permanent;
    rewrite ^/uk/sim/brewster(\\.html)?$ https://physics.sheua.com/uk/sim/malus permanent;
    rewrite ^/sim/chem_arrhenius(\\.html)?$ https://physics.sheua.com/sim/chem_orders permanent;
    rewrite ^/uk/sim/chem_arrhenius(\\.html)?$ https://physics.sheua.com/uk/sim/chem_orders permanent;
    if ($request_uri ~ ^/(uk/)?sim/([^/.?]+)\\.html(\\?.*)?$) {
        return 301 https://physics.sheua.com/$1sim/$2$is_args$args;
    }
    if ($request_uri ~ ^/(uk/)?index\\.html(\\?.*)?$) {
        return 301 https://physics.sheua.com/$1$is_args$args;
    }
    # END SHEUA SEO REDIRECTS

"""

ADS_BLOCK = """    location = /ads.txt {
        default_type text/plain;
        add_header Cache-Control "public, max-age=3600" always;
        add_header X-Content-Type-Options "nosniff" always;
        try_files /ads.txt =404;
    }

"""

confs = (
    glob.glob('/etc/nginx/sites-enabled/*')
    + glob.glob('/etc/nginx/sites-available/*')
    + glob.glob('/etc/nginx/conf.d/*.conf')
)
import os
real_confs = sorted(set(os.path.realpath(p) for p in confs if os.path.isfile(p) and not p.endswith('.bak')))

for path in real_confs:
    try:
        with open(path, 'r', encoding='utf-8') as f:
            txt = f.read()
    except Exception:
        continue
    if 'physics-course' not in txt and 'sheua' not in txt:
        continue
    orig = txt

    parts = re.split(r'(?=\bserver\s*\{)', txt)
    new_parts = []
    for block in parts:
        if not block.lstrip().startswith('server'):
            new_parts.append(block)
            continue

        # Upgrade Certbot HTTP www.sheua.com redirect to single-hop canonical sheua.com
        block = re.sub(
            r'(if\s*\(\$host\s*=\s*www\.sheua\.com\)\s*\{\s*return\s+301\s+https://)\$host(\$request_uri;\s*\})',
            r'\1sheua.com\2',
            block
        )

        if 'location / {' not in block:
            new_parts.append(block)
            continue

        sn = ' '.join(re.findall(r'server_name\s+([^;]+);', block))
        is_lab = ('physics.sheua.com' in sn) or ('/var/www/physics-course' in block and 'sheua-root' not in block)
        is_hub = ('sheua.com' in sn and 'physics.sheua.com' not in sn) and not is_lab

        # Fix Soft-404 fallback /index.html -> =404
        block = re.sub(
            r'try_files\s+\$uri\s+\$uri\.html\s+\$uri/\s+/index\.html\s*;',
            'try_files $uri $uri.html $uri/ =404;',
            block
        )

        # Remove old managed redirect blocks and legacy standalone rewrites before inserting fresh block
        block = re.sub(r'\s*# BEGIN SHEUA SEO REDIRECTS[\s\S]*?# END SHEUA SEO REDIRECTS\s*\n?', '\n', block)
        block = re.sub(r'^\s*#\s*301 редиректи[^\n]*\n', '', block, flags=re.M)
        block = re.sub(r'^\s*rewrite\s+\^/(?:uk/)?sim/(?:brewster|chem_arrhenius)[^\n]*\n', '', block, flags=re.M)

        def insert_before_loc(b, snippet):
            return re.sub(r'^[ \t]*location\s+/\s*\{', lambda m: snippet + m.group(0), b, count=1, flags=re.M)

        if 'error_page 404 /404.html;' not in block:
            block = insert_before_loc(block, '    error_page 404 /404.html;\n\n')

        if 'location = /ads.txt' not in block:
            block = insert_before_loc(block, ADS_BLOCK)

        if is_hub:
            # Remove any duplicate standalone www redirect outside managed block
            block = re.sub(r'\s*if\s*\(\$host\s*=\s*www\.sheua\.com\)\s*\{\s*return\s+301\s+https://sheua\.com\$request_uri;\s*\}\s*\n?', '\n', block)
            block = insert_before_loc(block, HUB_REDIRECTS)
        elif is_lab:
            block = insert_before_loc(block, LAB_REDIRECTS)

        if 'X-Content-Type-Options' not in block.split('location / {')[-1]:
            block = block.replace(
                'try_files $uri $uri.html $uri/ =404;',
                'add_header Cache-Control "no-cache" always;\n        add_header X-Content-Type-Options "nosniff" always;\n        add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n        add_header X-Frame-Options "SAMEORIGIN" always;\n        try_files $uri $uri.html $uri/ =404;'
            )

        new_parts.append(block)

    new_txt = ''.join(new_parts)
    if new_txt != orig:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_txt)
        chk = subprocess.run(['nginx', '-t'], capture_output=True, text=True)
        if chk.returncode != 0:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(orig)
            print(f'WARNING: Reverted Nginx patch for {path}: {chk.stderr}')
        else:
            print(f'Updated Nginx config: {path}')
PYEOF

sudo nginx -t
sudo systemctl reload nginx

echo "=== [5/5] Перевірка доступності ads.txt, нових розділів та 301-редиректів ==="
for CHECK_URL in \
  "https://sheua.com/" \
  "https://sheua.com/ads.txt" \
  "https://sheua.com/nmt-trener.html" \
  "https://sheua.com/laboratorni-7-11-klas.html" \
  "https://sheua.com/kalkuliatory.html" \
  "https://sheua.com/mechanics-conservation.html" \
  "https://physics.sheua.com/ads.txt" \
  "https://physics.sheua.com/sim/collision"; do
  STATUS="$(curl -ksI --max-time 8 -o /dev/null -w '%{http_code}' "${CHECK_URL}" || echo 'ERR')"
  echo "  ${STATUS}  ${CHECK_URL}"
done

for REDIR_URL in \
  "https://www.sheua.com/" \
  "https://sheua.com/sim/collision" \
  "https://sheua.com/uk/sim/collision" \
  "https://sheua.com/uk/" \
  "https://physics.sheua.com/sim/collision.html"; do
  CODE_LOC="$(curl -ksI --max-time 8 -o /dev/null -w '%{http_code} -> %{redirect_url}' "${REDIR_URL}" || echo 'ERR')"
  echo "  ${CODE_LOC}  (${REDIR_URL})"
done

echo "Готово! Обидва домени sheua.com та physics.sheua.com успішно оновлено."
