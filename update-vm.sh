#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main}"
WEB_ROOT="/var/www/physics-course"
HUB_ROOT="/var/www/sheua-hub"
DOMAIN_FILE="${WEB_ROOT}/.domain"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== [1/5] Отримання останніх змін із Git (гілка: ${BRANCH}) ==="
REAL_UID="${SUDO_UID:-$(id -u)}"
REAL_GID="${SUDO_GID:-$(id -g)}"
if [ -d "${SRC_DIR}/.git" ] && [ "$(realpath "${SRC_DIR}")" != "$(realpath "${WEB_ROOT}")" ]; then
  sudo chown -R "${REAL_UID}:${REAL_GID}" "${SRC_DIR}" || true
fi
git config --global --add safe.directory "${SRC_DIR}" || true
sudo git config --system --add safe.directory "${SRC_DIR}" 2>/dev/null || true

cd "${SRC_DIR}"
git -c safe.directory="${SRC_DIR}" fetch origin "${BRANCH}"
git -c safe.directory="${SRC_DIR}" reset --hard "origin/${BRANCH}"
if [ -d "${SRC_DIR}/.git" ] && [ "$(realpath "${SRC_DIR}")" != "$(realpath "${WEB_ROOT}")" ]; then
  sudo chown -R "${REAL_UID}:${REAL_GID}" "${SRC_DIR}" || true
fi

DOMAIN="physics.sheua.com"
if [ -f "${DOMAIN_FILE}" ]; then
  DOMAIN="$(cat "${DOMAIN_FILE}")"
fi

echo "=== [2/5] Оновлення файлів 3D-лабораторії у ${WEB_ROOT} ==="
sudo mkdir -p "${WEB_ROOT}"
if [ "$(realpath "${SRC_DIR}")" != "$(realpath "${WEB_ROOT}")" ]; then
  sudo cp -a "${SRC_DIR}/index.html" "${SRC_DIR}/404.html" "${SRC_DIR}/about.html" "${SRC_DIR}/privacy.html" "${SRC_DIR}/terms.html" "${SRC_DIR}/manifest.json" "${SRC_DIR}/sw.js" "${SRC_DIR}/favicon.svg" "${SRC_DIR}/sitemap.xml" "${SRC_DIR}/robots.txt" "${SRC_DIR}/ads.txt" "${SRC_DIR}/assets" "${SRC_DIR}/sim" "${SRC_DIR}/uk" "${SRC_DIR}/sheua-root" "${WEB_ROOT}/"

  sudo python3 - "${WEB_ROOT}" << 'PYMIN' || true
import os, re, shutil, subprocess, sys

web_root = sys.argv[1]
js_path = os.path.join(web_root, 'assets', 'app.js')
css_path = os.path.join(web_root, 'assets', 'styles.css')

if os.path.isfile(js_path):
    raw_js = open(js_path, 'r', encoding='utf-8').read()
    out = []
    stack = []
    in_block = False
    for line in raw_js.splitlines(keepends=True):
        if (not stack or stack[-1] != 'tmpl') and not in_block:
            s = line.lstrip(' \t')
            if not s or s in ('\n', '\r\n') or s.startswith('//'):
                continue
            emit = s
        else:
            emit = line
        i, n, in_sq, in_dq = 0, len(emit), False, False
        while i < n:
            ch = emit[i]
            nxt = emit[i + 1] if i + 1 < n else ''
            if in_block:
                if ch == '*' and nxt == '/':
                    in_block = False
                    i += 2
                    continue
                i += 1
                continue
            if stack and stack[-1] == 'tmpl':
                if ch == '\\':
                    i += 2
                    continue
                if ch == '`':
                    stack.pop()
                    i += 1
                    continue
                if ch == '$' and nxt == '{':
                    stack.append(['expr', 1])
                    i += 2
                    continue
                i += 1
                continue
            if in_sq:
                if ch == '\\':
                    i += 2
                    continue
                if ch == "'":
                    in_sq = False
                i += 1
                continue
            if in_dq:
                if ch == '\\':
                    i += 2
                    continue
                if ch == '"':
                    in_dq = False
                i += 1
                continue
            if ch == '/' and nxt == '/':
                break
            if ch == '/' and nxt == '*':
                in_block = True
                i += 2
                continue
            if ch == "'":
                in_sq = True
                i += 1
                continue
            if ch == '"':
                in_dq = True
                i += 1
                continue
            if ch == '`':
                stack.append('tmpl')
                i += 1
                continue
            if stack and isinstance(stack[-1], list):
                if ch == '{':
                    stack[-1][1] += 1
                elif ch == '}':
                    stack[-1][1] -= 1
                    if stack[-1][1] == 0:
                        stack.pop()
            i += 1
        out.append(emit)
    if not stack and not in_block:
        comp_js = ''.join(out)
        open(js_path, 'w', encoding='utf-8', newline='\n').write(comp_js)
        if shutil.which('node'):
            chk = subprocess.run(['node', '--check', js_path], capture_output=True)
            if chk.returncode != 0:
                open(js_path, 'w', encoding='utf-8', newline='\n').write(raw_js)

