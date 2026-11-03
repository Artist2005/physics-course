#!/usr/bin/env bash
set -euo pipefail

SUBDOMAIN="${1:-physics.sheua.com}"
ROOT_DOMAIN="sheua.com"
PHYSICS_DIR="/var/www/physics-course"
HUB_DIR="/var/www/sheua-hub"

echo "=== [1/4] Оновлюємо домен у файлах 3D-лабораторії на https://${SUBDOMAIN} ==="
if [ "${SUBDOMAIN}" != "physics.sheua.com" ]; then
  sudo sed -i "s|https://physics.sheua.com|https://${SUBDOMAIN}|g" "${PHYSICS_DIR}/sitemap.xml" "${PHYSICS_DIR}/robots.txt"
  sudo find "${PHYSICS_DIR}" -maxdepth 3 -name "*.html" -exec sed -i "s|https://physics.sheua.com|https://${SUBDOMAIN}|g" {} +
fi

echo "=== [2/4] Створюємо головний портал ${ROOT_DOMAIN} у ${HUB_DIR} (разом з ads.txt) ==="
sudo mkdir -p "${HUB_DIR}"
sudo cp "${PHYSICS_DIR}/ads.txt" "${HUB_DIR}/ads.txt"
sudo cp "${PHYSICS_DIR}/favicon.svg" "${HUB_DIR}/favicon.svg"

sudo tee "${HUB_DIR}/index.html" > /dev/null << EOF
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SHEUA.COM · Платформа вебпроєктів та інтерактивних сервісів</title>
  <meta name="description" content="Портал вебпроєктів на домені sheua.com: інтерактивна 3D-лабораторія з фізики та хімії (86 віртуальних симуляцій) та інші спеціалізовані сервіси." />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://${ROOT_DOMAIN}/" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2903108049371777" crossorigin="anonymous"></script>
  <style>
    :root {
      --bg: #f4f2ed;
      --card: #faf9f5;
      --ink: #18181b;
      --muted: #52525b;
      --border: #d6d3cd;
      --accent: #1d4ed8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 56px 20px;
    }
    .wrap { max-width: 860px; width: 100%; }
    .badge {
      display: inline-block;
      background: var(--ink);
      color: #faf9f5;
      font-family: monospace;
      font-size: 12px;
      letter-spacing: 0.08em;
      padding: 5px 12px;
      border-radius: 3px;
      margin-bottom: 16px;
    }
    h1 { font-size: clamp(28px, 4vw, 42px); margin-bottom: 12px; letter-spacing: -0.02em; }
    .lead { color: var(--muted); font-size: 17px; line-height: 1.6; margin-bottom: 36px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 26px;
      text-decoration: none;
      color: inherit;
      transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .card:hover {
      transform: translateY(-2px);
      border-color: var(--accent);
      box-shadow: 0 8px 24px rgba(24, 24, 27, 0.08);
    }
    .card-domain {
      font-family: monospace;
      font-size: 13px;
      font-weight: 600;
      color: var(--accent);
    }
    .card-title { font-size: 20px; font-weight: 700; }
    .card-desc { color: var(--muted); font-size: 14.5px; line-height: 1.55; }
    .card-links { margin-top: 8px; display: flex; gap: 12px; font-size: 13.5px; font-weight: 600; color: var(--accent); }
  </style>
</head>
<body>
  <main class="wrap">
    <span class="badge">SHEUA.COM · MULTI-PROJECT HUB</span>
    <h1>Каталог проєктів SHEUA.COM</h1>
    <p class="lead">Оберіть потрібний сервіс або освітню платформу на піддоменах sheua.com.</p>
    <div class="grid">
      <a class="card" href="https://${SUBDOMAIN}/uk/">
        <span class="card-domain">${SUBDOMAIN}</span>
        <div class="card-title">3D Лабораторія Фізики та Хімії</div>
        <p class="card-desc">Інтерактивний 3D-підручник і віртуальний практикум: 46 симуляцій з фізики та 40 симуляцій з хімії з живими векторами, формулами KaTeX і конспектами теорії.</p>
        <div class="card-links">
          <span>Відкрити українською →</span>
        </div>
      </a>
      <a class="card" href="https://${SUBDOMAIN}/">
        <span class="card-domain">${SUBDOMAIN} (EN)</span>
        <div class="card-title">3D Physics &amp; Chemistry Lab</div>
        <p class="card-desc">Interactive 3D virtual laboratory and textbook with 86 simulations across classical mechanics, optics, electromagnetism, orbitals, kinetics, and electrochemistry.</p>
        <div class="card-links">
          <span>Open in English →</span>
        </div>
      </a>
    </div>
  </main>
</body>
</html>
EOF

sudo chown -R www-data:www-data "${HUB_DIR}"
sudo chmod -R 755 "${HUB_DIR}"

echo "=== [3/4] Налаштовуємо віртуальні хости Nginx для ${SUBDOMAIN} та ${ROOT_DOMAIN} ==="
sudo cp "${PHYSICS_DIR}/nginx-vm.conf" /etc/nginx/sites-available/physics-course
sudo sed -i "s/server_name _;/server_name ${SUBDOMAIN};/" /etc/nginx/sites-available/physics-course
sudo ln -sf /etc/nginx/sites-available/physics-course /etc/nginx/sites-enabled/physics-course

sudo tee /etc/nginx/sites-available/sheua-hub > /dev/null << EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${ROOT_DOMAIN} www.${ROOT_DOMAIN};

    root ${HUB_DIR};
    index index.html;
    charset utf-8;

    location / {
        try_files \$uri \$uri.html \$uri/ =404;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/sheua-hub /etc/nginx/sites-enabled/sheua-hub

sudo nginx -t
sudo systemctl reload nginx

echo "=== [4/4] Випускаємо HTTPS-сертифікати (Let's Encrypt) для ${ROOT_DOMAIN} та ${SUBDOMAIN} ==="
if command -v certbot >/dev/null 2>&1; then
  sudo certbot --nginx -d "${ROOT_DOMAIN}" -d "www.${ROOT_DOMAIN}" -d "${SUBDOMAIN}" --redirect --expand || true
fi

echo ""
echo "✅ Готово!"
echo "   • Головний хаб домену: https://${ROOT_DOMAIN}"
echo "   • 3D-лабораторія:      https://${SUBDOMAIN}"
echo "   • AdSense ads.txt:     https://${ROOT_DOMAIN}/ads.txt та https://${SUBDOMAIN}/ads.txt"
