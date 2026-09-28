# DESIGN.md — Дизайн-система Wave UI

> Техническое задание дизайн-системы для **Wave UI** — лёгкого Svelte 5 SPA-плеера для moOde Audio.
> Документ предназначен для дальнейшей доработки дизайна в **Claude Design**.
>
> **Статус:** канонический набор токенов и примитивов под **визуальный паритет** с текущим UI.
> Каждое реально используемое в коде «сырое» значение покрыто токеном. «Нечётные» (off-scale)
> значения токенизированы **как есть** и помечены кандидатами на рационализацию — менять их
> сейчас нельзя (это уже визуальное изменение, относится к этапу Claude Design, см. §8).

---

## 0. TL;DR для нетерпеливых

- Все дизайнерские величины живут в токенах. **Магических чисел в `.svelte`/CSS быть не должно.**
- **Цвета** (различаются между темами) → `src/lib/theme.ts` (инжектятся в `:root` через JS).
- **Всё остальное** (отступы, типографика, радиусы, тени, z-index, анимации, размеры контролов, иконок, opacity) — инвариантно для обеих тем → новый статический файл `src/styles/tokens.css` (`:root`).
- Композитные токены (`--border-*`, `--shadow-*`) живут в `tokens.css`, но **ссылаются** на цвет-токены из темы → резолвятся под активную тему в рантайме.
- Порядок подключения CSS: **`tokens.css` → `shared.css` → `MusicViews.css`**, затем `theme.ts` инжектит цвета поверх.
- Брейкпоинты и длительности JS-переходов **нельзя** хранить в CSS-переменных там, где они нужны в `@media`/Svelte-transition — зеркалить в `src/lib/constants.ts` (`BREAKPOINTS`, `MOTION`).

---

## 1. Принципы и контекст

### 1.1. Что это
Wave UI — однокартиночный плеер. Интерфейс ориентирован на **тёмную тему**, плотные списки треков, карточки альбомов/плейлистов и компактные транспортные контролы. Управление воспроизведением идёт напрямую в MPD по WebSocket; метаданные библиотеки — из PHP-бэкенда moOde через REST + Web Worker + IndexedDB.

### 1.2. Темы
Существует **две темы**, обе тёмные:
- **`default`** («Moode Dark») — нейтральный тёмный, бренд-акцент `#fa2d48` (красно-розовый).
- **`gruvbox`** («Gruvbox Dark») — тёплый тёмный, акцент `#d65d0e` (оранжевый).

Темы различаются **только цветом** (и одной геометрической ошибкой — `--radius-xl`, см. §8). Все остальные величины (геометрия, типографика, анимации) обязаны быть **одинаковыми** между темами — это и есть «инвариантность оси».

### 1.3. Принципы
1. **Паритет прежде всего.** Миграция на токены не должна менять вычисленные значения. Off-scale значения сохраняются точно.
2. **Один источник правды.** Каждая величина определена ровно в одном месте. Сейчас инвариантные токены задублированы (`theme.ts.colors` + `shared.css :root`) — это устраняется выносом в `tokens.css`.
3. **Семантика поверх примитивов.** Компоненты используют семантические токены (`--c-text-primary`, `--space-4`), а не атомарные литералы.
4. **Темизируемость по дизайну.** Добавление 3-й темы = новый объект `colors` в `theme.ts`; инвариантные токены не дублируются.
5. **Доступность хит-таргетов.** Иконочные кнопки имеют padding до ~40–48px цели вокруг 16–24px глифа.

---

## 2. Токены: полные таблицы

### 2.1. Где что живёт

| Слой | Файл | Что | Темо-зависимость |
|---|---|---|---|
| Цвета | `src/lib/theme.ts` → инжект в `:root` через `src/lib/stores/ui.ts` | `--c-*`, палитра плейлистов `--c-pl-*` | **Per-theme** (различаются) |
| Геометрия / типографика / анимация | `src/styles/tokens.css` (`:root`, статический) | `--space-*`, `--text-*`, `--radius-*`, `--z-*`, `--dur-*`, `--ease-*`, `--control-*`, `--icon-*`, `--opacity-*`, `--font-*`, `--border-width-*`, layout | **Invariant** (одинаковы) |
| Композиты | `src/styles/tokens.css` | `--border-default*`, `--shadow-*` (геометрия инвариантна, цвет — ссылка на тему) | геометрия invariant, цвет per-theme |
| Брейкпоинты / JS-motion | `src/lib/constants.ts` | `BREAKPOINTS`, `MOTION` | Invariant, **не** CSS-var (см. §6.4) |

**Подключение** (в `App.svelte`/`main.ts`): `tokens.css` → `shared.css` → `MusicViews.css`. После выноса инвариантных токенов:
- `ui.ts` инжектит **только цвета** (radius/z/trans уходят из цикла `setProperty`).
- Удалить мёртвый импорт `src/app.css` (пуст) в `main.ts`.
- `src/assets/main.css` удалён (был legacy `:root`, дубль body-резета и font-стека). ✓

---

### 2.2. Отступы — `--space-*` (invariant)

Базовая единица — **4px**. Двухуровневая шкала: основная (кратна 4) + off-scale алиасы под паритет.

#### Основная шкала (on-scale, /4)

| Токен | Значение | Назначение |
|---|---|---|
| `--space-0` | `0` | Сброс отступов/инсетов (~53 вхождений). Для `!important` — `var(--space-0) !important`. |
| `--space-0_5` | `2px` | 0.5×. Микро-отступы бейджей/индикаторов. |
| `--space-1` | `4px` | 1×. Очень частый базовый отступ. |
| `--space-2` | `8px` | 2×. `gap:8px` ×14. |
| `--space-3` | `12px` | 3×. `gap:12px` ×11, `margin-bottom:12px` ×8. |
| `--space-4` | `16px` | 4×. Канонический внутренний отступ контейнера. `padding:0 16px` ×10. |
| `--space-5` | `20px` | 5×. `gap:20px` ×6. |
| `--space-6` | `24px` | 6×. `margin-bottom:24px` ×5. |
| `--space-8` | `32px` | 8×. Отступы секций настроек ×5. |
| `--space-10` | `40px` | 10×. Padding empty-state ×3. Отрицательный inset через `calc(-1 * var(--space-10))`. |