if os.path.isfile(css_path):
    raw_css = open(css_path, 'r', encoding='utf-8').read()
    no_c = re.sub(r'("(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\')|/\*[\s\S]*?\*/', lambda m: m.group(1) or '', raw_css)
    comp_css = '\n'.join(ln.strip() for ln in no_c.splitlines() if ln.strip()) + '\n'
    open(css_path, 'w', encoding='utf-8', newline='\n').write(comp_css)
PYMIN
fi

CACHE_VER="$(date +%s)"
sudo find "${WEB_ROOT}" -maxdepth 3 -name "*.html" ! -path "${WEB_ROOT}/sheua-root/*" -exec sed -i -E "s#assets/(app\.js|styles\.css)(\?v=[0-9a-zA-Z._-]+)?#assets/\1?v=${CACHE_VER}#g" {} +
if [ -f "${WEB_ROOT}/sw.js" ]; then
  sudo sed -i -E "s#sheua-lab-v[0-9a-zA-Z._-]+#sheua-lab-v${CACHE_VER}#g; s#assets/(app\.js|styles\.css)(\?v=[0-9a-zA-Z._-]+)?#assets/\1?v=${CACHE_VER}#g" "${WEB_ROOT}/sw.js"
fi

if command -v gzip >/dev/null 2>&1; then
  sudo gzip -9 -k -f "${WEB_ROOT}/assets/app.js" "${WEB_ROOT}/assets/styles.css" "${WEB_ROOT}/sw.js" "${WEB_ROOT}/sitemap.xml" "${WEB_ROOT}/manifest.json" || true
  sudo find "${WEB_ROOT}" -maxdepth 3 -name "*.html" ! -path "${WEB_ROOT}/sheua-root/*" -exec gzip -9 -k -f {} + || true
fi

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
      if command -v gzip >/dev/null 2>&1; then
        sudo find "${TARGET_HUB}" -maxdepth 2 \( -name "*.html" -o -name "*.xml" \) -exec gzip -9 -k -f {} + || true
      fi
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
    if ($request_uri ~ ^/((?:en|pl|de|es|fr|pt)/)?index\\.html(\\?.*)?$) {
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

SW_BLOCK = """    location = /sw.js {
        default_type application/javascript;
        add_header Cache-Control "no-cache, max-age=0" always;
        add_header Service-Worker-Allowed "/" always;
        add_header X-Content-Type-Options "nosniff" always;
        try_files /sw.js =404;
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

        if is_lab and 'location = /sw.js' not in block:
            block = insert_before_loc(block, SW_BLOCK)

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

        # Enable gzip_static on; and tune gzip settings for pre-compressed .gz assets
        if 'gzip on;' in block and 'gzip_static on;' not in block:
            block = block.replace('gzip on;', 'gzip on;\n    gzip_static on;', 1)
        block = re.sub(r'gzip_min_length\s+1024;', 'gzip_min_length 512;', block)
        def patch_gzip_types(m):
            gt = re.sub(r'\s+text/html\b', '', m.group(0))
            if 'application/manifest+json' not in gt:
                gt = gt.replace('application/ld+json', 'application/ld+json application/manifest+json')
            return gt
        block = re.sub(r'gzip_types\b[^;]*;', patch_gzip_types, block)

        # Avoid duplicate Cache-Control headers from expires 7d + add_header Cache-Control
        if 'max-age=604800' in block:
            block = re.sub(r'^[ \t]*expires\s+7d;\s*\n', '', block, flags=re.M)

        # Ensure HSTS on every location block with security headers inside HTTPS servers, and deduplicate add_header lines
        is_https = ('ssl_certificate' in block)
        def patch_loc_headers(m):
            loc = m.group(0)
            if is_https and 'X-Content-Type-Options' in loc and 'Strict-Transport-Security' not in loc:
                loc = loc.replace(
                    'add_header X-Content-Type-Options "nosniff" always;',
                    'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\n        add_header X-Content-Type-Options "nosniff" always;',
                    1
                )
            seen_hdrs = set()
            dedup_lines = []
            for ln in loc.splitlines(keepends=True):
                norm = ln.strip()
                if norm.startswith('add_header '):
                    if norm in seen_hdrs:
                        continue
                    seen_hdrs.add(norm)
                dedup_lines.append(ln)
            return ''.join(dedup_lines)
        block = re.sub(r'^[ \t]*location\b[^{]*\{[^}]*\}', patch_loc_headers, block, flags=re.M)

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
  "https://sheua.com/kartky-formul.html" \
  "https://sheua.com/tablytsi-rozchynnosti-periodychna.html" \
  "https://sheua.com/en/calculators.html" \
  "https://sheua.com/en/formula-flashcards.html" \
  "https://sheua.com/en/si-constants.html" \
  "https://sheua.com/en/periodic-solubility-tables.html" \
  "https://sheua.com/en/exam-practice.html" \
  "https://sheua.com/pl/" \
  "https://sheua.com/de/" \
  "https://sheua.com/es/" \
  "https://sheua.com/fr/" \
  "https://sheua.com/pt/" \
  "https://sheua.com/mechanics-conservation.html" \
  "https://physics.sheua.com/ads.txt" \
  "https://physics.sheua.com/sw.js" \
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
