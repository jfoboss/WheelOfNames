# Колесо имён

Внутренний аналог wheelofnames.com: вписываете имена, крутите колесо, получаете случайного участника. Статическое PWA без бэкенда и внешних зависимостей — отдаётся nginx из контейнера, ставится на рабочий стол как приложение, работает офлайн.

## Что умеет

- Список участников (по одному в строке), перемешать / отсортировать / убрать повторы.
- Вращение с тиканьем и указателем, окно с результатом, конфетти.
- «Убрать из списка» после выпадения или автоудаление (удобно для очерёдности выступлений), вкладка «Результаты» с порядком выпадения, возврат убранных в список.
- Настройки: длительность вращения, звук, автоудаление, конфетти.
- «Поделиться списком» — ссылка со списком во фрагменте URL (`#list=…`), на сервер не уходит.
- Полноэкранный режим — только колесо, для показа на общем экране.
- Светлая/тёмная тема по системе, `prefers-reduced-motion`, клавиатура: Ctrl/⌘+Enter.
- Данные хранятся в `localStorage` браузера пользователя; сервер ничего не хранит.

**Честность выбора.** Победитель выбирается до начала анимации через `crypto.getRandomValues` без смещения по модулю (rejection sampling), затем вычисляется угол остановки внутри его сектора. Анимация на результат не влияет.

## Структура

```
app/              статика: index.html, app.js, styles.css, sw.js, manifest.webmanifest, icons/
nginx/            конфиг nginx + заголовки безопасности (CSP и т.п.)
helm/wheel-of-names/  Helm-чарт: deployment, service, ingress, pdb
argocd/application.yaml  ArgoCD Application для чарта
tools/gen_icons.py  генерация иконок (Pillow)
Dockerfile
```

## Локальный запуск

```bash
cd app && python3 -m http.server 8000
# http://localhost:8000 — localhost считается безопасным контекстом, SW и установка работают
```

## Сборка и публикация образа

```bash
docker build \
  --build-arg BASE_IMAGE=harbor.example.local/dockerhub/nginxinc/nginx-unprivileged:1.28-alpine \
  --build-arg APP_VERSION=1.0.0 \
  -t harbor.example.local/tools/wheel-of-names:1.0.0 .
docker push harbor.example.local/tools/wheel-of-names:1.0.0
```

`APP_VERSION` подставляется в имя кэша service worker. Если не передать — возьмётся время сборки. Каждая новая версия → у пользователей появляется «Доступна новая версия — Обновить».

Образ: `nginx-unprivileged`, порт 8080, uid 101, работает с `readOnlyRootFilesystem` (нужен только `emptyDir` на `/tmp`). Проба — `GET /healthz`.

## Деплой

Разворачивается Helm-чартом `helm/wheel-of-names` через ArgoCD Application.

Под окружение задать значения (в `argocd/application.yaml` → `spec.source.helm.valuesObject` или своим values-файлом):

- `image.repository`, `image.tag` — образ в Harbor (по умолчанию тег = `appVersion` из `Chart.yaml`);
- `imagePullSecrets` — если проект в Harbor приватный;
- `ingress.className`, `ingress.hosts`, `ingress.tls`, `ingress.annotations` (например, cert-manager);
- при необходимости `replicaCount`, `resources`, `nodeSelector`, `tolerations`, `affinity`, `podDisruptionBudget`.

Все параметры с комментариями — в `helm/wheel-of-names/values.yaml`. Namespace чарт не создаёт: в Application для этого стоит `CreateNamespace=true`.

### Вариант 1: чарт из git (по умолчанию)

`argocd/application.yaml` берёт чарт прямо из этого репозитория (`path: helm/wheel-of-names`). Если ArgoCD не ходит на GitHub, поменять `repoURL` на внутреннее зеркало репозитория.

```bash
kubectl apply -n argocd -f argocd/application.yaml
```

### Вариант 2: чарт в OCI-registry (Harbor)

```bash
helm package helm/wheel-of-names
helm push wheel-of-names-0.1.0.tgz oci://harbor.example.local/charts
```

В Application заменить `source` на:

```yaml
  source:
    repoURL: harbor.example.local/charts   # без oci://; репозиторий в ArgoCD добавить с enableOCI: true
    chart: wheel-of-names
    targetRevision: 0.1.0
    helm:
      valuesObject: { ... }
```

### Без ArgoCD

```bash
helm upgrade --install wheel-of-names helm/wheel-of-names -n wheel-of-names --create-namespace \
  --set image.tag=1.0.0 --set 'ingress.hosts[0].host=wheel.example.local' ...
```

При изменении шаблонов или `values.yaml` поднимать `version` в `Chart.yaml`; при выпуске нового образа — `appVersion` (или задавать `image.tag` в Application).

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