#### Off-scale алиасы (паритет; кандидаты на рационализацию — §8)

| Токен | Значение | Назначение | Кандидат |
|---|---|---|---|
| `--space-px` | `1px` | Хэйрлайн / субпиксельный сдвиг (VolumeSlider). | — |
| `--space-2xs` | `6px` | `gap:6px` ×5, `padding:6px` ×3. | → 4 или 8 |
| `--space-2_5` | `10px` | **Самый частый gap** (`gap:10px` ×15). Отрицательный — `calc(-1 * var(--space-2_5))`. | → 8 или 12 |
| `--space-3px` | `3px` | Один бейдж. | → 2/4 |
| `--space-5px` | `5px` | Редкий. | → 4/6 |
| `--space-7px` | `7px` | Центровка thumb в VolumeSlider — паритет-критично. | → 8 |
| `--space-14px` | `14px` | Строки контекст/sort-меню. | → 12/16 |
| `--space-15px` | `15px` | MainScreen. | → 16 |
| `--space-28px` | `28px` | 7×4, но редко (SideMenu / MiniPlayer fold). Отрицательный — `calc`. | (формально на шкале) |
| `--space-30px` | `30px` | FullPlayer gap, стрелка select в Alarm. | → 32 |
| `--space-50px` | `50px` | MainScreen `padding-bottom` (зазор под мини-плеер), YandexNotConnected. | → 48 или привязать к `--mini-player-height` |

> **Правила.** Отрицательные отступы — `calc(-1 * var(--space-N))`, отдельных токенов нет. Ключевое слово `auto` остаётся литералом (это не величина). Составные значения собираются из токенов: `padding: var(--space-2) var(--space-3)`.

---

### 2.3. Типографика (invariant)

#### Размер шрифта — `--text-*` (T-shirt)

| Токен | Значение | Назначение |
|---|---|---|
| `--text-2xs` | `10px` | Микро-капшен: nav-метки, бейджи, мета плиток. |
| `--text-xs` | `11px` | Капшен: артист MiniPlayer, подсказки, `.meta-tag`. |
| `--text-sm` | `12px` | Маленький капшен/мета. |
| `--text-base-sm` | `13px` | Плотный body: TrackRow, пункты меню. Off-scale кандидат. `!important` → `var(--text-base-sm) !important`. |
| `--text-base` | `14px` | **Основной body (23 вхождения — самый частый).** |
| `--text-md` | `15px` | Сильный body/лейбл: заголовки треков, карточек. Off-scale (между 14/16). |
| `--text-lg` | `16px` | Лейбл/сабтайтл; безопасный для iOS-zoom размер input. |
| `--text-xl` | `18px` | Заголовок секций/настроек. `!important` → `var(--text-xl) !important`. |
| `--text-2xl` | `20px` | Заголовок страницы. |
| `--text-3xl` | `24px` | Display-sm: заголовок FullPlayer. |
| `--text-4xl` | `28px` | Display. Off-scale (одиночный, между 24/32). |
| `--text-5xl` | `32px` | Display: заголовок SettingsView. |
| `--text-6xl` | `40px` | Display-xl: hero-числа. |
| `--text-7xl` | `48px` | Display-2xl: hero. |
| `--text-8xl` | `60px` | Display-3xl: иконка empty-state. Off-scale кандидат. |

#### Высота строки — `--leading-*`

| Токен | Значение | Назначение |
|---|---|---|
| `--leading-none` | `1` | Иконки / одиночные числа. |
| `--leading-tight` | `1.1` | Очень плотный display. Off-scale (≈snug). |
| `--leading-snug` | `1.2` | Плотный многострочник: TrackRow. |
| `--leading-normal` | `1.5` | Читаемый body: Modal. |

#### Трекинг — `--tracking-*`

| Токен | Значение | Назначение |
|---|---|---|
| `--tracking-tight` | `0.2px` | Лёгкий: `.meta-tag`. Off-scale (≈wide). |
| `--tracking-wide` | `0.5px` | Капс-пиллы/бейджи. |

#### Жирность — `--weight-*`

| Токен | Значение | Назначение |
|---|---|---|
| `--weight-regular` | `400` | Дефолт body. |
| `--weight-medium` | `500` | Заголовки треков, `sort-item.selected`. |
| `--weight-semibold` | `600` | **Самый частый акцент (×18).** |
| `--weight-bold` | `700` | ×11 как `700` + ×4 как `bold` (нормализовано в 700 — визуально идентично). |
| `--weight-extrabold` | `800` | Display-заголовки, бейдж RadioView. |

#### Семейство — `--font-*`

| Токен | Значение | Назначение |
|---|---|---|
| `--font-sans` | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | Body. Объединяет два стека (`shared.css` без Helvetica/Arial vs `main.css` с ними) — системный шрифт резолвится первым, хвост-фоллбэк визуально инертен. `font-family: inherit` (кнопки/инпуты) остаётся литералом (поведение, не значение). |
| `--font-mono` | `monospace` | Технические/числовые поля (версия, время, коды). |

---

### 2.4. Радиусы — `--radius-*` (invariant)

| Токен | Значение | Назначение |
|---|---|---|
| `--radius-xs` | `2px` | Рейлы/скроллбар/прогресс (2px ×7). **Новый**, ниже `--radius-sm`. `1px`/`3px` — off-scale, мапятся сюда (для строгого байт-паритета держать литералом). |
| `--radius-sm` | `4px` | Существует. Мигрировать сырые `4px` (×6). Дефолт Skeleton. |
| `--radius-md` | `8px` | Существует. Мигрировать сырые `8px` (×12). |
| `--radius-lg` | `12px` | Существует. Мигрировать сырые `12px` (×12). |
| `--radius-xl` | `20px` | Существует, но **рассинхронизирован по темам** (default 20 / gruvbox 16) — БАГ инвариантной оси. **Унифицировать на 20px** (gruvbox 16→20: согласованное мелкое визуальное изменение, см. §8). |
| `--radius-full` | `9999px` | Существует. Капсула/пилл. |
| `--radius-circle` | `50%` | **Самый частый радиус (×18):** круглые аватары/кнопки/ручки/thumb. **Не равен** `--radius-full` для не-квадратных элементов → отдельный токен. |
| `--radius-pill` | `var(--radius-full)` | Семантический алиас для полностью скруглённых пилл-контролов. Развязывает скругление пиллов от `--radius-xl` (иначе пиллы темо-зависимы на gruvbox). Паритет-безопасно (full == капсула для коротких контролов). Для строгого байт-паритета литерала `20px` → `--radius-pill: 20px`. Сюда же рационализируются `30px` (toast) и `10px` (count pill). |
| `--radius-6px` | `6px` | Off-scale, один (`.mono-badge` в AlarmSettings). Кандидат → sm/md. |

