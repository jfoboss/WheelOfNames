# Колесо имён

[![Release](https://img.shields.io/github/v/release/jfoboss/WheelOfNames?sort=semver)](https://github.com/jfoboss/WheelOfNames/releases/latest)
[![Release date](https://img.shields.io/github/release-date/jfoboss/WheelOfNames)](https://github.com/jfoboss/WheelOfNames/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/jfoboss/WheelOfNames/ci.yml?branch=main&label=CI)](https://github.com/jfoboss/WheelOfNames/actions/workflows/ci.yml)
[![Release workflow](https://img.shields.io/github/actions/workflow/status/jfoboss/WheelOfNames/release.yml?branch=main&label=release)](https://github.com/jfoboss/WheelOfNames/actions/workflows/release.yml)
[![Image](https://img.shields.io/github/v/release/jfoboss/WheelOfNames?sort=semver&label=image&logo=docker&logoColor=white)](https://github.com/jfoboss/WheelOfNames/pkgs/container/wheel-of-names)
[![Helm chart](https://img.shields.io/github/v/release/jfoboss/WheelOfNames?sort=semver&label=helm%20chart&logo=helm&logoColor=white)](https://github.com/jfoboss/WheelOfNames/pkgs/container/charts%2Fwheel-of-names)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-fe5196?logo=conventionalcommits&logoColor=white)](https://www.conventionalcommits.org/ru/)
[![License](https://img.shields.io/github/license/jfoboss/WheelOfNames)](LICENSE)

Внутренний аналог wheelofnames.com: вписываете имена, крутите колесо, получаете случайного участника. Статическое PWA без бэкенда и внешних зависимостей — отдаётся nginx из контейнера, ставится на рабочий стол как приложение, работает офлайн.

## Релизы и артефакты

| | |
|---|---|
| Релизы и release notes | [GitHub Releases](https://github.com/jfoboss/WheelOfNames/releases) · [последний](https://github.com/jfoboss/WheelOfNames/releases/latest) · [CHANGELOG.md](CHANGELOG.md) |
| Docker-образ | [`ghcr.io/jfoboss/wheel-of-names`](https://github.com/jfoboss/WheelOfNames/pkgs/container/wheel-of-names) — теги `X.Y.Z`, `X.Y`, `latest` |
| Helm-чарт (OCI) | [`oci://ghcr.io/jfoboss/charts/wheel-of-names`](https://github.com/jfoboss/WheelOfNames/pkgs/container/charts%2Fwheel-of-names); `.tgz` также приложен к каждому релизу |
| Сборки | [CI](https://github.com/jfoboss/WheelOfNames/actions/workflows/ci.yml) · [Release](https://github.com/jfoboss/WheelOfNames/actions/workflows/release.yml) |

```bash
docker pull ghcr.io/jfoboss/wheel-of-names:latest
helm pull oci://ghcr.io/jfoboss/charts/wheel-of-names          # последняя версия
helm show chart oci://ghcr.io/jfoboss/charts/wheel-of-names
```

Как выпускаются версии — в разделе [«Версионирование и релизы»](#версионирование-и-релизы).

## Что умеет

- Список участников (по одному в строке), перемешать / отсортировать / убрать повторы.
- Вращение с тиканьем и указателем, окно с результатом, конфетти.
- «Убрать из списка» после выпадения или автоудаление (удобно для очерёдности выступлений), вкладка «Результаты» с порядком выпадения, возврат убранных в список.
- Настройки: длительность вращения, звук, автоудаление, конфетти.
- Оформление колеса: 9 тем (Классика, Яркая, Радуга, Пастель, Море, Осень, Монохром, Имиджборд, Неон); тема передаётся и в ссылке «Поделиться». «Имиджборд» — шуточная: палитра старых имиджбордов, имена гринтекстом (`>Юрий`) и своя дудл-рожица в центре.
- Своя картинка в центре колеса: выбрать файл или перетащить на колесо; размер, вращать вместе с колесом или держать неподвижно. Хранится в браузере (сжимается до 512×512), в ссылку не попадает. Своя картинка перекрывает картинку темы; «Убрать» возвращает картинку темы.
- Крутить можно кликом в любое место колеса, кнопкой в центре или Ctrl/⌘+Enter.
- «Поделиться списком» — ссылка со списком во фрагменте URL (`#list=…`), на сервер не уходит.
- Полноэкранный режим — только колесо, для показа на общем экране.
- Светлая/тёмная тема по системе, `prefers-reduced-motion`, клавиатура: Ctrl/⌘+Enter.
- Данные хранятся в `localStorage` браузера пользователя; сервер ничего не хранит.

**Честность выбора.** Победитель выбирается до начала анимации через `crypto.getRandomValues` без смещения по модулю (rejection sampling), затем вычисляется угол остановки внутри его сектора. Анимация на результат не влияет.

## Структура

```
app/              статика: index.html, app.js, styles.css, sw.js, manifest.webmanifest, icons/, img/ (картинки тем)
nginx/            конфиг nginx + заголовки безопасности (CSP и т.п.)
helm/wheel-of-names/  Helm-чарт: deployment, service, pdb, ingress или HTTPRoute, Traefik Middleware
argocd/               ArgoCD Application: application.yaml (Ingress), application-httproute.yaml (Gateway API + Traefik)
.github/workflows/    CI (ci.yml) и релизы (release.yml, release-please)
version.txt, CHANGELOG.md, release-please-config.json, .release-please-manifest.json  версионирование
tools/gen_icons.py  генерация иконок (Pillow)
Dockerfile
```

## Локальный запуск

```bash
cd app && python3 -m http.server 8000
# http://localhost:8000 — localhost считается безопасным контекстом, SW и установка работают
```

## Версионирование и релизы

Одна версия [SemVer](https://semver.org/lang/ru/) на всё: тег `vX.Y.Z` = образ `X.Y.Z` = чарт `X.Y.Z` (`version` и `appVersion` в `Chart.yaml`). Релизы делает [release-please](https://github.com/googleapis/release-please) по [Conventional Commits](https://www.conventionalcommits.org/ru/):

| Коммит / заголовок PR | Что будет с версией |
|---|---|
| `fix: …` | patch: 1.0.0 → 1.0.1 |
| `feat: …` | minor: 1.0.0 → 1.1.0 |
| `feat!: …` или `BREAKING CHANGE:` в теле | major: 1.0.0 → 2.0.0 |
| `docs:`, `ci:`, `chore:`, `refactor:`, `test:` | релиза не будет |

Как это работает:

1. PR в `main` мёржится; CI проверяет, что заголовок PR в формате Conventional Commits (при squash merge он станет сообщением коммита).
2. `release.yml` держит открытым PR `chore(main): release X.Y.Z`: поднимает версию в `version.txt`, `Chart.yaml`, `targetRevision` в `argocd/*.yaml` и примерах в README, дописывает `CHANGELOG.md`. Новые коммиты в `main` обновляют этот PR.
3. Мёрж release PR = релиз: тег `vX.Y.Z`, GitHub Release с changelog, и публикация:
   - образ `ghcr.io/jfoboss/wheel-of-names:X.Y.Z` (+ `X.Y`, `latest`), `APP_VERSION=X.Y.Z` — у пользователей появится «Доступна новая версия»;
   - чарт `oci://ghcr.io/jfoboss/charts/wheel-of-names:X.Y.Z`, `.tgz` прикладывается к GitHub Release;
   - опционально то же в Harbor: переменная репозитория `HARBOR_REGISTRY` (и `HARBOR_PROJECT`, по умолчанию `tools`), секреты `HARBOR_USERNAME` / `HARBOR_PASSWORD`. Раннер должен видеть Harbor (self-hosted); иначе проще proxy-cache/репликация `ghcr.io` в Harbor.

Версию вручную не править. Нужна конкретная — пустой коммит с `Release-As: X.Y.Z` в теле.

Одноразовая настройка репозитория: Settings → Actions → General → Workflow permissions → включить **Allow GitHub Actions to create and approve pull requests**. После первого релиза сделать пакеты `wheel-of-names` и `charts/wheel-of-names` публичными (Packages → Package settings → Change visibility) или выдать кластеру pull-секрет.

### Ручная сборка образа

```bash
docker build \
  --build-arg BASE_IMAGE=harbor.example.local/dockerhub/nginxinc/nginx-unprivileged:1.28-alpine \
  --build-arg APP_VERSION=1.2.3 \
  -t harbor.example.local/tools/wheel-of-names:1.2.3 .
```

`APP_VERSION` подставляется в имя кэша service worker. Если не передать — возьмётся время сборки. Каждая новая версия → у пользователей появляется «Доступна новая версия — Обновить».

Образ: `nginx-unprivileged`, порт 8080, uid 101, работает с `readOnlyRootFilesystem` (нужен только `emptyDir` на `/tmp`). Проба — `GET /healthz`.

## Деплой

Разворачивается Helm-чартом `helm/wheel-of-names` через ArgoCD Application.

Под окружение задать значения (в `argocd/application.yaml` → `spec.source.helm.valuesObject` или своим values-файлом):

- `image.repository` — по умолчанию `ghcr.io/jfoboss/wheel-of-names`, в примерах — через proxy-cache Harbor; `image.tag` обычно не задаётся: берётся `appVersion` чарта, т.е. версия релиза;
- `imagePullSecrets` — если проект в Harbor приватный;
- `ingress.className`, `ingress.hosts`, `ingress.tls`, `ingress.annotations` (например, cert-manager) — или `httpRoute.*` для Gateway API (см. ниже);
- `traefikMiddlewares` — свои Traefik Middleware;
- при необходимости `replicaCount`, `resources`, `nodeSelector`, `tolerations`, `affinity`, `podDisruptionBudget`.

Все параметры с комментариями — в `helm/wheel-of-names/values.yaml`. Namespace чарт не создаёт: в Application для этого стоит `CreateNamespace=true`.

### Ingress или Gateway API (HTTPRoute)

По умолчанию создаётся `Ingress`. Для Gateway API — `argocd/application-httproute.yaml` (использовать вместо `application.yaml`, имя Application то же):

```yaml
ingress:
  enabled: false
httpRoute:
  enabled: true
  parentRefs:
    - name: traefik-gateway      # ваш Gateway
      namespace: traefik
      sectionName: websecure
  hostnames: [wheel.example.local]
  # matches: по умолчанию PathPrefix /
  # filters: доп. фильтры правила (RequestHeaderModifier, ExtensionRef на существующий Middleware и т.п.)
```

### Traefik Middleware

`traefikMiddlewares` — список своих `Middleware` (`traefik.io/v1alpha1`), `spec` пишется как в документации Traefik:

```yaml
traefikMiddlewares:
  - name: ip-allowlist
    spec:
      ipAllowList:
        sourceRange: [10.0.0.0/8]
```

Чарт создаёт их в namespace приложения под именем `<release>-wheel-of-names-<name>` (при `releaseName: wheel-of-names` — `wheel-of-names-<name>`) и сам подключает:

- к HTTPRoute — фильтром `ExtensionRef` (перед фильтрами из `httpRoute.filters`);
- к Ingress — аннотацией `traefik.ingress.kubernetes.io/router.middlewares` (дописывается к уже заданной в `ingress.annotations`); отключается `traefikMiddlewaresAttachToIngress: false`.

Нужны установленные CRD Traefik (и Gateway API — для HTTPRoute), а у Traefik включён провайдер `kubernetesGateway` / `kubernetesCRD`.

### Вариант 1: чарт из git (по умолчанию)

`argocd/application.yaml` берёт чарт прямо из этого репозитория (`path: helm/wheel-of-names`) по тегу релиза (`targetRevision: vX.Y.Z`, его поднимает release-please). Обновление = смена `targetRevision` на новый тег; образ подтянется той же версии. Если ArgoCD не ходит на GitHub, поменять `repoURL` на внутреннее зеркало репозитория.

```bash
kubectl apply -n argocd -f argocd/application.yaml
```

### Вариант 2: чарт из OCI-registry

Чарт публикуется при каждом релизе в `oci://ghcr.io/jfoboss/charts` (и в Harbor, если настроен). В Application заменить `source` на:

<!-- x-release-please-start-version -->
```yaml
  source:
    repoURL: ghcr.io/jfoboss/charts   # без oci://; или harbor.example.local/tools/charts; в ArgoCD репозиторий с enableOCI: true
    chart: wheel-of-names
    targetRevision: 1.1.0
    helm:
      valuesObject: { ... }
```
<!-- x-release-please-end -->

### Без ArgoCD

<!-- x-release-please-start-version -->
```bash
helm upgrade --install wheel-of-names oci://ghcr.io/jfoboss/charts/wheel-of-names --version 1.1.0 \
  -n wheel-of-names --create-namespace --set 'ingress.hosts[0].host=wheel.example.local' ...
```
<!-- x-release-please-end -->

## Требования для PWA

- **Только HTTPS с доверенным сертификатом.** Service worker и установка не работают по HTTP и с сертификатом, которому браузер не доверяет (исключение — `localhost`). Корпоративный CA должен быть в доверенных на рабочих станциях.
- Можно размещать и в подпути (`https://tools.example.local/wheel/`) — все пути в приложении относительные.

## Как поставить иконку на рабочий стол

- **Chrome / Edge / Яндекс Браузер (Windows, macOS, Linux):** кнопка «Установить» в шапке приложения или значок установки в адресной строке / меню → «Установить приложение». Появится ярлык и отдельное окно.
- **Safari на macOS (Sonoma и новее):** Файл → «Добавить в Dock».
- **iOS / Android:** «Поделиться» → «На экран „Домой“» / меню → «Установить приложение».
- **Firefox на десктопе** штатно PWA не устанавливает — приложение просто работает во вкладке.

## Обновление иконок

```bash
pip install pillow
python3 tools/gen_icons.py
```
