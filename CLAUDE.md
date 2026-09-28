# Колесо имён — контекст для Claude Code

Внутренний аналог wheelofnames.com для компании. Статическое PWA без бэкенда, отдаётся nginx в k8s. Пользователи ставят его на рабочий стол как приложение.

## Структура
- `app/` — вся статика: `index.html`, `app.js` (вся логика, IIFE, без сборки), `styles.css`, `sw.js`, `manifest.webmanifest`, `icons/`, `img/` (картинки тем)
- `nginx/default.conf` + `nginx/headers.conf` — конфиг и заголовки безопасности
- `helm/wheel-of-names/` — Helm-чарт: deployment, service, pdb, Ingress или HTTPRoute (Gateway API), Traefik Middleware из `traefikMiddlewares` (namespace не создаёт)
- `argocd/application.yaml` (Ingress) и `argocd/application-httproute.yaml` (HTTPRoute + Traefik) — варианты ArgoCD Application: чарт из git, значения под окружение в `valuesObject`
- `tools/gen_icons.py` — генерация иконок (Pillow)
- `Dockerfile` — `nginx-unprivileged`, порт 8080, uid 101
- `.github/workflows/ci.yml` — проверки на PR: заголовок PR (Conventional Commits), синтаксис JS/Python, `ASSETS` в `sw.js`, helm lint + kubeconform, синхронность версий, `docker build` + smoke-тест с read-only rootfs
- `.github/workflows/release.yml` — release-please + публикация образа и чарта в GHCR (опционально Harbor)

## Принятые решения (не ломать без причины)
- **Версии ведёт release-please, руками не править.** Одна SemVer-версия на всё: тег `vX.Y.Z` = образ = `version`/`appVersion` в `Chart.yaml` = `version.txt` = `targetRevision` в `argocd/*.yaml`. Строки с версией помечены `x-release-please-version` (или блоком `x-release-please-start-version … end`); новые места с версией добавлять в `extra-files` в `release-please-config.json`. Коммиты и заголовки PR — Conventional Commits (`feat:`, `fix:`, `feat!:` …), от них зависит bump. Правило «поднимать `version` при изменении шаблонов» больше не действует — поднимает релиз.
- **Язык: в коде — английский** (комментарии, сообщения ошибок `required`/`fail` в чарте, логи, `description` в Chart.yaml, NOTES). По-русски — только тексты интерфейса приложения и документация (README, CLAUDE.md).
- **Никаких внешних зависимостей, CDN, шрифтов и сборщиков.** Приложение должно работать в закрытом контуре и офлайн.
- **CSP `'self'` без inline.** Никаких `<script>` и `style="…"` в HTML. Стили из JS задавать только через CSSOM (`el.style.setProperty`).
- **Только относительные пути**, чтобы приложение работало и в подпути за ingress.
- **Честный выбор.** Победитель определяется через `crypto.getRandomValues` с rejection sampling (`randomInt`) ДО анимации. Угол остановки считается внутри сектора победителя. Указатель стоит справа (угол 0), индекс под ним вычисляет `indexAt()`. Анимация на результат не влияет.
- **Колесо рисуется один раз в offscreen-canvas** (`renderBitmap`); кадр анимации только поворачивает картинку (`draw`).
- **Service worker работает cache-first.** Имя кэша содержит `__APP_VERSION__`, его подставляет `sed` в Dockerfile (`ARG APP_VERSION`, по умолчанию время сборки). При добавлении новых файлов в `app/` нужно дописать их в `ASSETS` в `sw.js`.
- **nginx: `add_header` внутри `location` отменяет заголовки уровня `server`.** Поэтому `headers.conf` подключается в каждый `location`.
- **Под `readOnlyRootFilesystem` nginx пишет только в `/tmp`** (`emptyDir` в deployment).
- **Состояние хранится в `localStorage`** под ключом `wheel-of-names:v1`; картинка в центре — отдельно под `wheel-of-names:v1:image` (data: URL, квадрат 512 px, webp/png). «Поделиться» кладёт список во фрагмент URL `#list=<base64url JSON {t, e, th}>` (`th` — id темы; картинка в ссылку не идёт).
- **Темы колеса — массив `THEMES` в `app.js`** (`colors`, опционально `textColors`/`text`, `stroke`, `rim`, `pointer`/`hub`/`hubInk` → CSS-переменные на `.wheel-wrap`, `shade`, `labelPrefix`, `image` — картинка темы по умолчанию из `app/img/`, не забыть `ASSETS` в `sw.js`). Новая тема = новый элемент массива, плитка в настройках строится сама. Своя картинка пользователя важнее картинки темы; «Убрать» удаляет только свою.
- **Картинки тем — только свои рисунки** (как `app/img/anon.svg`: SVG, всё в круге r=240, т.к. центр обрезается кругом). Не копировать защищённых персонажей: Trollface (копирайт Whynne) и Pepe (Matt Furie) — нельзя, репозиторий и образ публичные.
- **Картинку в центре грузить только через FileReader → data: URL** (`blob:` запрещён CSP `img-src`). Рисуется на canvas: при вращении — в `bitmap`, неподвижная — поверх в `draw()`. Кнопка `.hub` при этом прозрачная, остаётся зоной клика.
- **Клик по всей `.wheel-wrap` запускает вращение** (canvas, указатель, центр).

## Проверка
- Локально: `cd app && python3 -m http.server 8000`. `localhost` — безопасный контекст, SW и установка работают.
- В чате уже проверялось в headless Chromium (Playwright):
  - нет ошибок консоли и CSP;
  - `Page.getInstallabilityErrors` пуст;
  - офлайн-перезагрузка работает;
  - в 40 вращениях цвет сектора под указателем совпал с выпавшим именем.
- Темы и картинка проверены в Chromium против nginx с боевым CSP: нарушений CSP нет, картинка сохраняется после перезагрузки, тема приходит по ссылке, 30/30 вращений с картинкой — цвет под указателем = победитель, клик по краю колеса запускает вращение (десктоп/узкий экран/тач).
- `nginx -t` и отдача заголовков проверены.
- Чарт: `helm lint --strict`, `helm template` и kubeconform (в т.ч. Application, HTTPRoute и Traefik Middleware по схемам CRD из datreeio/CRDs-catalog) проходят.
- **Middleware из `traefikMiddlewares` подключаются автоматически**: к HTTPRoute через `ExtensionRef`, к Ingress через аннотацию `router.middlewares` (`<ns>-<name>@kubernetescrd`).
- `docker build` и smoke-тест образа (read-only rootfs, uid 101, `nginx -t`, CSP, версия в `sw.js`) проверены локально и гоняются в CI. `dockerd` в облачной среде можно поднять вручную (`dockerd &`).
- **Не проверялись** реальный деплой в кластер и прогон release-please/публикации (только actionlint).

## Что подставить под окружение
- `argocd/application*.yaml` → `repoURL` (зеркало, если ArgoCD не ходит на GitHub) и `valuesObject`: `image.repository` (по умолчанию GHCR; тег = `appVersion`), `imagePullSecrets`
- там же `ingress` (хост, `className`, TLS) или `httpRoute` (`parentRefs` на ваш Gateway, `hostnames`). Сертификат должен быть от CA, которому доверяют рабочие станции, иначе PWA не установится.
- `Dockerfile` → `BASE_IMAGE` через прокси-кэш Harbor