---

### 2.5. Ширина границ — `--border-width-*` (invariant)

| Токен | Значение | Назначение |
|---|---|---|
| `--border-width-thin` | `1px` | Доминирующая ширина границ (×39). |
| `--border-width-thick` | `2px` | Акцент / дропзоны (×5). |

### 2.6. Границы-композиты — `--border-*` (геометрия invariant, цвет per-theme)

| Токен | Значение | Назначение |
|---|---|---|
| `--border-default` | `var(--border-width-thin) solid var(--c-border)` | Самый частый паттерн (×25 + ×6 как `border-bottom`). |
| `--border-default-dim` | `var(--border-width-thin) solid var(--c-border-dim)` | Разделитель (×4). NB: разделители непоследовательно используют `--c-border` vs `--c-border-dim` — унификация цвета — отдельное решение. |
| `--border-dashed` | `var(--border-width-thick) dashed var(--c-border-dashed)` | Дропзона (PlaylistGrid использует `--c-border`, MusicViews — `--c-border-dashed`; выбрать `--c-border-dashed`). |

> Живут в `tokens.css`, т.к. ссылаются только на тему-токены → `var()` резолвится под активную тему.

---

### 2.7. Тени — `--shadow-*` (геометрия invariant, цвет per-theme)

| Токен | Значение | Назначение |
|---|---|---|
| `--shadow-xs` | `0 1px 3px var(--c-shadow-card)` | Лёгкая. Паритет-риск: существуют варианты на `--c-black-50` и сыром `rgba(0,0,0,0.3)`. Для тяжёлого цвета — `--shadow-xs-strong: 0 1px 3px var(--c-black-50)`. |
| `--shadow-sm` | `0 2px 4px var(--c-shadow-card)` | `0 2px 5px` (MiniPlayer) близко, но не идентично (5 vs 4) — off-scale. Для строгого паритета цвета — `--shadow-sm-strong` на `--c-black-50`. |
| `--shadow-md` | `0 4px 12px var(--c-shadow-card)` | Приподнятая / popover. |
| `--shadow-md-popover` | `0 4px 15px var(--c-shadow-popover)` | MainScreen popover (×2). Off-scale blur (15). Кандидат → слить с `--shadow-md`. |
| `--shadow-lg` | `0 8px 24px var(--c-shadow-card)` | Hover карточки/грида. `0 10px 30px` — почти дубль, off-scale кандидат. |
| `--shadow-xl` | `0 10px 40px var(--c-black-70)` | Меню/модалка/контекст. Паритет-риск: та же геометрия с `--c-shadow-header` (gruvbox=0.2) — **разные** тени по темам, **не сливать**. Сырое `rgba(0,0,0,0.7)` → `--c-black-70`. |
| `--shadow-xl-header` | `0 10px 40px var(--c-shadow-header)` | Хедер MusicViews. Темо-различный цвет (default 0.5 / gruvbox 0.2). Держать отдельно ради паритета gruvbox. |
| `--shadow-2xl` | `0 20px 50px var(--c-shadow-phantom)` | Самая глубокая (drag-фантом, оверлей main.css). Паритет: сырое `rgba(0,0,0,0.5)` совпадает с gruvbox phantom, но **не** с default phantom (0.7). Если значение должно остаться ровно 0.5 — использовать `--c-shadow-popover` (default 0.5). |
| `--shadow-glow` | `0 0 10px var(--c-shadow-glow-accent)` | Акцентное свечение (RadioView active). |
| `--shadow-focus-ring` | `0 0 0 3px var(--c-accent)` | Фокус-кольцо (MusicViews). |
| `--shadow-error-ring` | `0 0 0 1px var(--c-error-ring)` | Кольцо ошибки в Modal. Нужен **новый** per-theme токен `--c-error-ring` (default `rgba(255,68,68,0.3)`; gruvbox — производное от `--c-error`) в `theme.ts`. |

> **БАГ (не паритет, исправить отдельно):** `FullPlayer.svelte` пишет `box-shadow: var(--c-shadow-popover)` / `var(--c-shadow-card)` — цвет-токен как **полное** значение `box-shadow` → невалидно, тень не рендерится. Замена на `--shadow-md`/`--shadow-xl` = исправление (появится тень) — это визуальное изменение, согласовать с владельцем отдельно.

---

### 2.8. Z-index — `--z-*` (invariant)

| Токен | Значение | Назначение |
|---|---|---|
| `--z-bg` | `-1` | **Новый.** Фоновые blur/overlay-слои (main.css). `-2` — через `calc` или второй `--z-bg-deep`. |
| `--z-base` | `1` | Существует. Базовое локальное стек-окно. |
| `--z-above` | `2` | **Новый.** Малый локальный шаг. |
| `--z-content` | `3` | **Новый.** Локальные слои контента 3–5; либо документировать 3–5 как интра-компонентные литералы. |
| `--z-overlay-local` | `10` | **Новый.** Локальный оверлей (RadioView/PlaylistGrid). |
| `--z-miniplayer` | `100` | Внутренний стек MiniPlayer (101/105/110). Off-scale vs глобальные банды. Токенизировать базу 100 + смещения через `calc`, либо литералы под паритет (кандидат §8). |
| `--z-sidebar` | `999` | Существует в `theme.ts`, **отсутствует** в `shared.css :root` → добавить в `tokens.css`. |
| `--z-dock` | `1000` | Существует. |
| `--z-modal` | `2000` | Существует. |
| `--z-toast` | `3000` | Существует. |
| `--z-menu` | `9000` | Существует в `theme.ts`, **отсутствует** в `shared.css :root` → добавить. |
| `--z-drag-item` | `9999` | Существует. |
| `--z-context-menu` | `10001` | Существует в `theme.ts`, **отсутствует** в `shared.css :root` → добавить. |

