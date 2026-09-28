# Wave UI — Снимок текущего дизайна

> Документ описывает дизайн **как он есть сейчас** (Svelte 5 SPA-клиент для аудиоплеера moOde Audio): визуальный язык, темы, токены, каталог компонентов, экраны и паттерны взаимодействия — с точными значениями из кода. Цель — передать полный визуальный контекст в **Claude Design** для доработки внешнего вида.
>
> Архитектурный принцип: всё измеримое в дизайне вынесено в **CSS-токены** — цвета (per-theme) в `src/lib/theme.ts`, остальные шкалы (отступы/типографика/радиусы/тени/motion) в `src/styles/tokens.css`. **Меняйте значения токенов, а не структуру компонентов** — правка одного токена рестайлит всё приложение и сохраняет обе темы (Moode Dark + Gruvbox) и доступность.
>
> Дополняющие файлы в репозитории: `DESIGN.md` (формальная спека дизайн-системы и API примитивов) и `docs/DESIGN_MIGRATION_PLAN.md`.

## Оглавление

1. Обзор и визуальный язык. Темы и цвета
2. Дизайн-токены (шкалы)
3. Каталог компонентов
4. Экраны (вид и компоновка)
5. Иконки, обложки, движение, навигация, ограничения

## Обзор и визуальный язык

### Что это за приложение

**Wave UI** — лёгкий клиент-плеер (Svelte 5 SPA) для домашнего Hi-Fi аудиоплеера **moOde Audio**. Это веб-интерфейс, который заменяет/дополняет штатный UI moOde: он управляет воспроизведением (через MPD по WebSocket), показывает медиатеку (альбомы, артисты, плейлисты, папки), интегрирует Yandex Music. Приложение mobile-first и работает как PWA (есть Service Worker, манифест, кэширование обложек).

Цель документа — зафиксировать дизайн **как он есть сейчас в коде**, чтобы дизайнер мог дорабатывать визуал, опираясь на точные значения токенов.

### Общий визуальный тон

Эстетика — «как Apple Music / Spotify»: тёмный интерфейс, крупные обложки альбомов, мягкие скругления, красный фирменный акцент. Ключевые черты:

- **Глубокий тёмный фон.** Корпус приложения почти чёрный (`--c-bg-app: #000000`), основная рабочая область чуть светлее (`--c-bg-main: #121212`), карточки ещё на тон светлее (`--c-bg-card: #1a1a1a`). Это даёт классическую «слоистость» тёмных музыкальных приложений: фон → панель → карточка.
- **Стеклянные (glass) панели.** Шапки, поповеры и плавающие панели используют полупрозрачную «стеклянную» поверхность `--c-bg-glass: rgba(18, 18, 18, 0.95)` (в Gruvbox — `rgba(40, 40, 40, 0.98)`), что в связке с blur даёт эффект матового стекла поверх контента.
- **Красный акцент.** Фирменный цвет — насыщенно-красный/малиновый `--c-accent: #fa2d48` (hover — `#ff4d65`). Им подсвечиваются активные элементы, основные кнопки действия и «свечение» (`--c-shadow-glow-accent`). Отдельно есть «сердечко»/лайк — `--c-heart: #ff4444`.
- **Контрастный текст по иерархии.** Основной текст белый (`--c-text-primary: #ffffff`), вторичный приглушён до 60% белого, ещё более тихий «muted» — серый `#888888`. Это создаёт спокойную типографическую иерархию на тёмном фоне.
- **Тонкие границы и тени из прозрачностей.** Разделители и рамки строятся на полупрозрачном белом (`rgba(255,255,255,0.1…0.5)`), тени — на полупрозрачном чёрном. За счёт этого UI выглядит «бесшовным», без жёстких линий.
- **Мягкие интерактивные состояния.** Наведение/нажатие подсвечивают поверхность лёгкой белой плёнкой (`--c-surface-hover: rgba(255,255,255,0.1)` → active 0.2), иконки-кнопки слегка ужимаются при нажатии (`transform: scale(0.95)`).

### Как устроена темизация

Вся палитра вынесена в **CSS-кастомные свойства** с префиксом `--c-*` (color). Логика в трёх местах:

1. **Baseline (значения по умолчанию)** заданы в `src/styles/shared.css` в блоке `:root`. Это «дефолтная» тёмная тема (Moode Dark), прописанная напрямую в CSS — UI корректно выглядит ещё до загрузки JS.
2. **Определения тем** лежат в `src/lib/theme.ts` — массив `THEMES`, каждый элемент содержит `id`, человекочитаемый `label` и объект `colors` со всеми токенами `--c-*`.
3. **Применение активной темы** — в `src/lib/stores/ui.ts`. Стор `currentTheme` (writable) при подписке находит тему по id и **инъецирует её цвета поверх baseline**, перебирая `theme.colors` и вызывая `root.style.setProperty(key, value)` на `document.documentElement` (то есть инлайн-стили на `<html>` перекрывают значения из `:root`). Дополнительно на `<body>` ставится `data-theme="<id>"`.

> Важно для дизайнера: токены theme.ts — это «плоские» итоговые значения (не ссылки на `var(...)`). Внутри `shared.css` некоторые токены ссылаются друг на друга через `var(...)` (например `--c-text-secondary: var(--c-white-60)`), но при применении темы из JS они заменяются на конкретные строки из `theme.ts`.

**Темы (2 штуки):**

| id | label | Характер |
|---|---|---|
| `default` | Default (Moode Dark) | Чёрно-серая тёмная база, красный акцент `#fa2d48` |
| `gruvbox` | Gruvbox Dark | Тёплая тёмно-коричневая база `#282828`, оранжевый акцент `#d65d0e` |

**Хранение выбора:** id активной темы сохраняется в `localStorage` под ключом **`app_theme`** (по умолчанию `"default"`). При старте `ui.ts` читает этот ключ; смена темы сразу пишет его обратно.

> Как менять цвет: правьте значение соответствующего токена `--c-*` в `src/lib/theme.ts` (для активной темы). Менять цвета напрямую в компонентах не нужно — они все ссылаются на токены. Baseline в `shared.css` стоит держать синхронным с темой `default`.

Помимо цветовых токенов есть «тема-независимые» токены (размеры иконок, отступы `--space-*`, радиусы `--radius-*`, типографика `--text-*`/`--weight-*`, z-index, длительности транзишенов) — они вынесены в отдельный файл `src/styles/tokens.css` и в темизации не участвуют (одинаковы для обеих тем).

---

## Темы и цвета

Ниже — полные таблицы токенов обеих тем по категориям. Все значения взяты дословно из `src/lib/theme.ts`. Baseline в `shared.css` совпадает со значениями темы `default`.

### 0. Атомарные прозрачности (источник истины)

Базовые полупрозрачные «кирпичики», из которых в дефолт-теме собираются границы, поверхности и тени. В `default` это белый/чёрный, в `gruvbox` — тёплый кремовый (`251,241,199`) и тёмно-серый (`40,40,40`).

| Токен | default (Moode Dark) | gruvbox | Назначение |
|---|---|---|---|
| `--c-white-10` | rgba(255,255,255,0.1) | rgba(251,241,199,0.1) | Базовая лёгкая «плёнка» (hover, границы, плейсхолдеры) |
| `--c-white-20` | rgba(255,255,255,0.2) | rgba(251,241,199,0.2) | Усиленная плёнка (active, яркие границы, рельсы) |
| `--c-white-30` | rgba(255,255,255,0.3) | rgba(251,241,199,0.3) | Рельса прогресса при наведении |
| `--c-white-50` | rgba(255,255,255,0.5) | rgba(251,241,199,0.5) | Слабые иконки, пунктир при наведении |
| `--c-white-60` | rgba(255,255,255,0.6) | rgba(251,241,199,0.6) | Вторичный текст |
| `--c-white-90` | rgba(255,255,255,0.9) | rgba(251,241,199,0.9) | Почти непрозрачный белый/кремовый |
| `--c-black-20` | rgba(0,0,0,0.2) | rgba(40,40,40,0.2) | Лёгкое затемнение |
| `--c-black-50` | rgba(0,0,0,0.5) | rgba(40,40,40,0.5) | Затемняющий оверлей |
| `--c-black-70` | rgba(0,0,0,0.7) | rgba(40,40,40,0.7) | Сильное затемнение / тень фантома |
| `--c-black-80` | rgba(0,0,0,0.8) | rgba(40,40,40,0.8) | Бэкдроп модалок |
| `--c-black-90` | rgba(0,0,0,0.9) | rgba(40,40,40,0.9) | Максимальное затемнение |

### 1. Акценты (бренд)

| Токен | default | gruvbox | Назначение |
|---|---|---|---|
| `--c-accent` | #fa2d48 (красно-малиновый) | #d65d0e (оранжевый) | Главный фирменный акцент: активные элементы, основные кнопки, прогресс |
| `--c-accent-hover` | #ff4d65 | #fe8019 | Тот же акцент при наведении (светлее) |

### 2. Текст

| Токен | default | gruvbox | Назначение |
|---|---|---|---|
| `--c-text-primary` | #ffffff | #fbf1c7 (кремовый) | Основной текст, заголовки |
| `--c-text-secondary` | rgba(255,255,255,0.6) | #ebdbb2 | Вторичный текст, подписи |
| `--c-text-muted` | #888888 | #928374 | Самый тихий текст (мета, неактивное) |
| `--c-text-inverse` | #000000 | #282828 | Текст на светлом/акцентном фоне (инверсия) |

### 3. Фоны

| Токен | default | gruvbox | Назначение |
|---|---|---|---|
| `--c-bg-app` | #000000 | #282828 | Корпус всего приложения (самый нижний слой) |
| `--c-bg-main` | #121212 | #282828 | Основная рабочая/контентная область |
| `--c-bg-sidebar` | #000000 | #282828 | Фон сайдбара навигации |
| `--c-bg-card` | #1a1a1a | #3c3836 | Карточки (альбомы, элементы списков) |
| `--c-bg-placeholder` | rgba(255,255,255,0.1) | #504945 | Плейсхолдер отсутствующей обложки/изображения |
| `--c-bg-glass` | rgba(18,18,18,0.95) | rgba(40,40,40,0.98) | «Стеклянные» панели (шапки, поповеры) — полупрозрачный фон под blur |
| `--c-bg-toast` | #333333 | #32302f | Фон всплывающих уведомлений (toast) |
| `--c-heart` | #ff4444 | #fb4934 | Цвет «лайка»/сердечка (активная иконка) |
| `--c-error` | #ff4444 | #cc241d | Цвет ошибок |
| `--c-error-ring` | rgba(255,68,68,0.3) | rgba(204,36,29,0.3) | Подсветка-кольцо вокруг ошибочного поля |

### 4. Интерактивные поверхности

| Токен | default | gruvbox | Назначение |
|---|---|---|---|
| `--c-surface-hover` | rgba(255,255,255,0.1) | #3c3836 | Подсветка элемента при наведении |
| `--c-surface-active` | rgba(255,255,255,0.2) | #504945 | Подсветка при нажатии/активном состоянии |
| `--c-surface-input` | #1a1a1a | #3c3836 | Фон полей ввода |
| `--c-surface-input-focus` | rgba(255,255,255,0.1) | #504945 | Фон поля ввода в фокусе |
| `--c-surface-button` | rgba(255,255,255,0.1) | rgba(251,241,199,0.1) | Фон вторичных/мелких кнопок и бейджей |
| `--c-surface-button-hover` | rgba(255,255,255,0.1) | rgba(251,241,199,0.2) | Фон кнопки при наведении |
| `--c-surface-drag-phantom` | #1a1a1a | #504945 | «Фантом» перетаскиваемого элемента (drag&drop) |
| `--c-surface-drag-land` | rgba(255,255,255,0.1) | rgba(251,241,199,0.1) | Зона приземления при перетаскивании |
| `--c-rail-bg` | rgba(255,255,255,0.2) | #504945 | Незаполненная часть рельсы прогресса/громкости |
| `--c-rail-bg-hover` | rgba(255,255,255,0.3) | #665c54 | Рельса при наведении |
| `--c-skeleton-base` | rgba(255,255,255,0.1) | #3c3836 | Фон скелетон-плейсхолдеров при загрузке |

### 5. Границы и разделители

