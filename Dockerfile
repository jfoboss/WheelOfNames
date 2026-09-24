# Базовый образ можно тянуть через прокси-кэш Harbor:
#   docker build --build-arg BASE_IMAGE=harbor.example.local/dockerhub/nginxinc/nginx-unprivileged:1.28-alpine .
ARG BASE_IMAGE=nginxinc/nginx-unprivileged:1.28-alpine
FROM ${BASE_IMAGE}

# Версия попадает в имя кэша service worker; каждая сборка => клиенты получают обновление
ARG APP_VERSION=""

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/headers.conf /etc/nginx/snippets/headers.conf
COPY app/ /usr/share/nginx/html/

USER root
RUN v="${APP_VERSION:-$(date -u +%Y%m%d%H%M%S)}" \
 && sed -i "s/__APP_VERSION__/${v}/" /usr/share/nginx/html/sw.js \
 && rm -f /usr/share/nginx/html/50x.html \
 && chmod -R a+rX /usr/share/nginx/html /etc/nginx/snippets
USER 101

ENV NGINX_ENTRYPOINT_QUIET_LOGS=1
EXPOSE 8080