---

### 2.9. Анимации (invariant)

#### Переходы-композиты — `--trans-*` (существуют, недоиспользованы)

| Токен | Значение | Назначение |
|---|---|---|
| `--trans-fast` | `0.2s ease` | Применён только ×3 против ~21 сырого `0.2s ease`. **Самый большой разрыв адопции — внедрить.** |
| `--trans-smooth` | `0.3s cubic-bezier(0.2, 0.8, 0.2, 1)` | **Ноль использований (мёртвый токен)**, 6 хардкод-совпадений — внедрить. |

#### Длительности — `--dur-*` (новые, для per-property переходов)

| Токен | Значение | Назначение |
|---|---|---|
| `--dur-instant` | `0.1s` | 7 сырых `0.1s` микро-фидбэков нажатия. |
| `--dur-fast` | `0.2s` | Аналог `--trans-fast` без easing. |
| `--dur-base` | `0.3s` | Аналог `--trans-smooth` без easing. |
| `--dur-slow` | `0.4s` | Drawer/width-анимации (SideMenu). `0.5s` близко — снап сюда или литерал. |
| `--dur-slow-2` | `0.25s` | Off-scale одиночный. Кандидат → fast/base. |

#### Кривые — `--ease-*` (новые)

| Токен | Значение | Назначение |
|---|---|---|
| `--ease-default` | `ease` | Дефолтное ключевое слово. |
| `--ease-emphasized` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Стандартный decelerate (== `--trans-smooth`). ×5. |
| `--ease-sharp` | `cubic-bezier(0.2, 0, 0, 1)` | Кривая входа списков (BaseList/MusicViews). ×4. |
| `--ease-soft` | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | SideMenu width/transform. Off-scale (≈emphasized). |
| `--ease-linear` | `linear` | spin/progress/marquee. |

---

### 2.10. Размеры контролов — `--control-*` / круглые / свитч / icon-btn-pad (invariant)

| Токен | Значение | Назначение |
|---|---|---|
| `--control-h-sm` | `32px` | Минимальная высота интерактивной строки. |
| `--control-h-md` | `36px` | Компакт-пилл / мобильный header-экшен. |
| `--control-h-lg` | `40px` | Дефолтная/большая высота контрола. |
| `--control-h-xl` | `48px` | XL-инпуты / nav сайдбара / mini play. |
| `--control-h-2xl` | `50px` | Header-строки (ContextMenu/Modal). Off-scale vs 48. |
| `--control-pad-x-sm` | `16px` | = `--space-4`; горизонтальный padding контрола. |
| `--control-pad-x-md` | `20px` | = `--space-5`; дефолтный padding пилла. |
| `--icon-btn-pad` | `8px` | Стандартный padding «голой» иконо-кнопки (~40px цель вокруг 24px глифа). |
| `--icon-btn-pad-lg` | `10px` | Транспортная иконо-кнопка. Off-scale vs 8. |
| `--icon-btn-pad-sm` | `6px` | Компактная (docked) иконо-кнопка. |
| `--switch-w` | `44px` | Ширина дорожки тоггла. |
| `--switch-h` | `24px` | Высота дорожки тоггла. |
| `--switch-knob` | `20px` | Ручка тоггла; ход `translateX(20px)` = w − knob − 2×1px инсет. |
| `--circle-btn-sm` | `28px` | Малая круглая иконо-кнопка. Off-scale vs 32. |
| `--circle-btn-md` | `32px` | Дефолтная малая круглая. |
| `--circle-play-sm` | `44px` | Docked play (FullPlayer). Off-scale. |
| `--circle-play-md` | `48px` | Play MiniPlayer. |
| `--circle-play-lg` | `64px` | Play FullPlayer. |

### 2.11. Размеры иконок — `--icon-size-*` (invariant)

| Токен | Значение | Назначение |
|---|---|---|
| `--icon-size-xs` | `16px` | Самый мелкий глиф. |
| `--icon-size-sm` | `18px` | Снимает `!important`-хаки на размере svg при привязке на слотный svg. |
| `--icon-size-md` | `20px` | Средний глиф. |
| `--icon-size-lg` | `24px` | **Дефолтный/самый частый** транспорт/nav-глиф. |
| `--icon-size-xl` | `28px` | Большой play-глиф. |

> Толщина обводки иконок — `--icon-stroke-width: 1.5px` (см. §2.13).

### 2.12. Прозрачность — `--opacity-*` (invariant)

| Токен | Значение | Назначение |
|---|---|---|
| `--opacity-hidden` | `0` | Скрытое состояние enter/exit (×10). |
| `--opacity-ghost` | `0.3` | Очень слабые фоны/скелетоны. `0.1/0.2/0.4` off-scale → снап к рампе позже. |
| `--opacity-faint` | `0.5` | Disabled/dim (×13). |
| `--opacity-muted` | `0.6` | Вторичный текст/иконки (×9). Совпадает с `:disabled` opacity кнопок. |
| `--opacity-dim` | `0.7` | Приглушённый (×6). |
| `--opacity-strong` | `0.8` | Почти непрозрачные оверлеи. `0.85/0.9/0.95` off-scale → консолидация к 0.8/1. |
| `--opacity-visible` | `1` | Показанное состояние (×13). |

### 2.13. Лейаут — (invariant, вынести из theme.ts)

| Токен | Значение | Назначение |
|---|---|---|
| `--header-height` | `64px` | Сейчас задублирован (`theme.ts` + `shared.css`) → в `tokens.css`, убрать из `theme.colors`. |
| `--mini-player-height` | `90px` | Та же дублизация → в `tokens.css`. NB: `--space-50px` концептуально выводится отсюда. |
| `--icon-stroke-width` | `1.5px` | Сейчас только в `theme.colors` (нет в `shared.css :root`). Инвариантен (1.5px в обеих темах) → в `tokens.css`. |

### 2.14. Контрольная типографика — алиасы (invariant)