| Токен | default | gruvbox | Назначение |
|---|---|---|---|
| `--c-border` | rgba(255,255,255,0.1) | #504945 | Основная граница/разделитель |
| `--c-border-dim` | rgba(255,255,255,0.1) | #3c3836 | Приглушённая граница |
| `--c-border-bright` | rgba(255,255,255,0.2) | #665c54 | Яркая (выделенная) граница |
| `--c-border-dashed` | rgba(255,255,255,0.2) | rgba(168,153,132,0.2) | Пунктирная граница (dropzone) |
| `--c-border-dashed-hover` | rgba(255,255,255,0.5) | rgba(168,153,132,0.5) | Пунктир при наведении |

### 6. Оверлеи и тени

| Токен | default | gruvbox | Назначение |
|---|---|---|---|
| `--c-overlay-dim` | rgba(0,0,0,0.5) | rgba(40,40,40,0.6) | Затемняющий оверлей над контентом |
| `--c-overlay-backdrop` | rgba(0,0,0,0.8) | rgba(29,32,33,0.8) | Бэкдроп под модалками/full-player |
| `--c-shadow-card` | rgba(0,0,0,0.3) | rgba(0,0,0,0.3) | Тень карточек |
| `--c-shadow-popover` | rgba(0,0,0,0.5) | rgba(0,0,0,0.5) | Тень поповеров/меню |
| `--c-shadow-header` | rgba(0,0,0,0.5) | rgba(0,0,0,0.2) | Тень под «стеклянной» шапкой |
| `--c-shadow-phantom` | rgba(0,0,0,0.7) | rgba(0,0,0,0.5) | Тень фантома при перетаскивании |
| `--c-shadow-glow-accent` | rgba(250,45,72,0.5) | rgba(214,93,14,0.3) | Акцентное «свечение» вокруг активных элементов |

### 7. Иконки

| Токен | default | gruvbox | Назначение |
|---|---|---|---|
| `--c-icon-idle` | #9ca3af (серый) | #a89984 | Иконка в покое |
| `--c-icon-hover` | #ffffff | #fbf1c7 | Иконка при наведении |
| `--c-icon-faint` | rgba(255,255,255,0.5) | #504945 | Слабая/декоративная иконка |

### 9. Палитра карточек плейлистов (`--c-pl-0..5`)

Шесть «цветных» оттенков для авто-раскраски карточек плейлистов (циклически по индексу). В default — яркая многоцветная палитра, в gruvbox — приглушённые цвета палитры Gruvbox.

| Токен | default | gruvbox | Условный цвет |
|---|---|---|---|
| `--c-pl-0` | #fa2d48 | #cc241d | Красный |
| `--c-pl-1` | #2d7afa | #458588 | Синий / сине-зелёный |
| `--c-pl-2` | #2dfa85 | #a6e3a1 | Зелёный |
| `--c-pl-3` | #faac2d | #d65d0e | Оранжевый/жёлтый |
| `--c-pl-4` | #b82dfa | #b16286 | Фиолетовый/пурпурный |
| `--c-pl-5` | #2dfaf3 | #fabd2f | Бирюзовый / жёлтый |

> Итог для правок: любое изменение цвета сводится к редактированию значения нужного `--c-*` токена в `src/lib/theme.ts` (в объекте `colors` соответствующей темы). Структурные/размерные токены живут отдельно в `src/styles/tokens.css` и от темы не зависят.

---

## Дизайн-токены (шкалы)

Все темо-инвариантные значения дизайна определены в одном файле: `src/styles/tokens.css` (импортируется ДО `shared.css` / `MusicViews.css`). Здесь живёт всё, кроме цветов — цвета задаются по-теме в `src/lib/theme.ts` и инъектируются на `:root` через `ui.ts`. Композитные токены (`--border-*`, `--shadow-*`) хранят инвариантную геометрию здесь, но ссылаются на цвета темы через `var(--c-*)`.

ВАЖНО для дизайнера: всё измеряемое в макете нужно брать отсюда. Любое значение в коде — это один из этих токенов. Off-scale значения (помеченные «CANDIDATE») — это литералы, токенизированные «как есть» ради визуального паритета; они кандидаты на «причёсывание» в фазе Claude Design (не трогались в коде).

### Отступы — `--space-*` (база 4px)

Шкала на базе 4px (`--space-1 = 4px`). Отрицательные отступы делаются через `calc(-1 * var(--space-*))`. `auto` остаётся литералом (это keyword, не значение).

**On-scale (кратно 4px):**

| Токен | Значение | Назначение / где |
|---|---|---|
| `--space-0` | `0` | нулевой padding/margin/inset/gap (~53 исп.) |
| `--space-0_5` | `2px` | микро-spacing для бейджей/индикаторов |
| `--space-1` | `4px` | 1x, очень частый |
| `--space-2` | `8px` | gap:8px (x14) |
| `--space-3` | `12px` | gap:12px (x11), margin-bottom:12px (x8) |
| `--space-4` | `16px` | канонический inset контейнера; padding:0 16px (x10) |
| `--space-5` | `20px` | gap:20px (x6) |
| `--space-6` | `24px` | margin-bottom:24px (x5) |
| `--space-8` | `32px` | spacing секций настроек (x5) |
| `--space-10` | `40px` | padding empty-state (x3); отриц. inset через calc |

**Off-scale (паритет, CANDIDATE на рационализацию):**

| Токен | Значение | Назначение / кандидат |
|---|---|---|
| `--space-px` | `1px` | hairline / субпиксельный сдвиг (VolumeSlider) |
| `--space-2xs` | `6px` | gap:6px (x5), padding:6px (x3) — CANDIDATE: 4 или 8 |
| `--space-2_5` | `10px` | gap:10px (x15, самый частый gap) — CANDIDATE: 8 или 12 |
| `--space-3px` | `3px` | один бейдж — CANDIDATE: 2/4 |
| `--space-5px` | `5px` | редкий — CANDIDATE: 4/6 |
| `--space-7px` | `7px` | центрирование thumb в VolumeSlider — CANDIDATE: 8 |
| `--space-14px` | `14px` | строки context/sort-меню — CANDIDATE: 12 или 16 |
| `--space-15px` | `15px` | MainScreen — CANDIDATE: 16 |
| `--space-28px` | `28px` | 7x базы; SideMenu / fold-handle MiniPlayer |
| `--space-30px` | `30px` | gap FullPlayer, стрелка select в Alarm — CANDIDATE: 32 |
| `--space-50px` | `50px` | зазор под mini-player в MainScreen — CANDIDATE: привязать к `--mini-player-height` |

### Типографика — размеры `--text-*`

T-shirt шкала, 1:1 с реальными px. На `!important`-местах используется `var(--text-*) !important`.

| Токен | Значение | Назначение |
|---|---|---|
| `--text-2xs` | `10px` | микро-caption: nav-лейблы, бейджи, мета плиток |
| `--text-xs` | `11px` | caption: артист в MiniPlayer, подсказки, `.meta-tag` |
| `--text-sm` | `12px` | малый caption / мета |
| `--text-base-sm` | `13px` | плотный body: TrackRow, пункты меню — OFF-SCALE candidate |
| `--text-base` | `14px` | ОСНОВНОЙ body (23 исп., самый частый) |
| `--text-md` | `15px` | усиленный body/label: тайтлы треков/карточек — OFF-SCALE candidate |
| `--text-lg` | `16px` | label/subtitle; безопасный размер input (без zoom на iOS) |
| `--text-xl` | `18px` | title: заголовки настроек/секций |
| `--text-2xl` | `20px` | title-lg: заголовки страниц |
| `--text-3xl` | `24px` | display-sm: тайтл FullPlayer |
| `--text-4xl` | `28px` | display — OFF-SCALE candidate (единичный, между 24 и 32) |
| `--text-5xl` | `32px` | display: заголовок SettingsView |
| `--text-6xl` | `40px` | display-xl: hero-числа |
| `--text-7xl` | `48px` | display-2xl: hero |
| `--text-8xl` | `60px` | display-3xl: иконка empty-state — OFF-SCALE candidate |

### Межстрочный интервал — `--leading-*`

| Токен | Значение | Назначение |
|---|---|---|
| `--leading-none` | `1` | иконки / однострочные числа |
| `--leading-tight` | `1.1` | очень плотный display — OFF-SCALE candidate (слить со snug) |
| `--leading-snug` | `1.2` | плотный многострочный: TrackRow |
| `--leading-normal` | `1.5` | читаемый body: Modal |

### Межбуквенный интервал — `--tracking-*`

| Токен | Значение | Назначение |
|---|---|---|
| `--tracking-tight` | `0.2px` | лёгкий трекинг: `.meta-tag` — OFF-SCALE candidate |
| `--tracking-wide` | `0.5px` | uppercase-пиллы/бейджи |

### Насыщенность шрифта — `--weight-*`

`bold` нормализован в `700` (визуально идентично).

| Токен | Значение | Назначение |
|---|---|---|
| `--weight-regular` | `400` | дефолтный body |
| `--weight-medium` | `500` | тайтлы треков, `.sort-item.selected` |
| `--weight-semibold` | `600` | самый частый акцентный вес (18x) |
| `--weight-bold` | `700` | 700 (x11) + `bold` (x4) → 700 |
| `--weight-extrabold` | `800` | display-заголовки, бейдж RadioView |

### Семейство шрифтов — `--font-*`

| Токен | Значение | Назначение |
|---|---|---|
| `--font-sans` | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | системный стек, основной body |
| `--font-mono` | `monospace` | техническое/числовое: версия, время, коды |

Примечание: `font-family: inherit` (кнопки/инпуты) оставлен литералом (поведенческое).

### Радиусы — `--radius-*`

`--radius-xl` намеренно УНИФИЦИРОВАН в `20px` (раньше было split: default 20 / gruvbox 16) — радиус считается инвариантной осью; gruvbox-карточки/модалки стали чуть круглее.

| Токен | Значение | Назначение |
|---|---|---|
| `--radius-xs` | `2px` | тонкие рейлы/скроллбар/прогресс (x7); 1px/3px снапятся сюда |
| `--radius-sm` | `4px` | миграция raw 4px (x6) |
| `--radius-md` | `8px` | миграция raw 8px (x12) |
| `--radius-lg` | `12px` | миграция raw 12px (x12) |
| `--radius-xl` | `20px` | УНИФИЦИРОВАН (gruvbox 16 → 20) |
| `--radius-full` | `9999px` | pill/капсула (отличается от circle) |
| `--radius-circle` | `50%` | самый частый радиус (18x): круглые аватары/кнопки/ручки |
| `--radius-pill` | `var(--radius-full)` | семантический алиас pill-контролов; отвязывает скругление пиллы от `--radius-xl` |
| `--radius-6px` | `6px` | `.mono-badge` в AlarmSettings — CANDIDATE: sm/md |

### Ширина границ — `--border-width-*` и композитные `--border-*`

| Токен | Значение | Назначение |
|---|---|---|
| `--border-width-thin` | `1px` | доминирующая ширина границы (39x) |
| `--border-width-thick` | `2px` | акцент / границы dropzone (5x) |
| `--border-default` | `1px solid var(--c-border)` | стандартная граница (цвет из темы) |
| `--border-default-dim` | `1px solid var(--c-border-dim)` | приглушённая граница |
| `--border-dashed` | `2px dashed var(--c-border-dashed)` | пунктирная (dropzone) |

### Тени — `--shadow-*`

Инвариантная геометрия + цвет из темы через `var()`. `-strong` варианты держат паритет `--c-black-*`; `-header`/`-popover` оставлены отдельными, т.к. цвет расходится по темам (не сливать — изменит gruvbox).

