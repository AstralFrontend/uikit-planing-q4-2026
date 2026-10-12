# uikit-planing-q4-2026

Статичная страница плана UI Kit на Q4 2026. Вёрстка и расчёты взяты из `live-plan-board`, но перетаскивания задач и записи в Jira здесь нет.

## Данные

- `data/snapshot.json`: снимок задач из Jira. Его извлекают из страницы `live-plan-board`, сохранённой в браузере.
- `data/capacity.json`: копия `live-plan-board/capacity/Q4_2026.json`.
- `data/overrides.json`: ручные правки поверх снимка. Задача попадает в итерацию по полю `due`, а `null` переносит её в «Без срока».

Обновить снимок:

```sh
node scripts/extract-from-html.mjs "~/Desktop/UIKIT · Планирование.html" > data/snapshot.json
```

## Сборка

```sh
node build.mjs
```

Результат пишется в `dist/index.html`. Текущая итерация и просрочки считаются на дату сборки; её можно задать через `TODAY=2026-10-12`.

## Публикация

При пуше в `main` workflow `.github/workflows/pages.yml` собирает страницу и публикует её в GitHub Pages. В настройках репозитория нужно один раз выбрать Settings → Pages → Source: **GitHub Actions**.