| Токен | Значение | Назначение |
|---|---|---|
| `--text-control` | `var(--text-base)` | Дефолтный размер текста контрола/лейбла; держит контролы в синхроне с body-шкалой. |
| `--weight-control` | `var(--weight-bold)` | Жирность пилл-кнопок; вторичные контролы — `--weight-semibold`. |

### 2.15. Брейкпоинты — `--bp-*` (DOC-ONLY, см. §6.4)

| Токен | Значение | Назначение |
|---|---|---|
| `--bp-sm` | `600px` | `max-width: 600px`; `max-height: 600px and orientation: landscape`. |
| `--bp-md` | `768px` | Основной мобильный брейкпоинт (×7). Источник правды через `constants.ts`. |
| `--bp-lg` | `800px` | Планшетный one-off (MusicViews). Кандидат → слить в `--bp-md`. |

> **CSS-переменные нельзя использовать внутри `@media`-feature-запросов.** `--bp-*` — документационные; реальный источник правды — `BREAKPOINTS` в `src/lib/constants.ts` для `matchMedia`; литералы в `@media`-правилах остаются.

---

### 2.16. Что остаётся в `theme.ts` (per-theme цвета)

В `theme.ts.colors` остаются **только цвета** (различаются default/gruvbox):

- Атомарные прозрачности: `--c-white-10..90`, `--c-black-20..90`.
- Акценты: `--c-accent`, `--c-accent-hover`.
- Текст: `--c-text-primary/secondary/muted/inverse`.
- Фоны: `--c-bg-app/main/sidebar/card/placeholder/glass/toast`.
- Семантика: `--c-heart`, `--c-error` + **новый** `--c-error-ring` (default `rgba(255,68,68,0.3)`, gruvbox — производное от `--c-error`; нужен для `--shadow-error-ring`).
- Поверхности: `--c-surface-*` (hover/active/input/input-focus/button/button-hover/drag-phantom/drag-land), `--c-rail-bg(/-hover)`, `--c-skeleton-base`.
- Границы (цвет): `--c-border`, `--c-border-dim`, `--c-border-bright`, `--c-border-dashed(/-hover)`.
- Оверлеи/тени (цвет): `--c-overlay-dim/backdrop`, `--c-shadow-card/popover/header/phantom/glow-accent`.
- Иконки (цвет): `--c-icon-idle/hover/faint`.
- Палитра плейлистов: `--c-pl-0..5`.

**Уходят из `theme.ts.colors` в `tokens.css`:** `--radius-*` (включая исправление `--radius-xl`), весь набор `--z-*`, `--trans-*`, `--header-height`, `--mini-player-height`, `--icon-stroke-width`. После выноса цикл `setProperty` в `ui.ts` перестаёт инжектить эти величины.

---

## 3. Шкалы: визуальная логика

### 3.1. Отступы
- **База 4px.** Ритм интерфейса строится на кратных 4 (`--space-1..10`).
- Чем больше число — тем «крупнее» разделение: внутри кнопки (`--space-2`), внутри карточки (`--space-3/4`), между секциями (`--space-6/8`).
- `--space-4` (16px) — канонический инсет контейнера. Используй его как дефолт для горизонтальных полей экрана.
- Off-scale (6/10/14/15/30/50) — паритетные «острова». Не вводи новые off-scale значения; для нового отступа выбирай ближайшее on-scale.

### 3.2. Типографика
- T-shirt-шкала от `--text-2xs` (10px) до `--text-8xl` (60px).
- **`--text-base` (14px) — основной body.** Заголовки/мета смещаются на ±шаг от него.
- Связки по умолчанию: body → `--text-base` + `--weight-regular` + `--leading-normal`; заголовок трека → `--text-md` + `--weight-medium` + `--leading-snug`; капс-бейдж → `--text-2xs/xs` + `--weight-bold/extrabold` + `--tracking-wide`.
- Off-scale размеры (13/15/28/60) сохранены под паритет; для нового текста бери ровный шаг шкалы.

### 3.3. Радиусы
- Прогрессия скругления: `xs(2) → sm(4) → md(8) → lg(12) → xl(20)`. Чем крупнее поверхность — тем больше радиус.
- `--radius-circle` (50%) — для круглых элементов (аватары, play-кнопки, ручки).
- `--radius-pill`/`--radius-full` — для капсульных контролов (теги, пилл-кнопки).
- Не путай `--radius-circle` (50%) и `--radius-full` (9999px): для не-квадратных элементов это **разный** результат.

### 3.4. Тени и z-index
- Тени по «высоте»: `xs → sm → md → lg → xl → 2xl`. Чем «выше» элемент над плоскостью — тем глубже тень.
- Z-index — банды: локальные (`-1..10`) → mini-player (100) → sidebar (999) → dock (1000) → modal (2000) → toast (3000) → menu (9000) → drag (9999) → context-menu (10001). Между бандами большие зазоры намеренно.

---

## 4. Компоненты-примитивы

> На момент написания в `src/components/` существуют только специализированные `Modal.svelte`, `Skeleton.svelte`, `LikeButton.svelte`, `PlayModeButton.svelte`. **Единых примитивов кнопок/иконок нет** — ~15 разрозненных классов (`.btn-primary`, `.btn-secondary`, `.btn-icon`, `.btn-action`, `.toggle-btn`, `.vol-btn`, `.side-btn`, `.play-btn`, `.play-btn-large`, `.mode-btn`, `.like-btn`, `.collapse-btn`, `.card-menu-btn`, `.clear-icon-btn`, `.hamburger-btn`).
>
> Ниже — **целевой** API примитивов. Это ТЗ: примитивы создаются так, чтобы инкапсулировать токены и заменить разрозненные классы без визуальных изменений (variant/size подобраны под существующие значения).

### 4.1. `Button`
Базовая текстовая/пилл-кнопка. Покрывает `.btn-primary`, `.btn-secondary`, `.btn-action`, `.collapse-btn`.

