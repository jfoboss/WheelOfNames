# Колесо имён — контекст для Claude Code

Внутренний аналог wheelofnames.com для компании. Статическое PWA без бэкенда, отдаётся nginx в k8s. Пользователи ставят его на рабочий стол как приложение.

## Структура
- `app/` — вся статика: `index.html`, `app.js` (вся логика, IIFE, без сборки), `styles.css`, `sw.js`, `manifest.webmanifest`, `icons/`
- `nginx/default.conf` + `nginx/headers.conf` — конфиг и заголовки безопасности
- `helm/wheel-of-names/` — Helm-чарт: deployment, service, pdb, Ingress или HTTPRoute (Gateway API), Traefik Middleware из `traefikMiddlewares` (namespace не создаёт)
- `argocd/application.yaml` (Ingress) и `argocd/application-httproute.yaml` (HTTPRoute + Traefik) — варианты ArgoCD Application: чарт из git, значения под окружение в `valuesObject`
- `tools/gen_icons.py` — генерация иконок (Pillow)
- `Dockerfile` — `nginx-unprivileged`, порт 8080, uid 101

## Принятые решения (не ломать без причины)
- **Язык: в коде — английский** (комментарии, сообщения ошибок `required`/`fail` в чарте, логи, `description` в Chart.yaml, NOTES). По-русски — только тексты интерфейса приложения и документация (README, CLAUDE.md).
- **Никаких внешних зависимостей, CDN, шрифтов и сборщиков.** Приложение должно работать в закрытом контуре и офлайн.
- **CSP `'self'` без inline.** Никаких `<script>` и `style="…"` в HTML. Стили из JS задавать только через CSSOM (`el.style.setProperty`).
- **Только относительные пути**, чтобы приложение работало и в подпути за ingress.
- **Честный выбор.** Победитель определяется через `crypto.getRandomValues` с rejection sampling (`randomInt`) ДО анимации. Угол остановки считается внутри сектора победителя. Указатель стоит справа (угол 0), индекс под ним вычисляет `indexAt()`. Анимация на результат не влияет.
- **Колесо рисуется один раз в offscreen-canvas** (`renderBitmap`); кадр анимации только поворачивает картинку (`draw`).
- **Service worker работает cache-first.** Имя кэша содержит `__APP_VERSION__`, его подставляет `sed` в Dockerfile (`ARG APP_VERSION`, по умолчанию время сборки). При добавлении новых файлов в `app/` нужно дописать их в `ASSETS` в `sw.js`.
- **nginx: `add_header` внутри `location` отменяет заголовки уровня `server`.** Поэтому `headers.conf` подключается в каждый `location`.
- **Под `readOnlyRootFilesystem` nginx пишет только в `/tmp`** (`emptyDir` в deployment).
- **Состояние хранится в `localStorage`** под ключом `wheel-of-names:v1`. «Поделиться» кладёт список во фрагмент URL `#list=<base64url JSON {t, e}>`.

## Проверка
- Локально: `cd app && python3 -m http.server 8000`. `localhost` — безопасный контекст, SW и установка работают.
- В чате уже проверялось в headless Chromium (Playwright):
  - нет ошибок консоли и CSP;
  - `Page.getInstallabilityErrors` пуст;
  - офлайн-перезагрузка работает;
  - в 40 вращениях цвет сектора под указателем совпал с выпавшим именем.
- `nginx -t` и отдача заголовков проверены.
- Чарт: `helm lint --strict`, `helm template` и kubeconform (в т.ч. Application, HTTPRoute и Traefik Middleware по схемам CRD из datreeio/CRDs-catalog) проходят.
- **Middleware из `traefikMiddlewares` подключаются автоматически**: к HTTPRoute через `ExtensionRef`, к Ingress через аннотацию `router.middlewares` (`<ns>-<name>@kubernetescrd`). При изменении шаблонов поднимать `version` в `Chart.yaml`.
- **Не проверялись** `docker build` и реальный деплой в кластер: не было docker-демона и кластера.

## Что подставить под окружение
- `argocd/application*.yaml` → `repoURL` (зеркало, если ArgoCD не ходит на GitHub) и `valuesObject`: `image.repository`/`image.tag`, `imagePullSecrets`
- там же `ingress` (хост, `className`, TLS) или `httpRoute` (`parentRefs` на ваш Gateway, `hostnames`). Сертификат должен быть от CA, которому доверяют рабочие станции, иначе PWA не установится.
- `Dockerfile` → `BASE_IMAGE` через прокси-кэш Harbor