| Токен | Значение | Назначение |
|---|---|---|
| `--shadow-xs` | `0 1px 3px var(--c-shadow-card)` | минимальная карточная |
| `--shadow-xs-strong` | `0 1px 3px var(--c-black-50)` | паритет `--c-black-50` |
| `--shadow-sm` | `0 2px 4px var(--c-shadow-card)` | малая |
| `--shadow-sm-strong` | `0 2px 4px var(--c-black-50)` | паритет `--c-black-50` |
| `--shadow-md` | `0 4px 12px var(--c-shadow-card)` | средняя |
| `--shadow-md-popover` | `0 4px 15px var(--c-shadow-popover)` | popover MainScreen — CANDIDATE: слить с md |
| `--shadow-lg` | `0 8px 24px var(--c-shadow-card)` | большая |
| `--shadow-xl` | `0 10px 40px var(--c-black-70)` | меню/модалка/контекст |
| `--shadow-xl-header` | `0 10px 40px var(--c-shadow-header)` | цвет расходится по темам — отдельно |
| `--shadow-2xl` | `0 20px 50px var(--c-shadow-phantom)` | самая глубокая (drag-фантом) |
| `--shadow-glow` | `0 0 10px var(--c-shadow-glow-accent)` | акцентное свечение (active в RadioView) |
| `--shadow-focus-ring` | `0 0 0 3px var(--c-accent)` | фокус-ринг (MusicViews) |
| `--shadow-error-ring` | `0 0 0 1px var(--c-error-ring)` | error-ринг модалки (нужен `--c-error-ring` в theme.ts) |

### Z-index — `--z-*`

Глобальные полосы + малая локальная шкала.

| Токен | Значение | Назначение |
|---|---|---|
| `--z-bg` | `-1` | фоновый blur/overlay (main.css); -2 в отдельном контексте |
| `--z-base` | `1` | базовый локальный стек |
| `--z-above` | `2` | малый локальный шаг (внутри компонента) |
| `--z-content` | `3` | локальный контент (слои 3-5 коллапсят сюда) |
| `--z-overlay-local` | `10` | локальный overlay (RadioView/PlaylistGrid) |
| `--z-miniplayer` | `100` | внутренний стек MiniPlayer (базовый; 101/105/110 через offset) |
| `--z-sidebar` | `999` | сайдбар |
| `--z-dock` | `1000` | док |
| `--z-modal` | `2000` | модалки |
| `--z-toast` | `3000` | тосты |
| `--z-menu` | `9000` | меню |
| `--z-drag-item` | `9999` | перетаскиваемый элемент |
| `--z-context-menu` | `10001` | контекстное меню (самый верх) |

### Motion — переходы, длительности, easing

**Композитные шорткаты `--trans-*` (для совместимости; предпочтительнее декомпозиция):**

| Токен | Значение | Назначение |
|---|---|---|
| `--trans-fast` | `0.2s ease` | ~21 raw-сайт 0.2s |
| `--trans-smooth` | `0.3s cubic-bezier(0.2, 0.8, 0.2, 1)` | 6 хардкод-совпадений |

**Длительности `--dur-*` (компонуются с `--ease-*` по свойствам):**

| Токен | Значение | Назначение |
|---|---|---|
| `--dur-instant` | `0.1s` | press-feedback микро-интеракции (7x) |
| `--dur-fast` | `0.2s` | пара к `--trans-fast` |
| `--dur-base` | `0.3s` | пара к `--trans-smooth` |
| `--dur-slow` | `0.4s` | drawer/width-анимации (SideMenu); 0.5s снапится сюда |
| `--dur-slow-2` | `0.25s` | one-off — CANDIDATE: снап к fast/base |

**Easing `--ease-*`:**

| Токен | Значение | Назначение |
|---|---|---|
| `--ease-default` | `ease` | дефолтный |
| `--ease-emphasized` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | стандартный decelerate (= `--trans-smooth`) |
| `--ease-sharp` | `cubic-bezier(0.2, 0, 0, 1)` | enter-кривая списков (BaseList/MusicViews) |
| `--ease-soft` | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | SideMenu — CANDIDATE: слить с emphasized |
| `--ease-linear` | `linear` | spin/progress/marquee |

### Размеры контролов — `--control-h-*`, паддинги, switch, круглые кнопки

**Высоты контролов:**

| Токен | Значение | Назначение |
|---|---|---|
| `--control-h-sm` | `32px` | `.btn-icon.small`, компактный vol-btn |
| `--control-h-md` | `36px` | `.btn-action` (мобайл), `.btn-primary.small` |
| `--control-h-lg` | `40px` | дефолтная/большая высота контрола |
| `--control-h-xl` | `48px` | search-input, play в MiniPlayer, nav-item, back-btn |
| `--control-h-2xl` | `50px` | header-строки ContextMenu/Modal — CANDIDATE: vs 48 |

**Горизонтальные паддинги контролов (алиасы spacing):**

| Токен | Значение | Назначение |
|---|---|---|
| `--control-pad-x-sm` | `16px` | = `--space-4` |
| `--control-pad-x-md` | `20px` | = `--space-5` |

**Паддинги «голых» icon-кнопок:**

| Токен | Значение | Назначение |
|---|---|---|
| `--icon-btn-pad` | `8px` | `.btn-icon`, `.vol-btn` (~40px target вокруг 24px глифа) |
| `--icon-btn-pad-lg` | `10px` | transport `.side-btn`/`.mode-btn`/`.like-btn` — CANDIDATE: 8 |
| `--icon-btn-pad-sm` | `6px` | компактные (docked) icon-кнопки |

**Toggle-переключатель `--switch-*`:**

| Токен | Значение | Назначение |
|---|---|---|
| `--switch-w` | `44px` | ширина трека `.toggle-btn` |
| `--switch-h` | `24px` | высота трека |
| `--switch-knob` | `20px` | `.toggle-circle`; ход = w − knob − 2×1px inset |

**Круглые icon-кнопки `--circle-btn-*`:**

| Токен | Значение | Назначение |
|---|---|---|
| `--circle-btn-sm` | `28px` | `.tiny-dots`, `.card-menu-btn` — CANDIDATE: 32 |
| `--circle-btn-md` | `32px` | дефолтная малая круглая кнопка |

**Круглые play-кнопки `--circle-play-*`:**

| Токен | Значение | Назначение |
|---|---|---|
| `--circle-play-sm` | `44px` | docked play-btn-large в FullPlayer — CANDIDATE |
| `--circle-play-md` | `48px` | `.play-btn` в MiniPlayer |
| `--circle-play-lg` | `64px` | `.play-btn-large` в FullPlayer |

### Размеры иконок — `--icon-size-*` (svg-глифы)

| Токен | Значение | Назначение |
|---|---|---|
| `--icon-size-xs` | `16px` | `.small` в TrackRow, clear-icon-btn, sort-trigger-icon |
| `--icon-size-sm` | `18px` | `.btn-action`, `.btn-icon.small`, search-icon в списке |
| `--icon-size-md` | `20px` | компактный transport, `.icon` в ContextMenu, chevron настроек |
| `--icon-size-lg` | `24px` | дефолтный transport/nav-глиф (самый частый) |
| `--icon-size-xl` | `28px` | глиф `.play-btn-large` в FullPlayer |

### Прозрачность — `--opacity-*`

Рампа; близкие значения поглощены (см. кандидаты).

| Токен | Значение | Назначение / кандидаты |
|---|---|---|
| `--opacity-hidden` | `0` | enter/exit скрытое (10x) |
| `--opacity-ghost` | `0.3` | бледный фон/скелетоны; 0.1/0.2/0.4 OFF-SCALE candidates |
| `--opacity-faint` | `0.5` | disabled/dim (13x) |
| `--opacity-muted` | `0.6` | вторичный текст/иконки (9x); совпадает с `:disabled` 0.6 |
| `--opacity-dim` | `0.7` | приглушённое (6x) |
| `--opacity-strong` | `0.8` | почти непрозрачные overlay; 0.85/0.9/0.95 OFF-SCALE candidates |
| `--opacity-visible` | `1` | показанное состояние (13x) |

### Layout (инвариантный в обеих темах)

| Токен | Значение | Назначение |
|---|---|---|
| `--header-height` | `64px` | высота шапки |
| `--mini-player-height` | `90px` | высота мини-плеера |
| `--icon-stroke-width` | `1.5px` | толщина обводки иконок |

### Типографика контролов (семантические алиасы)

| Токен | Значение | Назначение |
|---|---|---|
| `--text-control` | `var(--text-base)` (14px) | дефолтный размер контрола/лейбла |
| `--weight-control` | `var(--weight-bold)` | вес pill-кнопки (вторичные контролы: `--weight-semibold`) |

### Брейкпоинты — `--bp-*` (DOC-ONLY)

ВНИМАНИЕ: CSS custom properties НЕЛЬЗЯ использовать внутри `@media` feature-запросов. Это единственный документированный источник правды; зеркалятся в `constants.ts` (`BREAKPOINTS`) для `matchMedia`, а в `@media` остаются литеральные px.

| Токен | Значение | Назначение |
|---|---|---|
| `--bp-sm` | `600px` | мобайл / landscape-short |
| `--bp-md` | `768px` | основной мобильный брейкпоинт (7 исп.) |
| `--bp-lg` | `800px` | планшет, one-off (MusicViews) — CANDIDATE: слить в 768 |

### Сводка off-scale кандидатов на «причёсывание»

Для фазы Claude Design — значения, выпадающие из 4px-сетки / T-shirt-шкалы и помеченные как CANDIDATE:
- **Spacing**: `--space-2xs` (6), `--space-2_5` (10), `--space-3px` (3), `--space-5px` (5), `--space-7px` (7), `--space-14px` (14), `--space-15px` (15), `--space-30px` (30), `--space-50px` (50, привязать к высоте мини-плеера).
- **Типографика**: `--text-base-sm` (13), `--text-md` (15), `--text-4xl` (28), `--text-8xl` (60).
- **Leading**: `--leading-tight` (1.1, слить со snug).
- **Tracking**: `--tracking-tight` (0.2px).
- **Радиусы**: `--radius-6px` (6).
- **Тени**: `--shadow-md-popover` (слить с md).
- **Motion**: `--dur-slow-2` (0.25s), `--ease-soft` (слить с emphasized).
- **Контролы**: `--control-h-2xl` (50 vs 48), `--icon-btn-pad-lg` (10 → 8), `--circle-btn-sm` (28 → 32), `--circle-play-sm` (44).
- **Брейкпоинты**: `--bp-lg` (800 → 768).
- **Opacity**: поглощённые 0.1/0.2/0.4 (вокруг `ghost`) и 0.85/0.9/0.95 (вокруг `strong`).

---

## Каталог компонентов

Все размеры/цвета берутся из CSS-токенов. Ключевые числовые значения подставлены справочно: акцент `--c-accent` = **#fa2d48**, hover акцента `--c-accent-hover` = **#ff4d65**, «сердце»/лайк `--c-heart` = **#ff4444**. Радиусы: `--radius-xs`=2px, `--radius-sm`=4px, `--radius-md`=8px, `--radius-lg`=12px, `--radius-xl`=20px, `--radius-pill`=`--radius-full`=9999px, `--radius-circle`=50%. Высоты контролов: `--control-h-sm`=32, `--control-h-md`=36, `--control-h-lg`=40, `--control-h-xl`=48, `--control-h-2xl`=50px.

---

### 3.1 Кнопки

### Button (примитив `ui/Button.svelte`)
Пилюля (полностью скруглённая), inline-flex с центровкой, `gap` 8px между иконкой и текстом, рамка 1px (прозрачная по умолчанию), шрифт `--font-sans`, вес `--weight-control`, `line-height: 1`. Анимация нажатия — `scale(0.97)`; focus-visible — кольцо `--shadow-focus-ring`; disabled — `opacity: --opacity-muted`, курсор default. При `loading` контент скрывается (`visibility: hidden`) и поверх крутится спиннер `currentColor` (16px, 2px бордюр, правый край прозрачный, вращение 0.6s).

**Размеры:**

| size | высота | паддинг по X | размер шрифта |
|---|---|---|---|
| `sm` | 36px (`--control-h-md`) | 0 16px | 13px (`--text-base-sm`) |
| `md` (по умолч.) | 40px (`--control-h-lg`) | 0 20px | `--text-control` |
| `lg` | 40px | 0 24px | `--text-control` |

**Варианты:**