**Props**
| Prop | Тип | Дефолт | Описание |
|---|---|---|---|
| `variant` | `'primary' \| 'secondary' \| 'ghost'` | `'secondary'` | primary = акцентный фон; secondary = `--c-surface-button`; ghost = прозрачный. |
| `size` | `'sm' \| 'md' \| 'lg'` | `'lg'` | sm=`--control-h-md`(36), md/lg=`--control-h-lg`(40). |
| `shape` | `'pill' \| 'rounded'` | `'pill'` | pill=`--radius-pill`; rounded=`--radius-md`. |
| `disabled` | `boolean` | `false` | `opacity: var(--opacity-muted)`, `pointer-events: none`. |
| `loading` | `boolean` | `false` | Спиннер вместо контента. |
| `fullWidth` | `boolean` | `false` | `width: 100%`. |
| `onclick` | `() => void` | — | Обработчик. |

**Состояния:** default / hover (`--c-accent-hover` или `--c-surface-button-hover`) / active (press `transform`/`--dur-instant`) / focus-visible (`--shadow-focus-ring`) / disabled.
**Токены:** высота `--control-h-*`, паддинг `--control-pad-x-*`, текст `--text-control` + `--weight-control`, радиус `--radius-pill`, переход `--trans-fast`.

```svelte
<Button variant="primary" size="lg" onclick={save}>Сохранить</Button>
<Button variant="secondary" shape="rounded">Отмена</Button>
```

### 4.2. `IconButton`
«Голая» иконо-кнопка. Покрывает `.btn-icon`, `.vol-btn`, `.side-btn`, `.mode-btn`, `.card-menu-btn`, `.clear-icon-btn`, `.hamburger-btn`.

**Props**
| Prop | Тип | Дефолт | Описание |
|---|---|---|---|
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg'` | `'lg'` | Глиф: `--icon-size-xs/sm/md/lg`. |
| `pad` | `'sm' \| 'md' \| 'lg'` | `'md'` | `--icon-btn-pad-sm/--icon-btn-pad/--icon-btn-pad-lg`. |
| `circle` | `boolean` | `false` | `--radius-circle`; диаметр `--circle-btn-sm/md`. |
| `active` | `boolean` | `false` | Подсветка активного состояния (`--c-icon-hover`/`--c-accent`). |
| `label` | `string` | — | `aria-label` (обязательно для a11y). |
| `disabled`, `onclick` | | | как в Button. |

**Состояния:** idle (`--c-icon-idle`) / hover (`--c-icon-hover` + `--c-surface-hover`) / active / disabled.
**Слот:** один `<svg>` (размер задаётся токеном на слотном svg, без `!important`).

```svelte
<IconButton size="lg" pad="md" label="Меню" onclick={openMenu}>
  <MenuIcon />
</IconButton>
```

### 4.3. `PlayButton`
Круглая транспортная кнопка play/pause. Покрывает `.play-btn`, `.play-btn-large`.

**Props**
| Prop | Тип | Дефолт | Описание |
|---|---|---|---|
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Диаметр `--circle-play-sm`(44)/`md`(48)/`lg`(64); глиф `--icon-size-lg/xl`. |
| `playing` | `boolean` | `false` | play↔pause иконка. |
| `onclick` | `() => void` | — | Тоггл. |

**Токены:** `--radius-circle`, фон `--c-accent`, переход `--trans-fast`.

### 4.4. `Toggle` (Switch)
Переключатель. Покрывает `.toggle-btn`.

**Props:** `checked: boolean`, `disabled?: boolean`, `onchange?: (v: boolean) => void`, `label?: string`.
**Токены:** дорожка `--switch-w`×`--switch-h`, ручка `--switch-knob` (`--radius-circle`), ход `translateX(var(--switch-knob))` ≈ w − knob − инсет, цвет вкл `--c-accent`, переход `--trans-fast`.

### 4.5. `Pill` / `Tag` / `Badge`
Капсульная метка (`.meta-tag`, count-pill, badges).

**Props:** `variant: 'neutral' | 'accent' | 'outline'`, `size: 'sm' | 'md'`.
**Токены:** радиус `--radius-pill`, текст `--text-2xs/xs` + `--weight-bold` + `--tracking-wide`, паддинг `--space-0_5 var(--space-2)`.

### 4.6. `Modal` (существует)
Диалог поверх backdrop.

**Текущее/целевое API:** `open: boolean`, `title?: string`, `onclose?: () => void`, слоты `default` (тело) и `footer` (кнопки).
**Токены:** `--c-bg-card`, `--radius-lg`, `--shadow-2xl`/`--shadow-xl`, header-высота `--control-h-2xl`, z `--z-modal`, backdrop `--c-overlay-backdrop` + `--z-modal − 1`, ошибка `--shadow-error-ring`, текст `--leading-normal`.

### 4.7. `Skeleton` (существует)
Плейсхолдер загрузки.

**Props:** `width?`, `height?`, `radius?` (дефолт `var(--radius-sm)`), `circle?`.
**Токены:** фон `--c-skeleton-base`, анимация `--ease-linear` + `--dur-*`, `--opacity-ghost`.

### 4.8. `ContextMenu`
Всплывающее меню действий.

**Props:** `items: MenuItem[]`, `x`, `y`, `onclose`.
**Токены:** фон `--c-bg-glass`, `--radius-lg`, `--shadow-xl`, z `--z-context-menu`, строки высотой ~`--control-h-lg` с паддингом `--space-3 var(--space-14px)`, header `--control-h-2xl`, текст `--text-base-sm`.

### 4.9. `LikeButton` / `PlayModeButton` (существуют)
Специализированные иконо-кнопки. Внутри переиспользуют `IconButton` + цвет `--c-heart` (like) / `--c-accent` (active mode).

---

## 5. Паттерны

### 5.1. Карточка (album/playlist card)
- Контейнер: `--c-bg-card`, `--radius-lg`, hover-тень `--shadow-lg`, переход `--trans-fast`.
- Внутренний паддинг: `--space-3`/`--space-4`. Между карточками в гриде: `gap: var(--space-3)`.
- Обложка: `--radius-md`, плейсхолдер `--c-bg-placeholder`.
- Заголовок: `--text-md` + `--weight-medium`; мета: `--text-sm` + `--c-text-secondary`.
- Кнопка-меню в углу: `IconButton circle size="xs"` (`--circle-btn-sm`).

