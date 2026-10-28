FROM nginx:1.27-alpine

# Cloud Run injects PORT (defaults to 8080)
ENV PORT=8080

# Remove default nginx config and use envsubst template for $PORT
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Copy root static assets, shared bundles, and all 92 EN/UK experiment pages
COPY index.html /usr/share/nginx/html/index.html
COPY favicon.svg /usr/share/nginx/html/favicon.svg
COPY sitemap.xml /usr/share/nginx/html/sitemap.xml
COPY robots.txt /usr/share/nginx/html/robots.txt
COPY ads.txt /usr/share/nginx/html/ads.txt
COPY assets/ /usr/share/nginx/html/assets/
COPY sim/ /usr/share/nginx/html/sim/
COPY uk/ /usr/share/nginx/html/uk/

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