| variant | фон | текст | hover | особенности |
|---|---|---|---|---|
| `primary` | `--c-accent` (#fa2d48) | `--c-text-primary` | фон → `--c-accent-hover` | UPPERCASE, трекинг `--tracking-wide` |
| `secondary` (по умолч.) | `--c-surface-button` | `--c-text-primary` | фон → `--c-surface-button-hover`; active → `--c-surface-active` | sentence-case |
| `ghost` | прозрачный, рамка `--c-border` | `--c-text-primary` | фон `--c-surface-hover`, рамка → текст | — |
| `danger` | прозрачный | `--c-accent` (красный) | фон `--c-surface-hover` | текстовая «опасная» |

**Доп. режимы:** `icon` (квадратный hit-target без горизонтального паддинга, glyph центрирован, svg 18px со stroke `--icon-stroke-width`; ширина = высоте size), `block` (`width:100%; flex:1` — для футера модалок).

### Легаси-кнопки в `MusicViews.css` (`.btn-primary` / `.btn-secondary` / `.btn-action`)
Визуально идентичны варианту Button md: высота 40px, `--radius-pill`, без рамки, паддинг 0 20px, `scale(0.97)` на active.
- **`.btn-primary`** — фон `--c-accent`, текст белый, UPPERCASE + трекинг `--tracking-wide`; disabled → `opacity --opacity-muted`.
- **`.btn-secondary`** — фон `--c-surface-button`; hover → `--c-surface-button-hover`; active → `--c-surface-active`.
- **`.btn-action`** — иконочная квадратная **40×40**, прозрачный фон, рамка 1px `--c-border`, паддинг 0; svg форсятся в 18px (stroke 1.5). Состояние `.active` — заливка `--c-accent` + рамка акцент; hover — фон `--c-surface-hover`, рамка → текст. На мобайле (≤768px) ужимается до 36×36.

### IconButton (примитив `ui/IconButton.svelte`)
Голая иконочная кнопка. По умолчанию: прозрачный фон, цвет `--c-text-secondary`, паддинг 8px (`--icon-btn-pad`), без рамки. Active — `scale(0.95)`; disabled — `opacity --opacity-faint`; focus-visible — `--shadow-focus-ring`. `aria-label` обязателен.

- **Форма:** `circle` (`--radius-circle`) или `square` (`--radius-md`).
- **Размер svg:** `sm`=18px, `md`=20px, `lg`=24px (по умолч., транспорт/навигация).
- **Варианты:** `naked` (hover → текст `--c-text-primary` + фон `--c-surface-hover`); `filled` (фон `--c-surface-button`, текст primary, hover → `--c-surface-button-hover`); `overlay` (полупрозрачный чип `--c-black-20` поверх медиа, hover → `--c-black-50`).
- **Тона / active:** `accent` (active/hover → `--c-accent`), `heart` (active → `--c-heart`), `default` (active → `--c-text-primary`).

### Иконочные кнопки в строках (`.btn-icon.small`)
Круглые **32×32** (`--circle-btn-md`), прозрачный фон, цвет `--c-text-secondary`, svg форсятся в 18px. Hover — фон `--c-surface-hover`, цвет primary. Применяется к три-точкам и кнопке remove в `TrackRow`.

### Play-кнопки (круглые, белые)
Все имеют круглую форму, фон `--c-text-primary` (белый), иконку `--c-text-inverse`, тень, нажатие `scale(0.95)`.

| где | класс | размер | hover |
|---|---|---|---|
| MiniPlayer-док | `.play-btn` | 48px (`--circle-play-md`), svg 24px; на мобайле 40px | `scale(1.05)`, тень `--shadow-md` |
| FullPlayer полноэкр. | `.play-btn-large` | 64px (`--circle-play-lg`), svg 28px (`--icon-size-xl`, fill currentColor) | active `scale(0.95)` |
| FullPlayer docked | `.play-btn-large` (is-docked) | 44px (`--circle-play-sm`), svg 20px | — |

### Toggle / свитч (примитив `ui/Toggle.svelte`)
Трек **44×24px** (`--switch-w`/`--switch-h`), `--radius-lg` (12px), рамка 1px `--c-border`, фон `--c-surface-input`. Кнопка-кружок **20px** (`--switch-knob`), белая (`--c-text-primary`), `--radius-circle`, тень `--shadow-xs`, инсет 1px сверху/слева.
- **Checked:** трек → фон+рамка `--c-accent`; кружок едет `translateX(20px)` с плавным `--trans-smooth`.
- **States:** disabled → `opacity --opacity-faint`; focus-visible — кольцо. `role="switch"`, клавиатура: Space/Enter/стрелки.

### PlayModeButton (`PlayModeButton.svelte`)
Иконочная кнопка `--c-text-secondary`, паддинг 10px (`--icon-btn-pad-lg`), svg 24px. Активный режим (>0) — цвет `--c-accent` + точка-индикатор `.dot` (4×4px, акцент, по центру снизу). Иконка SHUFFLE (режим 1) или REPEAT (режим 2). Compact-режим: паддинг 6px, svg 20px, `opacity --opacity-dim` (active → visible), точка 3×3px.

### LikeButton (`LikeButton.svelte`)
Иконочная, паддинг 10px (`--icon-btn-pad-lg`), цвет `--c-text-secondary`, svg 24px (сердце HEART/HEART_FILLED). Liked → цвет `--c-heart` (#ff4444). Active — `opacity --opacity-dim`. Compact: паддинг `--icon-btn-pad-sm` (6px), svg 20px.

---

### 3.2 Поля ввода / поиск

### Input (примитив `ui/Input.svelte`)
Контейнер flex, фон `--c-surface-input`, рамка 1px `--c-border`, `--radius-md` (8px). `:focus-within` → фон `--c-surface-input-focus`, рамка `--c-accent`. Error — рамка `--c-error` + кольцо `--shadow-error-ring`. Disabled — `opacity --opacity-faint`. Плейсхолдер — `--c-text-secondary`.

**Размеры:**

| size | min-высота | паддинг | шрифт |
|---|---|---|---|
| `sm` | 36px | 8px 12px | 15px (`--text-md`) |
| `md` (по умолч.) | 40px | 10px 12px | 14px (`--text-base`) |

**Search-вариант:** высота **48px** (`--control-h-xl`), `--radius-lg` (12px), паддинг 0 16px, рамка `--c-border-dim`, gap 12px; `:focus-within` рамка → `--c-border-bright`; шрифт инпута 16px (анти-зум iOS). Compact search → 36px / `--radius-md` / 15px.
- **Лидирующая иконка** (`field__icon`): svg 20px, цвет `--c-icon-idle`.
- **Trailing clear** (`field__clear`): 24px ширина, цвет `--c-text-muted`, svg 16px «крестик»; hover → primary; показывается только при непустом значении.

### Канонический поиск `.search-input-container` (MusicViews.css)
Высота 48px, фон `--c-surface-input`, рамка `--border-default-dim`, `--radius-lg`, паддинг 0 16px, нижний отступ 24px. `:focus-within` → фон `--c-surface-input-focus`, рамка `--c-border-bright`. Инпут — прозрачный, 16px (`--text-lg`), плейсхолдер `--c-text-secondary`. Иконка `.search-icon` — 20px, `--c-icon-idle`, отступ справа 12px.

### Modal-input (`.modal-input` в Modal.svelte)
Ширина 100%, фон `--c-surface-input`, рамка 1px, паддинг 10px 12px, `--radius-md`, шрифт 14px. Focus — рамка `--c-accent`. Ошибка валидации: класс `.shake-error` — анимация тряски (±5px, длительность `--dur-base`), рамка `#ff4444`, кольцо `--shadow-error-ring`.

---

### 3.3 Карточки

### Music-card (`.music-card` в MusicViews.css) — медиа-плитка
Колоночный flex, паддинг 12px, `--radius-lg`, отрицательный margin `-10px` (для hover-«вылета»). **Hover:** фон `--c-surface-hover` + `translateY(-5px)` + z-index 2. Активная карточка: у обложки кольцо `--shadow-focus-ring`, заголовок → `--c-accent`.
- **Обложка** (`.card-img-container`): квадрат (`aspect-ratio:1`), `--radius-md`, фон-плейсхолдер `--c-bg-placeholder`, тень `--shadow-lg`, overflow hidden.
- **Overlay** (`.play-overlay`): абсолютный поверх обложки, фон `--c-overlay-dim`, `opacity:0` → 1 на hover/active; внутри `.overlay-icon` — белая play-иконка 48px с drop-shadow.
- **Заголовок** (`.card-title`): 15px (`--text-md`), `--weight-semibold`, один ряд с эллипсисом.
- **Подзаголовок** (`.card-sub-row`/`.card-sub`): 13px, `--c-text-secondary`, эллипсис.
- **Горизонтальный режим** (`.horizontal`): фикс. ширина 180px (мобайл 140px), scroll-snap; сетка `.music-grid` — auto-fill minmax(140px).
- **Dashed-плитка** (`.dashed-cover`, напр. «новый плейлист»): пунктирная рамка `--border-dashed`, фон `--c-border-dim`; hover — рамка `--c-border-dashed-hover`, фон `--c-surface-active`.

### Card (примитив `ui/Card.svelte`) — поверхность / поповер
Колоночный flex, gap 10px, фон `--c-bg-card`, `--radius-lg` (12px), рамка `--border-default` (1px `--c-border`), текст primary, `text-align:left`, `width:100%`.
- **Варианты:** `surface` (по умолч., только рамка); `popover` (+ тень `--shadow-xl`).
- **Паддинг:** `none` / `sm` (12px) / `md` (16px, по умолч.).
- **Clickable:** рендерится как `<button>`, hover → фон `--c-surface-hover`, active → фон + `scale(0.99)`, focus-visible — кольцо.

---

### 3.4 Списки-строки (TrackRow)

`.row` — flex, высота **64px**, паддинг 0 16px, `--radius-md`, низ. граница `--border-default-dim`, фон прозрачный, `user-select:none`. Hover → `--c-surface-hover`; класс `.active` (играет ровно эта строка) → фон `--c-surface-active`.

**Левая зона** (`.left`, ширина 80px, gap 12px):
- **Индикатор воспроизведения** (`TrackPlaybackIndicator`, `.num-box` 24×24): по контексту показывает номер трека (`--c-text-muted`, tabular-nums; активный → `--c-accent` bold), либо play/pause-иконку (на hover), либо **анимированный эквалайзер** `.eq-anim` (3 бара 3px, цвет `--c-accent`, прыгают 3↔12px, keyframes `eq` 0.6s со сдвигом фаз).
- **Drag-handle** (режим `editable`): 24×24, цвет `--c-text-muted`, курсор `grab`/`grabbing` (active → primary), иконка `DRAG_HANDLE`.
- **Обложка** (`.thumb`): 40×40, `--radius-sm`, фон-плейсхолдер, overflow hidden (рендер через `TrackThumb`).

**Центр** (`.info`):
- **Заголовок** (`.title`): 15px (`--text-md`), `--weight-medium`, primary, эллипсис; у активной строки → `--c-accent`. Рядом quality-бейдж `.meta-tag.quality`.
- **Артист** (`.artist`): 13px (`--text-base-sm`), `--c-text-secondary`; кликабельный (`.link`) — hover подчёркивание + primary.

**Правая зона** (`.right`, gap 10px):
- **Brand-icon** потокового источника (напр. Yandex) — 16px, `opacity --opacity-strong`.
- **Три-точки** (`.context-menu-btn`, `.btn-icon.small`): `opacity --opacity-muted`, hover → visible + primary.
- **LikeButton** (compact).
- **Длительность** (`.dur`): 13px, `--c-text-muted`, tabular-nums, ширина 28px, справа; либо (в editable) кнопка remove `.btn-icon.small.remove` (`--c-text-muted`, hover → `--c-accent`).

**Striped-состояние** (трек играет, но не точно эта строка в очереди): диагональная анимированная штриховка (`repeating-linear-gradient -45deg`, шаг 10px, цвет `--c-surface-active`, `opacity 0.4`, бесконечная анимация `moveStripes` 2s).

---

### 3.5 Бейджи

| бейдж | где / класс | вид |
|---|---|---|
| **meta-tag** | `shared.css .meta-tag` | 11px (`--text-xs`), `--weight-semibold`, текст primary, фон `--c-surface-button`, паддинг 3px/4px, высота 18px, `--radius-sm`, трекинг `--tracking-tight`, inline-flex, без переноса |
| **meta-tag.quality** | качество (напр. «FLAC») | прозрачный фон, рамка 1px `--c-border`, текст primary, `opacity 0.9` |
| **card-badge** | `MusicViews.css .card-badge` | 11px (`--text-2xs`), semibold, текст белый, фон `rgba(255,255,255,0.1)`, паддинг 2px/5px, `border-radius:3px`, `line-height:1` |
| **card-badge.quality** | на карточке | прозрачный фон, рамка `--border-default`, текст primary |
| **header-label** | заголовок вью (`MusicViews.css`) | 14px, semibold, UPPERCASE, цвет `--c-accent` |

Отдельного `status-badge` в просмотренных файлах нет; статусную роль выполняют `meta-tag.quality` (бейдж качества) и точка-индикатор в `PlayModeButton`.

---

### 3.6 Меню / модалки

### ContextMenu (`ContextMenu.svelte`)
Поповер `.menu-card`: ширина **220px**, max-height 400px, фон `--c-bg-card`, `--radius-lg`, тень `--shadow-xl`, рамка 1px. Появление: backdrop `fade` 100ms + `blur(2px)`; карточка `scale` от 0.95, 100ms. Позиционируется относительно триггера (`menuPositioner`).
- **Шапка** (`.menu-header`): высота 50px (`--control-h-2xl`), фон `--c-white-10`, низ. граница. Внутри инфо трека: `.title` 13px bold + `.artist` 12px secondary (эллипсис). В под-меню «Select Playlist» — back-кнопка + `.header-title`.
- **Пункты** (`.menu-row`): flex, паддинг 12px/14px, текст primary 14px, слева иконка 20px (`--c-text-secondary`); hover/active → фон `--c-surface-hover`. Пункт «лайк» с активным состоянием — иконка `--c-heart`.
- **Разделитель** (`.sep`): линия 1px `--c-border`, margin 4px/16px, `opacity --opacity-ghost`.

### Modal (`Modal.svelte`)
Backdrop: `--c-overlay-dim` + `blur(4px)`, центрирование, паддинг 20px, `fade` 150ms. Карточка `.modal-card`: ширина 100%/max 320px, фон `--c-bg-card`, `--radius-lg`, тень `--shadow-xl`, рамка 1px; `scale` от 0.95, 200ms.
- **Шапка** (`.modal-header`): высота 50px, фон `--c-white-10`, низ. граница, паддинг 0 20px; заголовок 14px `--weight-semibold`.
- **Тело** (`.modal-body`): паддинг 24px/20px; `.modal-message` 14px, текст primary.
- **Select-список** (`.select-item`): фон `--c-surface-hover`, рамка прозрачная, паддинг 12px, `--radius-md`; hover → `--c-surface-active`; активный — рамка+текст `--c-accent`, фон `--c-surface-active`, semibold, галочка «✓».
- **Футер** (`.modal-actions`): кнопки во всю ширину (`flex:1`), верх. граница; паддинг 16px, semibold; `.cancel` — `--c-text-muted` + правый бордер; `.confirm` — `--c-accent`; active → фон `--c-surface-hover`.

### SortMenu (`styles/SortMenu.css`)
- **Триггер** (`.sort-trigger`): текстовая кнопка, цвет `--c-text-secondary`, 13px semibold, gap 4px, иконка 16px (`opacity --opacity-dim`); hover → primary.
- **Меню** (`.sort-menu`): абсолютное под триггером, отступ сверху 8px, min-width **160px**, фон `--c-bg-card`, рамка `--border-default`, `--radius-lg`, тень `0 10px 40px rgba(0,0,0,0.7)`, паддинг по Y 4px.
- **Пункты** (`.sort-item`): паддинг 12px/14px, цвет `--c-text-secondary`, 14px; hover → фон `--c-surface-hover` + primary; `.selected` — primary, `--weight-medium`, фон `rgba(255,255,255,0.05)`.
- **Backdrop** (`.sort-backdrop`): прозрачный, на весь экран, перехват клика.

---

### 3.7 Плееры

### MiniPlayer (`MiniPlayer.svelte`) — нижний док
`.dock`: фиксирован внизу, высота **90px** (`--mini-player-height`), фон `--c-bg-glass` + `backdrop-filter: blur(10px)`, верх. граница `--border-default-dim`. Клик открывает FullPlayer, long-press → контекст-меню.
- **Прогресс-бар** сверху дока (`.progress-bar`, высота hit-area 14px): рельс `.rail` 2px `--c-border`, заполнение `.fill` 2px `--c-accent`. Hover — рельс/заливка утолщаются до 4px и появляется белый круглый **knob** 12px (`scale 0` → 1) с тенью. Tooltip времени `.tooltip` над баром (фон `--c-surface-active`, 11px bold). Для радио бар скрыт. Под баром — «тень прогресса» `.progress-shadow` (`--c-surface-button`, opacity 0.1). Плавность заполнения — `--dur-slow-2` linear когда играет.
- **Сетка** (`.grid`): 3 колонки `1fr max-content 1fr`, паддинг 0 32px.
  - **Инфо:** обложка `.art` 64px (мобайл 48px), `--radius-sm`; заголовок 15px medium + три-точки `.tiny-dots` (28px, `opacity --opacity-dim`, скрыты на мобайле); артист 13px secondary + quality `meta-tag`.
  - **Контролы** (`.controls`, gap 20px): Like (desktop), Previous (IconButton), белая `.play-btn` 48px, Next, PlayModeButton (desktop).
  - **Громкость** (`.volume`, desktop): VolumeSlider compact.
- **Адаптив (≤768px):** скрыты `.desktop`-элементы, сетка 2 колонки, play-btn 40px, обложка 48px, три-точки и meta-tag скрыты.

### FullPlayer (`FullPlayer.svelte`) — полноэкранный
`.full-player`: фиксирован на весь экран, фон `--c-bg-app`, появление `fly` снизу (`y:800`, 300ms). Свайп вниз закрывает (drag по `currentY`, при >150px — close; обложка масштабируется `scale(1 - currentY/3000)`).
- **Фон** (`.bg-container`): размытая увеличенная обложка `.bg-img` (`scale 1.6`, `blur(50px)`, saturate 3, contrast 1.2) + градиентный оверлей `.bg-overlay` (от `--c-black-50` к почти чёрному).
- **Drag-zone** сверху (40vh) с шевроном-ручкой `CHEVRON_DOWN` 32px (`--c-white-30`, active → `--c-white-60`).
- **Обложка** (`.artwork`): квадрат, max-width 400px, `--radius-xl`, тень `--c-shadow-popover`.
- **Мета:** `.title` 30px (`--text-3xl`) bold; `.artist` 20px (`--text-xl`) secondary + quality-бейдж.
- **Прогресс** (`.bar-hit-area` 40px): трек `.common-track` 4px `--c-white-20`, `--radius-xs`; заполнение `.common-fill` белое; круглый knob 14px белый с тенью. Под ним `.time-row` — текущее/общее время 13px (`--c-white-90`, tabular-nums); для радио справа «LIVE».
- **Кнопки** (`.buttons-row`, space-between): Like, Previous `.side-btn` (паддинг 10px, svg 24px), белая `.play-btn-large` 64px, Next, PlayModeButton/спейсер.
- **Громкость:** VolumeSlider (полная).
- **Docked-режим** (`is-docked`, для двухпанельного desktop): не fixed, левая граница, фон прозрачный; обложка `--radius-md` без тени, заголовок 18px, кнопки/паддинги ужаты, play-btn 44px.

### VolumeSlider (`VolumeSlider.svelte`)
`.volume-row`: flex, gap 12px, `opacity 0.9`.
- **Кнопка mute** (`.vol-btn`): прозрачная, `--c-text-secondary`, паддинг 8px, круглая; hover → primary + фон `--c-white-10`; svg 24px (иконка меняется по уровню — getVolumeIcon). Compact: 32px, svg 20px.
- **Трек** (`.common-track`): высота 4px (`--space-1`), фон `--c-white-20` (compact → `--c-border`), `--radius-xs`. Заполнение `.common-fill` белое. **Knob** `.common-knob` 14×14px белый круг с тенью, позиция по `left:%`.
- **Hit-area** (`.volume-hit-area`): высота 40px, `touch-action:none`; compact — ширина 150px, высота 48px.
- **Статичная иконка** `VOLUME_FULL` (не compact): `--c-text-secondary`, `opacity --opacity-faint`, 20px.

---

### 3.8 Скелетоны / плейсхолдеры

### Skeleton (`Skeleton.svelte`)
`<div class="skeleton">` с параметрами width/height/radius/style (по умолч. 100% × 20px, `--radius-sm`). Фон `--c-skeleton-base` (= `--c-white-10`), анимация `pulse` 1.5s ease-in-out: `opacity` колеблется `--opacity-muted` ↔ `--opacity-ghost` (≈0.5↔0.3).

**Типовые использования:**
- В `TrackRow` пока нет title/artist: `Skeleton 60%×15px radius 4px` (заголовок) и `40%×13px radius 4px` (артист).
- В сетках карточек (PlaylistsView, RadioView, LibraryView, YandexDashboard): обложка `100%×100% radius var(--radius-md)`, заголовок `~60-80%×15px`, подзаголовок `~40%×13px` с `opacity --opacity-muted`.
- В `BaseList` — несколько Skeleton-строк под формат списка.

### Плейсхолдеры обложек
- **TrackThumb / TrackRow.thumb** — фон `--c-bg-placeholder`; при отсутствии картинки `.icon-ph` с иконкой ALBUMS/RADIO (svg 20px, цвет `--c-icon-faint`).
- **MiniPlayer/FullPlayer fallback** — `.icon-fallback`: иконка по центру, `--c-icon-faint`, `opacity --opacity-faint` (FullPlayer 100px, MiniPlayer 24px).
- **music-card .icon-fallback** — большой глиф (`--text-6xl`) на фоне `--c-bg-placeholder`, цвет `--c-icon-faint`.

### Empty-state (`MusicViews.css .empty-state-container`)
По центру колонки, высота 300px, колоночный flex, цвет `--c-text-secondary`, `opacity --opacity-muted`; иконка `.empty-state-icon` крупная (`--text-7xl`).

---

## Экраны (вид и компоновка)

Все экраны рендерятся внутри одного каркаса `MainScreen.svelte`. Навигация — на хеш-роутере; «экран» переключается через `activeMenuTab`, а внутри экрана — через `navigationStack` (drill-down артист → альбом → треки, плейлист → детали и т.д.). Акцентный цвет всего интерфейса — красный `#fa2d48` (тема default) / оранжевый `#d65d0e` (тема gruvbox), токен `--c-accent`.

### Каркас MainScreen

Файл: `src/components/MainScreen.svelte`. Корневой `.app-container` — flex-колонка на весь экран (`100vw × 100dvh`, фон `--c-bg-app`), объявляет переменную `--mini-player-height: 90px`. Внутри две зоны: верхняя строка `.app-layout` (боковое меню + контент + правый док плеера) и нижняя `.mini-player-wrapper` во всю ширину.

Структура зоны контента (`.content-area`, фон `--c-bg-main`):

- **Header `.top-bar`** — высота `--header-height` (64px), фон `--c-bg-glass` (полупрозрачное «стекло»), нижняя граница `--border-default-dim`, паддинг по бокам 32px (на мобиле 16px). Слева:
  - **Гамбургер** `.hamburger-btn` (иконка `MENU`, размер `--icon-size-lg`) — виден только на ширине ≤768px, открывает мобильный drawer бокового меню.
  - Если в стеке навигации больше одного уровня — кнопка **Back** `.back-btn` (стрелка `BACK` + текст «Back», цвет `--c-accent`, размер `--text-lg`, жирный).
  - Иначе — **заголовок экрана** `.view-title` (`--text-2xl`, bold): Radio / Playlists / Search / Yandex Music / Queue / Favorites / Settings, либо имя категории с заглавной (Library/Artists/Albums).
- **Контент `.scroll-container`** — прокручиваемая область; снизу динамический паддинг: `0` если открыт полноэкранный плеер, иначе `--mini-player-height` (чтобы мини-плеер не перекрывал список). Внутри `.view-wrapper` по `activeMenuTab` рендерится одна из вью.

**Док плеера и мини-плеер.** Компонент `FullPlayer` присутствует в трёх ролях:
- `.docked-player-container` — правая колонка шириной **280px** с левой границей; по умолчанию `display:none`, **включается только в ландшафте при высоте ≤600px** (телефон лёжа): тогда скрываются top-bar и мини-плеер, а плеер живёт справа.
- `.mini-player-wrapper` снизу — компактный `MiniPlayer` (всегда, кроме упомянутого ландшафта).
- `.full-player-modal` — полноэкранный плеер поверх всего (`position:fixed; inset:0; z-index:--z-modal`), показывается когда `isFullPlayerOpen`.

**Фоновый блюр обложки** задаётся не в MainScreen, а внутри `FullPlayer` (описывается в секции плеера) — здесь его нет.

**Системные оверлеи** поверх каркаса:
- **Offline-баннер** `.offline-banner` — узкая «пилюля» под хедером по центру, фон `--c-error`, текст «Connection lost — reconnecting…» с пульсирующей точкой `.offline-dot` (анимация `offline-pulse`); появляется влётом сверху, когда `connectionStatus !== "Connected"`.
- **Toast** `.toast-container` / `.toast-body` — закруглённая (radius 30px) тёмная плашка по центру сверху, с типами success/error/info, тень `--shadow-md-popover`.

**Боковое меню** (`SideMenu`) — отдельная колонка слева (на десктопе постоянно, на мобиле — выезжающий drawer); описано ниже.

---

### SideMenu (боковая навигация)

Файл: `src/components/SideMenu.svelte`. `<aside class="side-menu">` — вертикальная колонка, фон `--c-bg-sidebar`, правая граница. Три состояния ширины:

| Состояние | Ширина | Поведение |
|---|---|---|
| Развёрнуто (десктоп) | **250px** | иконка + текстовая подпись |
| Свёрнуто (`collapsed`) | **80px** | только иконки, подписи и лого скрыты (fade) |
| Мобильный drawer (≤768px portrait) | **280px**, `position:fixed`, выезжает слева | поверх затемнённого backdrop с blur(4px) |
| Ландшафт ≤600px высоты | 200px / 80px | компактные отступы |

**Шапка** `.header` (высота 80px): кнопка-«шеврон» `.collapse-btn` (стрелка `BACK`, поворачивается на 180° в свёрнутом виде) сворачивает/разворачивает меню; по центру — **лого Wave** (`wave-logo.svg`, высота 32px, цвет `--c-accent`, со свечением `drop-shadow`). На мобиле вместо collapse — крестик `.mobile-close`.

**Навигация** `nav` — вертикальный список кнопок `.nav-item` (высота `--control-h-xl`, radius `--radius-lg`, по краям отступ 12px). Иконка слева (`--icon-size-lg`) + подпись (`--text-md`, semibold). Цвет неактивного — `--c-text-muted`; hover — фон `--c-surface-hover`; **активный пункт — сплошная заливка `--c-accent`** (красный). Порядок пунктов: Queue, Favorites (иконка HEART), Artists, Albums, Playlists, Radio, Yandex Music (показывается только если включён Yandex), затем Search. Yandex-пункт скрыт, пока сервис не включён в настройках.

Далее разделитель `.sep`, затем пункт **Update Library** (`.nav-item.sync`, иконка SYNC, при синхронизации крутится — класс `.spin`, текст «Syncing…»), ещё разделитель, и **Settings**. Внизу футер `.footer-text` — «Moode WaveUI» (мелкий, приглушённый). Drawer на мобиле закрывается свайпом влево (>70px).

---

### Library (Artists / Albums)

Файл: `src/components/views/LibraryView.svelte`. Два режима в зависимости от уровня в `navigationStack`.

**1. Корневая сетка (root) и список альбомов артиста (albums_by_artist).** Сверху — **поле поиска-фильтра** `.search-input-container` (фон `--c-surface-input`, иконка SEARCH слева, плейсхолдер «Filter artists…/albums…»). Для альбомов справа в поле — **sort-меню** `.sort-wrapper`: триггер `.sort-trigger` с текущей подписью и иконкой направления; по клику открывается выпадашка `.sort-menu` (через backdrop, анимация scale) с пунктами **A-Z / Artist / Oldest / Newest** (выбранный помечается `.selected`). При входе в альбомы артиста сортировка по умолчанию переключается на «year».

Ниже — **сетка карточек** `.music-grid` (адаптивные колонки `minmax(180px,1fr)`, на мобиле 140px, gap 20/16px). Карточка `.music-card`:
- Квадратная обложка `.card-img-container` (radius `--radius-md`, тень `--shadow-lg`); если арта нет — `.icon-fallback` с иконкой ARTISTS/ALBUMS.
- При наведении карточка приподнимается (`translateY(-5px)`), появляется **`.play-overlay`** — затемнение с крупной белой иконкой PLAY (48px).
- Название `.card-title` (semibold, обрезается многоточием), под ним `.card-sub-row`: артист + бэйджи года `.card-badge` и качества `.card-badge.quality` (рамочный).
- Возможны **групповые заголовки** `.group-header` (буквенные разделители), занимают всю строку грида.

Скелетон загрузки: 12 карточек со `Skeleton`-плейсхолдерами обложки и двух строк текста. Пустой результат — центрированный текст «No results found».

**2. Детали альбома (tracks_by_album)** — через `BaseList`. Сверху крупная **шапка `.view-header`**: слева квадратный арт 200px `.header-art`; справа `.header-info`: метка `.header-label` «Album/Artist» (заглавными, цвет акцента), огромный заголовок `.header-title` (`--text-6xl`, extrabold, до 2 строк), строка с артистом (`--text-2xl`, 60% белого) и **мета-бэйджи** `.meta-tag`: «N tracks», общая длительность, качество (`.quality`). Кнопки `.header-actions`: **Play All** (primary, красная), **To Queue** (secondary). Ниже — список треков (`TrackRow`). На узких экранах (≤800px) шапка перестраивается в колонку по центру.

---

### PlaylistsView и PlaylistGrid

Файлы: `src/components/views/PlaylistsView.svelte`, `PlaylistGrid.svelte`, `PlaylistSearchResults.svelte`. Этот же экран обслуживает вкладки **Playlists** и **Favorites**.

**Список плейлистов.** Сверху поле «Search playlists & tracks…» с крестиком очистки и спиннером во время «глубокого» поиска по трекам внутри плейлистов (debounce 600мс, минимум 2 символа).

Сетка `PlaylistGrid` — `.playlists-grid-override` (колонки `minmax(210px,1fr)`, на мобиле 140px, gap 24/16px). Первая карточка всегда — **«New Playlist»** с пунктирной рамкой `.dashed-cover` и иконкой ADD (создаёт плейлист через модалку-prompt). Далее карточки плейлистов:
- Обложка — **цветной градиент**, детерминированно вычисляемый из имени (`getPlaylistCoverStyle`): в теме default — `linear-gradient(135deg, hsl(hue,60%,40%), hsl(hue+40,60%,30%))`; в gruvbox — градиент из палитровой переменной `--c-pl-0..5`. Поверх — крупная иконка PLAYLISTS (для Favorites — красный фиксированный градиент и иконка HEART_FILLED).
- В правом верхнем углу — **three-dot** `.card-menu-btn` (круглая, появляется при hover; на touch видна всегда) → контекстное меню плейлиста. У карточки Favorites three-dot и контекст отключены.
- При hover — play-overlay с иконкой PLAY. Под обложкой — имя плейлиста и дата изменения (`.card-sub`).
- Долгое нажатие (longpress) на карточке = открыть контекстное меню.

Скелетон: 8 карточек-заглушек.

**Результаты поиска** (`PlaylistSearchResults`): два блока — «Matched Playlists» (горизонтальная лента карточек) и «Matched Tracks» — сгруппированные по плейлистам `.group-container` (карточка с шапкой: иконка, имя плейлиста, счётчик треков `.group-count`, кнопки Play matches / Add to Queue), внутри — строки `TrackRow`. Пустое состояние: «No matches found for "…"» / во время поиска «Searching tracks in playlists…».

**Детали плейлиста** (details) — через `BaseList`, шапка как у альбома, но арт `.header-art` залит тем же градиентом плейлиста и крупной иконкой (HEART_FILLED для Favorites). Бэйджи: «N tracks», длительность, качество. Кнопки: **Play All**, **To Queue**, и **Edit** `.btn-action` (иконка EDIT → ACCEPT/«галочка» в режиме правки, в активном состоянии красная). В режиме edit строки треков становятся перетаскиваемыми (drag-reorder) и удаляемыми. Пусто: «This playlist is empty.»

---

### QueueView

Файл: `src/components/views/QueueView.svelte`. Один список через `BaseList`.

**Шапка очереди** `.view-header`: слева квадратный `.header-art` с фоном `--c-surface-active` и иконкой MENU (`--icon-size` 64px). Справа: метка `.header-label` «Now Playing», заголовок `.header-title` = «Current Queue» (либо имя активного стрим-демона с акцентным пульсирующим текстом `.daemon-active`). Мета-бэйджи: «N tracks», общая длительность, при активном демоне — красный бэйдж «Daemon Active».

Кнопки `.header-actions`:
- При активном демоне — **Stop Stream** (primary). Иначе — **Clear** (secondary, отключена при пустой очереди).
- **Save** (ghost-кнопка-иконка SAVE) — сохранить очередь как плейлист (модалка-prompt с именем).
- **Edit** (ghost/primary, иконка EDIT ↔ ACCEPT) — режим правки.

Список — строки `TrackRow` с подсветкой текущего трека (оптимистичный индекс). В режиме edit — **drag-reorder** (физика перетаскивания в `BaseList`: «плавающий» клон строки `.floating-item` с тенью и лёгким `scale(1.02)`, плавная анимация приземления `landDown`) и удаление треков. Пусто: «Queue is empty».

---

### SearchView

Файл: `src/components/views/SearchView.svelte`. Поиск по локальной библиотеке (IndexedDB).

Сверху — поле `.search-input-container` с автофокусом, плейсхолдер «Artists, songs, or albums», крестик очистки, спиннер во время поиска (debounce 300мс).

Состояния:
- **Пусто/<2 символов** — центрированный плейсхолдер `.placeholder-state`: эмодзи 🔍 и текст «Type to search your library».
- **Нет результатов** — «No results found for "…"».
- **Результаты** — раздел **Albums**: горизонтальная лента карточек (`.music-grid.horizontal`, прокрутка колесом по горизонтали) с обложкой, названием, артистом, бэйджами года/качества; затем раздел **Tracks** — вертикальный список `TrackRow` через `BaseList`.

---

### RadioView

Файл: `src/components/views/RadioView.svelte`. Появляется с fade-анимацией.

Сверху — поле поиска (общий примитив `Input` в режиме `search`), плейсхолдер «Find station…», фильтрует по имени и жанру.

Ниже — **сетка станций** `.music-grid` (стандартная). Карточка станции:
- Квадратная обложка станции (fallback — эмодзи 📻).
- **Активная станция** (играет сейчас): карточка получает класс `.is-active` — у обложки появляется акцентная **рамка-свечение** (`--shadow-focus-ring`), название окрашивается в акцент, а в overlay вместо PLAY показывается бэйдж статуса: **«PLAYING»** (фон `--c-accent` + `--shadow-glow` — красное свечение) или **«PAUSED»** (приглушённый). У неактивных — обычный hover-overlay с PLAY.
- Под обложкой: имя, жанр `.card-sub`, и для активной — бэйдж качества (kbps/формат, появляется fade).

Скелетон: 12 карточек. Пусто (при фильтре): «No stations found».

---

### Yandex Music

Корневой файл: `src/components/views/YandexView.svelte`. Весь раздел работает поверх `.view-container.scrollable`. Режимы определяются по стеку навигации: dashboard, search, playlist, artist_details, album_details. Если токен не задан — `YandexNotConnected`.

**Not Connected** (`yandex/YandexNotConnected.svelte`): по центру (`height:50vh`) заголовок «Yandex Music Not Connected» и текст «Please go to Settings and connect your account.»

**Search bar** (`yandex/YandexSearchBar.svelte`): показывается в режимах dashboard и search — компактный (`size:sm`) `Input` с лупой и кнопкой очистки, плейсхолдер «Search Yandex Music…». Очистка в режиме search делает history.back().

**Dashboard** (`YandexDashboard.svelte`): две горизонтальные ленты карточек:
- **Vibes** — первая карточка «My Vibe» с фиксированным жёлто-красным градиентом `linear-gradient(135deg,#FFCC00,#FF3333)` и пульсирующей иконкой RADIO (`pulse-scale`); далее mood-станции (свой `bgColor` или обложка). Подписи карточек по центру. Клик по станции запускает радио (без перехода).
- **Collection & Mixes** — пользовательские плейлисты и персональные миксы; карточка Favorites имеет красный градиент `linear-gradient(135deg,#fa2d48,#c01c33)` и иконку HEART_FILLED; у остальных — обложка/иконка PLAYLISTS, подпись «N tracks».
- Скелетон: две ленты по 4 карточки-заглушки.

**Детали (playlist / artist / album / search)** — через `BaseList`, в шапке `YandexContentHeader.svelte`:
- Крупный `.view-header`: арт (обложка или красный градиент+HEART для Favorites), метка `.header-label` (PLAYLIST/ARTIST/ALBUM), заголовок, подзаголовок (артист или описание, `.header-sub-text`).
- Кнопки: **Play All** (primary), и контекстно — **To Queue** (для плейлиста) либо **Artist Vibe / Vibe** (для артиста/альбома — secondary с иконкой RADIO).
- Для **артиста**: дополнительная горизонтальная лента **Albums** (карточки с годом) и заголовок «Popular Tracks» над списком.
- Skeleton-вариант шапки (плейсхолдеры арта/текста/кнопок) пока грузится.
- Внизу списка — `footer` с **сентинелом бесконечной прокрутки** и спиннером догрузки (`isLoadingMore`).

**Search results** (`YandexSearchResults.svelte`): над списком треков — горизонтальные ленты **Artists** (круглые-по-смыслу карточки с центрированной подписью) и **Albums** (обложка + артист). Клик ведёт в детали артиста/альбома.

Все строки треков в Yandex используют общий `TrackRow` (с тегированием источника), пустое состояние списка — «No tracks found».

---

### SettingsView

Файл: `src/components/views/SettingsView.svelte`. Тонкий «shell»: прокручиваемый `.view-container.scrollable` с fade-входом, крупный заголовок **«Settings»** (`--text-5xl`) и пять секций-компонентов. Все секции единообразны: заголовок `.section-header` (`--text-xl`, bold) + карточка `.card` (фон `--c-bg-card`, граница, radius `--radius-lg`, паддинг 16px, вертикальные ряды `.row` с разделителями `.separator`). Порядок в коде: Services → Alarm → Appearance → Connection → About.

**Services** (`settings/ServicesSettings.svelte`): ряд «Enable Yandex Music (Beta)» с **тумблером** `Toggle`. При включении раскрываются (fade): строка **Connection Status** с бэйджем **Connected** (зелёный `#2ecc71` на полупрозрачном фоне) / **Not Connected** (красный `#e74c3c`); строка **OAuth Token** — `Input type=password` + кнопка **Save** (текст «Checking…» при проверке); подпись-hint «Token is stored securely on the device.»; при подключении — блок **Diagnostics** (кнопка Show/Hide, раскрывает `<pre>` с JSON-дампом, моноширинный, кнопки Refresh/Copy).

**Alarm Clock** (`settings/AlarmSettings.svelte`): ряд «Current Player Time» с моно-бэйджем `.mono-badge` (акцентный фон, обновляется раз в минуту с сервера); ряд «Enable Alarm» с тумблером. При включении (fade): **Wake up time** — нативный `input[type=time]` (фон `--c-surface-input`); **Playlist** — кастомный `select` в `.select-wrapper` со стрелкой CHEVRON_DOWN (список плейлистов). Изменения сохраняются сразу.

**Appearance** (`settings/AppearanceSettings.svelte`): одна кликабельная карточка `.card.clickable` — ряд «Interface Theme» с текущим значением (Default/Gruvbox) и шевроном NEXT справа; по клику — модалка-`select` выбора темы, после смены — toast.

**Connection** (`settings/ConnectionSettings.svelte`): ряд «Moode Device IP» — `Input` (плейсхолдер «192.168.x.x», `size:sm`) + кнопка **Save**; hint «Current: <ip>». Сохранение валидирует адрес и перезагружает страницу через 1с.

**About** (`settings/AboutSettings.svelte`): карточка с двумя `.info-row` — **Version** и **Build Date**, значения в моноширинных «чипах» `.mono`.

---

### Общие визуальные паттерны (shared)

Описаны в `src/components/views/MusicViews.css` и переиспользуются почти во всех экранах:

- **Карточки `.music-card`**: квадратная обложка, тень `--shadow-lg`, hover поднимает карточку на 5px и затемняет с иконкой PLAY 48px. Горизонтальные ленты — `.music-grid.horizontal` (карточки 180px/140px, scroll-snap, скрытый скроллбар, прокрутка колесом мыши по X).
- **Крупная шапка `.view-header`**: арт 200px + текстовый блок (метка-акцент → заголовок `--text-6xl` extrabold → подзаголовок → мета-бэйджи → кнопки). На ≤800px складывается в центрированную колонку, заголовок уменьшается.
- **Кнопки**: `.btn-primary` (акцентная заливка, UPPERCASE, pill-форма), `.btn-secondary` (нейтральная), `.btn-action` (квадратная иконочная с рамкой, активная — акцентная). Все с `scale(0.97)` при нажатии.
- **Поле поиска `.search-input-container`**: высота `--control-h-xl`, фон `--c-surface-input`, при фокусе подсвечивается рамка.
- **Скелетоны** (`Skeleton.svelte`) — на этапах загрузки в Library, Playlists, Radio, Queue (строки), Yandex Dashboard и шапке Yandex.
- **Пустые состояния** — центрированный приглушённый текст в каждом списке/сетке.

---

## Иконки, обложки, движение, навигация, ограничения

### Иконография (line-icons, Tabler)

Иконки — это набор Tabler Icons, импортируемых как сырой SVG (`?raw`) и собранных в один реестр `ICONS: Record<string, string>` в `src/lib/icons.ts`. Glyph встраивается в разметку как `<svg>` и красится через `currentColor` (наследует цвет текста родителя).

Стиль: тонкие контурные иконки («line-icons»). В исходных SVG прописан `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`, `fill="none"`, viewBox `0 0 24 24`. Но фактически на экране толщина переопределяется — глобальный токен `--icon-stroke-width: 1.5px` (`tokens.css:269`) применяется к слоту `<svg>` в `IconButton` и в карточках (`MusicViews.css:221,517,610`), поэтому пользователь видит обводку **1.5px**. Исключение: ручка-стрелка вытягивания FullPlayer форсирует `stroke-width: 3` (`FullPlayer.svelte:262`).

Залитые (filled) варианты — только для play и сердечка: `player-play-filled.svg` и `heart-filled.svg` идут с `fill="currentColor"` (сплошные), тогда как контурные heart-empty / player-play-empty — обводкой.

Размеры иконок управляются токенами (см. секцию о токенах): `--icon-size-sm: 18px`, `--icon-size-md: 20px`, `--icon-size-lg: 24px`, `--icon-size-xs` (мелкие в строках трека). `IconButton` имеет модификаторы `--sm/--md/--lg`, где lg (24px) — основной размер транспортных/навигационных кнопок.

Ключевые иконки и их семантика (имя в `ICONS` → исходный SVG → где видны):

| Ключ | SVG | Где используется |
|---|---|---|
| `ARTISTS` | music | таб «Artists», ссылка на артиста |
| `ALBUMS` | disc | таб «Albums», ссылка на альбом |
| `PLAYLISTS` | playlist | таб «Playlists» |
| `RADIO` | radio | таб «Radio» |
| `SEARCH` | search | поиск |
| `PLAY` / `PAUSE` | player-play-filled / player-pause | плеер (mini + full) |
| `PREVIOUS` / `NEXT` | player-skip-back / player-skip-forward | транспорт FullPlayer |
| `SHUFFLE` / `REPEAT` | arrows-shuffle-2 / repeat | режимы воспроизведения |
| `VOLUME_FULL/MEDIUM/MUTE/OFF` | volume-* | регулятор громкости (ступенчатая иконка) |
| `HEART` / `HEART_FILLED` | heart-empty / heart-filled | LikeButton (лайк/«Favorites») |
| `SYNC` | refresh | синхронизация библиотеки |
| `SETTINGS` | settings | таб «Settings» |
| `CLOSE` / `BACK` / `CHEVRON_DOWN` | x / chevron-left / chevron-compact-down | навигация, закрытие, свайп вниз |
| `DRAG_HANDLE` | grip-horizontal | ручка перетаскивания строк |
| `REMOVE` / `SAVE` / `EDIT` / `ADD` / `ACCEPT` | trash / device-floppy / file-pencil / plus / circle-check | редактирование плейлистов |
| `DOTS` | dots | вызов контекст-меню (три точки) |
| `MENU` | menu-2 | таб «Queue» / меню |
| `SORT_DESC` / `SORT_ASC` | sort-descending / sort-ascending | сортировка списков |
| `YANDEX` | yandex (brand-yandex) | таб «Yandex Music», брендовый glyph |

В каталоге `src/lib/svg/` есть неиспользуемые в реестре файлы: `brand-deezer.svg`, `chevron-compact-left.svg`, `player-play-empty.svg` (зарезервированы/legacy).

### Обложки и плейсхолдеры

Логика подбора обложки централизована в `src/lib/artwork.ts` (чистая, без сокетов). Две функции:
- `getTrackCoverUrl` — крупная обложка (плеер, заголовки).
- `getTrackThumbUrl(track, size: "sm"|"md")` — миниатюра для списков; использует кэш `THUMB_CACHE(hash, size)`, где hash берётся из `track.thumbHash` либо вычисляется `md5(dirPath)` по каталогу файла.

Приоритет источников (`resolveSharedArtwork`): удалённый `image` → удалённый `cover` → для радио/стримов картинка станции → иначе локальный cover-art moOde (`API_ENDPOINTS.COVER_ART(file)`).

Плейсхолдеры (PNG в `public/images/`, имена жёстко зашиты в коде):
- `default_cover.png` — крупная обложка, когда трека/файла нет.
- `default_icon.png` — миниатюра по умолчанию.
- `radio_placeholder.png` — крупный плейсхолдер радио.
- `radio_icon.png` — миниатюра радио.

Фон-блюр в полноэкранном плеере (`FullPlayer.svelte:228-241`): та же обложка дублируется как фон (`.bg-img`) с эффектом `transform: scale(1.6)` и `filter: blur(50px) brightness(1.1) saturate(3) contrast(1.2)`, поверх — затемняющий градиент `.bg-overlay` (от `--c-black-50` к `rgba(0,0,0,0.95)`). В состыкованном (docked) состоянии блюр слабее: `blur(35px) brightness(1.2) saturate(3.5)`, оверлей `--c-black-70`. Есть запасной градиент `.bg-gradient-fallback` (`#121212 → #000`). Появление картинки — плавное `transition: opacity 0.5s ease-in`.

Ленивая загрузка изображений: `ImageLoader.svelte` показывает skeleton, который исчезает `out:fade={{ duration: 200 }}`, само изображение проявляется `opacity: var(--opacity-hidden) → visible` за `--dur-base` (0.3s). `TrackThumb.svelte` для пустого случая показывает иконку `in:fade`.

Кэш обложек на уровне Service Worker (`sw.js`): cover-art и картинки кэшируются SW (см. CLAUDE.md / архитектуру), что и обеспечивает мгновенную повторную отрисовку миниатюр.

### Цветные градиенты карточек плейлистов

Единственный источник правды — `src/lib/playlistColor.ts` (CSS-строки фона, вынесенные из слоя плейбэка). Цвет назначается **детерминированно по имени** плейлиста через хэш (`hashName` — классический string-hash) → `Math.abs(hash % 360)`.

Тема `default` (`getGradient`): двух-стоповый линейный градиент 135° —
`linear-gradient(135deg, hsl(H,60%,40%), hsl((H+40)%360,60%,30%))`, где H — хэш имени. То есть каждый плейлист получает свой устойчивый «диагональный» цвет.

Тема `gruvbox` (`assignColorVar`): цикл по 6 палитровым токенам `--c-pl-0 … --c-pl-5`, индекс `Math.abs(hash % 6)`. Карточка рисуется как `linear-gradient(135deg, var(--c-pl-N), transparent)` с тем же цветом в `background-color`.

Палитра `--c-pl-*` (из `theme.ts`):

| Токен | default | gruvbox |
|---|---|---|
| `--c-pl-0` | `#fa2d48` (красный) | `#cc241d` |
| `--c-pl-1` | `#2d7afa` (синий) | `#458588` |
| `--c-pl-2` | `#2dfa85` (зелёный) | `#a6e3a1` |
| `--c-pl-3` | `#faac2d` (оранж.) | `#d65d0e` |
| `--c-pl-4` | `#b82dfa` (фиолет.) | `#b16286` |
| `--c-pl-5` | `#2dfaf3` (циан) | `#fabd2f` |

Спец-вид «Favorites» (`FAVORITES_PLAYLIST`) выделен отдельно — не хэшируется:
- default: фикс. красный свотч `FAV_HUE = 348` → `linear-gradient(135deg, hsl(348,95%,58%), hsl(348,90%,40%))`.
- gruvbox: `linear-gradient(135deg, var(--c-heart), transparent)` + `--c-heart` фоном.
- `--c-heart`: `#ff4444` (default) / `#fb4934` (gruvbox).

Сборка `style`-строки карточки — `getPlaylistCoverStyle(...)`: header-карточка предпочитает градиент (`color`), карточки-сетки предпочитают сплошной токен (`colorVar`), оба падают на `--c-bg-card` (`#1a1a1a`). Карточка «создать плейлист» — `.dashed-cover`: пунктирная рамка (`--border-dashed`) с подсветкой рамки/фона на hover.

### Паттерны взаимодействия и движение

**Hover-reveal.** На карточках альбомов/артистов (`.music-card`) при наведении проступает `.play-overlay` (`opacity 0 → 1` за `--dur-fast` 0.2s) с белой 48px иконкой play и drop-shadow; та же кнопка видна, если карточка `.is-active`. Сама карточка приподнимается `transform: translateY(-5px)` и меняет фон. У сик-бара мини-плеера «костяшка» (`.knob`) скрыта `scale(0)` и раскрывается `scale(1)` на hover полосы.

**Scale-feedback на нажатие.** Микро-обратная связь при тапе: большая кнопка play в FullPlayer `:active { transform: scale(0.95) }`, play в MiniPlayer — `hover scale(1.05)` / `active scale(0.95)`; общие кнопки в `MusicViews.css` `:active { transform: scale(0.97) }`; иконные кнопки (LikeButton, PlayModeButton, side-btn) гасят `opacity` на `:active`. Длительность таких микро-анимаций — токен `--dur-instant: 0.1s`.

**Longpress → контекст-меню.** Svelte-экшен `longpress` (`src/lib/actions.ts`) диспатчит событие `longpress` по таймеру (по умолчанию 2000ms; MiniPlayer передаёт 500ms). Важная деталь UX: лонг-пресс НЕ срабатывает, если жест начался на интерактивном потомке (`[role="slider"], button, a, input, textarea, select`) — чтобы слайдеры громкости/перемотки в доке не открывали меню. Применяется в `TrackRow.svelte` и `MiniPlayer.svelte`. Само меню (`ContextMenu.svelte`) появляется `transition:fade {100ms}` + `transition:scale {start:0.95, 100ms}`.

**Drag-to-reorder с phantom/landing-анимацией.** Движок `src/lib/playlistDrag.ts` (`createPlaylistDrag<T>`, generic по типу строки). Механика:
- Старт после порога `DRAG_THRESHOLD = 3px` смещения (отделяет тап от перетаскивания).
- Перетаскиваемая строка скрывается (`opacity: 0; pointer-events: none`), остальные строки расступаются через `transform: translateY(±100%)` (см. `getRowStyle`).
- «Призрак» (ghost) следует за пальцем по координатам `ghostCoords`.
- Авто-скролл при подходе к краям: зона `SCROLL_ZONE_PX = 100px`, скорость от `SCROLL_SPEED_BASE = 5` до `SCROLL_SPEED_MAX = 25` (квадратичное ускорение).
- При отпускании — «landing»: призрак анимированно «прилетает» в целевой слот, пауза 250ms, затем реальный реордер массива (splice + `tracksStore.set`) и вызов `onMoveTrack(from,to)` для MPD. Севший элемент получает подсветку `justDroppedIndex` (сбрасывается через ~300ms).
- В строке трека во время drag/активности рисуется анимированная диагональная штриховка `@keyframes moveStripes` (бесконечная, 2s linear, шаг 28.28px).

**Seek/volume drag.** Перемотка через `src/lib/seekDrag.svelte.ts` (`createSeekController`, на рунах `$state/$derived`). Логика «тяни полосу → оптимистичный предпросмотр позиции → коммит в MPD на отпускании». Во время drag показывается `dragProgress` (0..1) и `displaySeconds`; для радио жест — no-op (нет seekable-позиции). MiniPlayer слушает мышь на `window` (`windowMouse: true`), чтобы следить за курсором вне тонкого дока; FullPlayer — на элементе. Touch одинаков для обоих.

**Горизонтальный скролл.** `src/lib/horizontalScroll.ts` (`horizontalWheelScroll`) переводит вертикальное колесо мыши в горизонтальную прокрутку ряда (`scrollLeft += deltaY`). Используется в горизонтальных каруселях: `YandexDashboard`, `PlaylistSearchResults`, `YandexSearchResults`, `YandexContentHeader`.

**Бегущая строка (marquee).** Отсутствует. Длинные тайтлы/подписи обрезаются `text-overflow: ellipsis` (`white-space: nowrap; overflow: hidden`) — в карточках и в docked-заголовке плеера. При редизайне это место (длинные названия) — кандидат на marquee, но сейчас его НЕТ.

**Transitions (fade/fly/scale).** Используются нативные Svelte-переходы:
- `fly` — FullPlayer выезжает снизу `transition:fly={{ y: isDocked ? 0 : 800, duration: 300 }}`; офлайн-баннер и тосты `fly { y:-40/-50, 300ms }` (`MainScreen.svelte`).
- `fade` — SideMenu (200ms), skeleton в ImageLoader, иконка-плейсхолдер в TrackThumb, backdrop ContextMenu/Modal.
- `scale` — поповеры ContextMenu и Modal (`start: 0.95`).
- Прочие keyframes: `pulse` (Skeleton), `spin` (SearchView загрузка), `eq` (эквалайзер-индикатор играющего трека), `rotate` (SideMenu sync), `offline-pulse` (баннер), `shake` (валидация Modal), `pulse-text` (Queue).

Длительности — токены: `--dur-instant 0.1s`, `--dur-fast 0.2s`, `--dur-base 0.3s`, `--dur-slow 0.4s`, `--dur-slow-2 0.25s`.

### Модель навигации

**Хэш-роутинг** без библиотеки — `src/lib/router.ts`. Формат `/#/view/param1/param2`, парсинг с `safeDecode` (устойчив к битым percent-escape). Роутер связывает хэш с двумя сущностями стора: активный таб (`activeMenuTab`) и стек экранов (`navigationStack`, `src/lib/stores/navigation.ts`).

**Табы** (источник — `ALL_MENU_ITEMS` в `SideMenu.svelte`, порядок именно такой):
`queue` (icon MENU) · `favorites` (HEART) · `artists` (ARTISTS) · `albums` (ALBUMS) · `playlists` (PLAYLISTS) · `radio` (RADIO) · `yandex` (YANDEX). Плюс служебные `search` и `settings`. Список фильтруется (`visibleMenuItems`) — например, Yandex показывается, только если источник включён.

**Контентные роуты.** Корневые табы (`artists`, `albums`, `playlists`, `radio`, `queue`, `settings`, `search`) сбрасывают стек (`setRootTab → resetNavigation`). Детальные экраны пушатся в стек:
- `artist/<name>` → view `albums_by_artist`
- `album/<artist>/<name>` (или `album/<name>`) → `tracks_by_album`
- `playlist/<name>` → `details`; `favorites` → `details` (таб переключается на `favorites`)
- стриминговые роуты (Yandex и т.п.) описываются самим источником через `SourceRoute` (`parseParams`/`buildPath`/`menuTab`/`allowEmptyData`) — роутер агностичен к конкретному сервису.

**Стек экранов.** `navigationStack` инициализируется `[{ view: "root" }]`. `pushNavigationEntry(view, data)` добавляет экран; `navigateBack` / `handleBrowserBack` делают `slice(0,-1)` (поп верхнего); `resetNavigation` возвращает к корню. Стек экспонируется только для чтения (нет `.set` снаружи). Дедупликация: повторный переход на тот же view с теми же данными (по `name`/`id`/`uid`) — no-op. Поиск и стриминг-поиск используют `replaceState` (не плодят историю).

**Back/forward.** Опирается на нативную историю браузера через `hashchange` (`Router.init` вешает слушатель). Пустой хэш при непустом стеке/поиске редиректит на `/artists`.

**Мини ↔ полный плеер.** Состояние `isFullPlayerOpen` (writable, `src/lib/stores/ui.ts`). В `MainScreen.svelte`: всегда смонтирован `MiniPlayer` (тонкий док); при `$isFullPlayerOpen` показывается полноэкранный `FullPlayer`, который выезжает снизу `fly y:800`. Свайп/тап по drag-zone вниз сворачивает; в процессе свайва обложка плавно уменьшается (`transform: scale({1 - currentY/3000})`). Docked-режим FullPlayer (`isDocked`) — компактная раскладка с обрезкой заголовка по ellipsis.

### Что СОХРАНИТЬ при редизайне

- **Функциональность взаимодействий**: longpress→контекст-меню (с защитой от срабатывания на интерактивных потомках), drag-to-reorder с порогом 3px / авто-скроллом / landing-анимацией, seek/volume drag с оптимистичным предпросмотром и коммитом на отпускании, hover-reveal play-overlay, scale-feedback на нажатие, горизонтальный скролл колесом. Радио как not-seekable.
- **Токен-архитектура**: менять ЗНАЧЕНИЯ, не СТРУКТУРУ. Иконки через `--icon-stroke-width` и `--icon-size-*`; цвета плейлистов через `--c-pl-0..5` и `--c-heart`; тайминги через `--dur-*`. Не возвращать `svg { width !important }` хаки (от них уже ушли в IconButton).
- **Детерминированность цвета плейлиста по имени** (хэш) и спец-обработка «Favorites» как единого источника правды (`playlistColor.ts`) — не дублировать по вьюхам.
- **Доступность**: `focus-visible` уже есть в UI-примитивах (Button, IconButton, Card, Toggle, Input) — сохранить и расширить; `role`/`aria` на интерактивных строках/карточках; `currentColor`-иконки.
- **Две темы** (`default` + `gruvbox`) — обе ветки в `theme.ts` и `playlistColor.ts` должны оставаться синхронными.
- **Mobile-first и брейкпоинт 768px** (`--bp-md: 768px`) — единая точка перелома раскладки.
- **Централизация артворка** (`artwork.ts`) и кэш Service Worker для обложек.

### Известные грубые места (что причёсывать)

- **Off-scale / магические значения**: штриховка строки `28.28px` (и `background-size`), фильтры блюра «на глаз» (`blur(50px) brightness(1.1) saturate(3) contrast(1.2)` и docked-вариант), `transform: scale(1.6)` фона, `scale({1 - currentY/3000})` свайпа, `--dur-slow-2: 0.25s` помечен как кандидат на слияние с `--dur-fast/base`. Часть карточных значений всё ещё хардкод (`card-badge` `rgba(255,255,255,0.1)`, `border-radius: 3px`).
- **Жёстко зашитые пути плейсхолдеров** (`/images/default_cover.png` и т.п.) в `artwork.ts` — строковые литералы вместо констант.
- **Баг тени FullPlayer**: тень обложки задаётся `box-shadow: var(--c-shadow-popover)` на `.artwork` — токен «popover» применяется не по назначению (визуально это тень арта плеера, не поповера), это рассогласование семантики токена. Проверить корректность тени в обоих состояниях (full/docked).
- **God-компоненты**: `FullPlayer.svelte`, `MainScreen.svelte`, `SideMenu.svelte` несут логику + крупные стили + переходы в одном файле; `playlistDrag.ts` — большой императивный движок с DOM-измерениями и таймаутами (250ms/300ms, двойной `requestAnimationFrame`) — кандидат на упрощение/декомпозицию.
- **Форс `stroke-width: 3`** для ручки FullPlayer и точечные `stroke-width: 1.5` в `MusicViews.css` — частично дублируют токен `--icon-stroke-width`, стоит свести к токену.
- **Нет marquee** для длинных названий (сейчас ellipsis) — если дизайн предполагает бегущую строку, её надо вводить заново.