### 5.2. Строка списка (TrackRow и т.п.)
- Высота строки ~`--control-h-lg`; паддинг `--space-2 var(--space-4)`.
- Текст: `--text-base-sm` (плотный body), `--leading-snug`, многострочный clamp.
- Разделитель: `--border-default-dim` (`border-bottom`).
- Hover: `--c-surface-hover`. Активный трек: акцент `--c-accent` + индикатор воспроизведения (`--radius-xs`).
- Drag: фантом `--c-surface-drag-phantom` + `--shadow-2xl` + `--z-drag-item`; зона приземления `--c-surface-drag-land`.

### 5.3. Контекст-меню / sort-меню
- Подложка: `--c-bg-glass`, `--radius-lg`, `--shadow-xl`.
- Строки: высота ~`--control-h-lg`, паддинг `--space-3 var(--space-14px)`, иконка `--icon-size-md`, текст `--text-base-sm`.
- Выбранный пункт: `--weight-medium` + `--c-accent`.
- z: меню `--z-menu`, контекст-меню `--z-context-menu`.

### 5.4. Модалка
- Backdrop `--c-overlay-backdrop`; панель `--c-bg-card`/`--radius-lg`/`--shadow-2xl`.
- Header `--control-h-2xl` + `--text-xl`; тело `--leading-normal` + `--space-4`/`--space-5`.
- Футер: кнопки `Button` (`primary` + `secondary`), `gap: var(--space-3)`.
- Ошибка валидации: `--shadow-error-ring`.

### 5.5. Плеер (MiniPlayer / FullPlayer)
- MiniPlayer: высота `--mini-player-height` (90px), z `--z-miniplayer`, тень `--shadow-sm`, play `--circle-play-md` (48).
- FullPlayer: заголовок `--text-3xl`; play `--circle-play-lg` (64) с глифом `--icon-size-xl`; docked play `--circle-play-sm` (44).
- Транспортные иконо-кнопки: `IconButton size="lg" pad="lg"` (`--icon-btn-pad-lg`); компактные docked — `pad="sm"`.
- MainScreen имеет `padding-bottom: var(--space-50px)` под зазор мини-плеера (концептуально привязан к `--mini-player-height`).
- **Исправить** (не паритет): сломанные `box-shadow` FullPlayer (см. §2.7) → `--shadow-md`/`--shadow-xl`.

---

## 6. Правила использования

### 6.1. Всегда токены, никаких магических чисел
- В `.svelte`/CSS не должно быть сырых `px`/цветов/длительностей для дизайнерских величин. Всегда `var(--token)`.
- Цвет → `--c-*`. Геометрия/типографика/анимация → инвариантные токены. Граница → `--border-*`. Тень → `--shadow-*`.
- Составные значения собираются из токенов: `padding: var(--space-2) var(--space-4)`.
- Отрицательные значения — `calc(-1 * var(--space-N))`.
- `!important` сохраняется как `var(--token) !important`.

### 6.2. Когда создавать новый токен
1. Сначала ищи существующий токен ближайшего значения. Если значение уже есть на шкале — используй его.
2. Новый токен оправдан, только если значение реально новое **и** семантически значимое, и оно одинаково в обеих темах (для инвариантных осей).
3. **Не вводи новые off-scale значения.** Для новой величины выбирай ровный шаг шкалы. Существующие off-scale — наследие под паритет, не образец.
4. Цвет, различающийся между темами, → добавить во **все** темы `theme.ts` сразу (иначе пропуск на одной теме).

### 6.3. Семантика поверх атомов
- Предпочитай семантический токен (`--c-text-secondary`) атомарному (`--c-white-60`). Атомарные `--c-white-*`/`--c-black-*` — строительные блоки для определения семантических, не для прямого применения в компонентах.

### 6.4. Где CSS-переменные не работают
- **`@media`**: CSS-var нельзя в feature-запросах. Источник правды — `BREAKPOINTS` в `constants.ts` (`matchMedia`), литералы в `@media` остаются; `--bp-*` — только документация.
- **Svelte JS-переходы** (`fade`/`fly`/`scale` с `duration: 100/150/200/300`): не читают `var()`. Зеркалить в `constants.ts`:
  ```ts
  export const MOTION = { instant: 100, fast: 200, base: 300 } as const;
  export const BREAKPOINTS = { sm: 600, md: 768, lg: 800 } as const;
  ```

---

## 7. Гайд для Claude Design

### 7.1. Что можно менять свободно (значения, темы)
- **Значения токенов** в `tokens.css` (`--space-*`, `--text-*`, `--radius-*`, `--shadow-*` геометрия, `--dur-*`, `--ease-*`, `--control-*`, `--icon-*`, `--opacity-*`). Меняя одно значение, меняешь весь интерфейс согласованно — это и есть цель системы.
- **Цвета тем** в `theme.ts.colors` — для default/gruvbox или новой темы. Новая тема = новый объект с тем же набором ключей `--c-*`.
- **Рационализация off-scale** (см. §8): схлопывание 6→8, 10→12 и т.п. — это намеренные визуальные изменения, делаются здесь.
- **Дефолты вариантов/размеров** примитивов (какой `size` дефолтный у `Button`).

### 7.2. Что трогать осторожно (структура/примитивы)
- **API примитивов** (имена props, варианты): меняй обдуманно — это контракт, его использует много компонентов. Добавлять варианты безопаснее, чем переименовывать/удалять.
- **Имена токенов**: переименование требует обновления всех потребителей. Предпочитай добавление алиаса.
- **Разделение слоёв** (`tokens.css` invariant vs `theme.ts` цвета): не переноси цвет в `tokens.css` и геометрию в `theme.ts`. Иначе ломается темизация / появляется дублирование при 3-й теме.
- **Композитные токены, ссылающиеся на цвет** (`--shadow-*`, `--border-*`): меняй геометрию свободно, но не зашивай конкретный цвет литералом — оставляй ссылку `var(--c-*)`, иначе тень/граница перестанут адаптироваться под тему.
- **Паритет-риск тени** (`--shadow-xl` vs `--shadow-xl-header`): не сливай — `--c-shadow-header` в gruvbox даёт другую тень.

### 7.3. Чек-лист безопасного изменения
1. Меняешь значение токена — проверь обе темы (особенно тени на `--c-shadow-header`, `--c-shadow-phantom`).
2. Добавляешь цвет — добавь во **все** темы.
3. Не вводи новые off-scale; снимай существующие через рационализацию (§8).
4. После изменения — `npm run check` (типы) и визуальная сверка на живом moOde.

---

## 8. Открытые вопросы рационализации

> Это кандидаты на **будущие визуальные изменения** (этап Claude Design). Сейчас всё сохранено под паритет.

### 8.1. Главный: `--radius-xl` theme split
`default`+`shared.css` = **20px**, `gruvbox` = **16px**. Радиус — инвариантная ось, значит это БАГ. **Решение:** унифицировать на **20px** в `tokens.css`. Для gruvbox это согласованное мелкое визуальное изменение (карточки/модалки чуть круглее). Явно отмечено и принято как часть выравнивания инвариантной оси — **не** нарушение паритета default.

### 8.2. Pill radius drift
Пилл-кнопки хардкодят `border-radius: 20px` (== default `--radius-xl`, но на gruvbox `--radius-xl`=16) — на gruvbox литерал расходился с токеном. `--radius-pill: var(--radius-full)` убирает дрейф **и** сохраняет default-паритет (капсула для коротких контролов). Если нужен строгий байт-паритет литерала 20px → `--radius-pill: 20px`.

### 8.3. Отступы off-scale
- `6px` (`--space-2xs`, gap ×5) → 4 или 8.
- `10px` (`--space-2_5`, **самый частый gap** ×15) → 8 или 12.
- `3/5/7/14/15/30px` → ближайший шаг (2/4, 4/6, 8, 12/16, 16, 32).
- `50px` (`--space-50px`, MainScreen `padding-bottom`) — привязать к `--mini-player-height` вместо `--space-*`.

### 8.4. Типографика off-scale
- `13px`/`15px` (`--text-base-sm`/`--text-md`) — между 12/14/16, кандидаты на схлопывание шкалы.
- `28px` (`--text-4xl`), `60px` (`--text-8xl`) — одиночные нестандартные шаги.
- `--leading-tight` (1.1) ≈ `--leading-snug` (1.2) — слить.
- `--tracking-tight` (0.2px) ≈ `--tracking-wide` (0.5px) — слить/удалить.

### 8.5. Радиусы off-scale
`1px`/`3px` → `--radius-xs` (2px); `6px` (`--radius-6px`) → sm/md; `10px` count-pill / `30px` toast → `--radius-pill`/`--radius-full`.

### 8.6. Тени off-scale
- `--shadow-md-popover` (blur 15) → слить с `--shadow-md` (12).
- `0 2px 5px` (MiniPlayer) → `--shadow-sm` (4); `0 10px 30px` → `--shadow-lg` (24).
- Сырые `rgba` в `box-shadow` (ServicesSettings/AlarmSettings 0.3, main.css 0.5, SortMenu 0.7) обходят `--c-shadow-*` и **не адаптируются под gruvbox** — токенизация изменит именно gruvbox; проверить значение в обеих темах перед заменой.
- Цвета `--c-black-50/70` vs семантические `--c-shadow-*` — для строгого паритета `--shadow-xs/sm` нужны `-strong`-варианты.

### 8.7. Z-index off-scale
- MiniPlayer `101/105/110` (`--z-miniplayer`) — формализовать как база 100 + смещения через `calc`, либо литералы.
- Локальные `2/3/4/5/10` — формализовать малую локальную шкалу.
- `shared.css :root` недосчитывает `--z-sidebar/--z-menu/--z-context-menu` — добавить в `tokens.css`.

### 8.8. Анимации off-scale
- `--dur-slow-2` (0.25s), `0.5s` — снап к `--dur-fast/base/slow`.
- `--ease-soft` ≈ `--ease-emphasized` — слить.

### 8.9. Прозрачность off-scale
`0.1/0.2/0.4` → `--opacity-ghost`; `0.85/0.9/0.95` → `--opacity-strong`/1. Рамп.

### 8.10. Размеры контролов off-scale
`28px`/`44px` (`circle-btn-sm`/`circle-play-sm`) между 24/32/48/64; `50px` (`control-h-2xl`) vs 48; `icon-btn-pad` 10 vs 8.

### 8.11. Брейкпоинты
`800px` (`--bp-lg`) — одиночный, консолидировать в `768px` (`--bp-md`).

### 8.12. Цвета вне моих осей — ВЫПОЛНЕНО (фаза Claude Design)
- Legacy `#4cd964` — устранён вместе с `main.css`. ✓
- Семантические error/warn/success токенизированы: `--c-error/--c-warn/--c-success` в обеих темах (`theme.ts` + `shared.css` fallback); потребители (`Modal`, `ServicesSettings`, Yandex-градиенты) переведены на токены. ✓

### 8.13. Дублирование (устраняется выносом в `tokens.css`)
Инвариантные токены (`--radius-*`, `--z-*`, `--trans-*`, `--header-height`, `--mini-player-height`, `--icon-stroke-width`) определены **дважды** — в `theme.ts.colors` (инжект `ui.ts`) и `shared.css :root`. Вынос в `tokens.css` устраняет дублирование и рассинхрон.

---

## Приложение A. План миграции (для исполнителя)

1. Создать `src/styles/tokens.css` со всеми инвариантными токенами (§2.2–2.15) + композитами (§2.6–2.7).
2. Подключить `tokens.css` **перед** `shared.css` в `App.svelte`/`main.ts`.
3. Удалить инвариантные токены из `theme.ts.colors`; оставить только цвета (§2.16). Добавить `--c-error-ring`.
4. Урезать цикл `setProperty` в `ui.ts` — инжектить только цвета.
5. Убрать дубли инвариантных токенов из `shared.css :root`; добавить недостающие `--z-sidebar/menu/context-menu` в `tokens.css`.
6. Удалить мёртвый импорт `src/app.css`; свести/удалить `src/assets/main.css`.
7. Добавить `BREAKPOINTS`/`MOTION` в `constants.ts`.
8. Создать примитивы (§4); заменить разрозненные классы.
9. Прогон: заменить сырые значения на `var(--token)` по компонентам, сверяясь с `mapsToRaw`.
10. `npm run check` + визуальная сверка обеих тем на живом moOde.
