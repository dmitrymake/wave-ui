# Wave UI — Бренд-библия (фаза «Claude Design»)

> Арт-дирекшн на основе пяти специализированных аудитов (color / type / spacing / logo / components), прошедших состязательную верификацию и независимое ревью. Все hex/px сверены с кодом, все контрасты пересчитаны по WCAG 2.1 (sRGB-relative-luminance). Тон — спокойный, премиальный, аудиофильский: меньше неона, меньше «жирноты», больше тишины вокруг контента и одна согласованная красная нить через весь продукт.

---

## 1. Визуальное направление (north-star)

Wave — это инструмент для слушания, а не витрина. Поэтому общая линия — **«тихая премиальность»**: глубокий почти-чёрный каркас (`#000`/`#121212`), один уверенный фирменный красный `#fa2d48` как единственный цветовой акцент, и строгая, музыкальная типографическая шкала без крикливых 800-весов и без «пузырчатых» радиусов. Цвет в интерфейсе работает как редкая специя: акцент только на действии (play, like, primary), статусы — через семантический триплет, всё остальное — оттенки нейтрали. Это ровно то, чего ждёт аудиофил у настенного Pi-тачскрина: спокойствие, читаемость, предсказуемость.

Три сквозных решения этой фазы: (1) **один красный** `#fa2d48` от иконки до акцента, конец дрейфа из четырёх hex; (2) **музыкальная типошкала** — убираем одно-пиксельные ступени 13/15px, опускаем потолок веса до 700, добавляем дыхание капсам через трекинг; (3) **честная система высоты** — рабочие тени (сейчас две поверхности рендерятся плоско из-за CSS-бага) и аккуратная сетка отступов на базе 4px. Каждое изменённое значение либо нулевое для default, либо повышает контраст; всё проверено для **обеих** тем по реальным числам, а не «на глаз».

---

## 2. Палитра

### 2.1. Канонический бренд-красный (конец дрейфа)
Красный «течёт» по местам: `--c-accent #fa2d48` (`theme.ts:25`), лого `#eb1250` (`wave-logo.svg:4`), иконка `#e74c5e` (`icon-base.svg:3`), фон иконки навы `#1a1a2e` (`icon-base.svg:2`, `manifest.webmanifest:7-8`, `index.html:8`), плюс root-фолбэк `--c-accent #fa2d48` (`shared.css:21`). **Канон — `#fa2d48`** (он же `--c-pl-0`, `theme.ts:89`). Внутри приложения уже консистентно — это полировка лаунчер-иконки/сплэша/вордмарка, не рантайм-дефект.

| Токен | default | gruvbox | Действие |
|---|---|---|---|
| `--c-accent` (fill) | `#fa2d48` | `#d65d0e` | **не трогать** — канон. Контраст для ТЕКСТА на нём решается §2.3 |
| `--c-accent-hover` | `#ff4d65` | `#fe8019` | не трогать |
| лого fill | `#eb1250`→**`currentColor`** | авто из темы | `wave-logo.svg:4` |
| иконка stroke | `#e74c5e`→**`#fa2d48`** | (тема-агностично) | `icon-base.svg:3` |
| иконка ground | `#1a1a2e`→**`#121212`** | — | `icon-base.svg:2` |
| manifest background_color | `#1a1a2e`→**`#121212`** | — | `manifest.webmanifest:7` |
| manifest theme_color | `#1a1a2e`→**`#000000`** | — | `manifest.webmanifest:8`, `index.html:8` |

**Синхро-риск:** `shared.css:21-22` дублирует `--c-accent/-hover` как root-фолбэк (значение уже `#fa2d48`). Не менять, но при любой смене акцента править оба места.

### 2.2. Семантический триплет error / warn / success
Сейчас захардкожен мимо токенов и мимо тем: `Modal.svelte:147` `#ff4444 !important`; `ServicesSettings.svelte:230` `#2ecc71` / `:234` `#e74c3c`; `YandexDashboard.svelte:135` и `YandexView.svelte:257` градиент `#ffcc00→#ff3333`. Добавляем `--c-warn`/`--c-success` в `theme.ts` рядом с существующим `--c-error` (`theme.ts:44/135`).

| Токен | default | контраст | gruvbox | контраст | вывод |
|---|---|---|---|---|---|
| `--c-error` | `#ff4444` (есть) | 5.50:1 / `#121212` ✅ AA-normal | **`#fe5b4a`** (вместо `#cc241d`) | **4.78:1 / `#282828` ✅ AA-normal** | см. примечание |
| `--c-warn` | `#ffcc00` (новый) | 12.39:1 ✅ | `#fabd2f` (новый) | 8.69:1 ✅ | |
| `--c-success` | `#2ecc71` (новый) | 8.91:1 ✅ | `#b8bb26` (новый) | 7.14:1 ✅ | gruvbox bright green |

**Поправка по ревью (P1):** ранее предлагался gruvbox `--c-error #fb4934` и помечался «AA pass» — это неверно: `#fb4934` на `#282828` = **4.29:1**, что НЕ проходит AA-normal (нужно 4.5). Текущий `#cc241d` = 2.69:1 — провал. Берём **`#fe5b4a` (4.78:1)** — честно проходит AA-normal на body-тексте `.disconnected` (`ServicesSettings.svelte:234`). Default `#ff4444` (5.50:1) не трогаем — паритет.

Замены: `Modal.svelte:147` `#ff4444`→`var(--c-error)` (попытаться снять `!important`, если каскад позволяет); `ServicesSettings.svelte:230` `#2ecc71`→`var(--c-success)`, `:234` `#e74c3c`→`var(--c-error)`, подложки `:229/:233`→`color-mix(in srgb, var(--c-success/error) 18%, transparent)`. default — **ноль визуальных изменений** (токены = текущим литералам).

### 2.3. Текст на акценте — ИСПРАВЛЕНО (это была главная ошибка черновика)
**Критичная переработка по ревью (P0).** Черновик утверждал, что белый текст на `--c-accent` спасается правилом «700 uppercase ≥14px → large-text 3:1». Это **фактически неверно**: WCAG «large text» = 18pt (24px) regular ИЛИ 14pt **bold** (=18.66px), мерится в ПУНКТАХ. `Button.svelte:104-105` ставит `font-size:var(--text-control)`=14**px**=10.5pt при `--weight-control`=700. 10.5pt bold **далеко** ниже порога large-text → требуется AA-normal **4.5:1**. Реальные числа:

- белый на `#fa2d48` = **3.79:1** → провал AA-normal;
- крем `#fbf1c7` (gruvbox `--c-text-primary`) на `#d65d0e` = **3.41:1** → провал (хуже, т.к. label = крем, а не белый — `Button.svelte:137` `color:var(--c-text-primary)`).

Самая заметная CTA продукта была **ниже AA в обеих темах**. Фикс — дешёвый и тема-корректный:

| Тема | Primary fill | Primary label | Контраст | Что менять |
|---|---|---|---|---|
| default | `--c-accent #fa2d48` (без изм.) | **`--c-text-inverse #000`** (было `--c-text-primary`) | **5.53:1 ✅** | `Button.svelte:137` |
| gruvbox | **`--c-accent-hover #fe8019`** (bright orange, on-palette) | **`--c-text-inverse #282828`** | **5.84:1 ✅** | вариант `.btn--primary` для gruvbox |

Default решается одной строкой (label → инверсный чёрный, fill остаётся каноничным). Gruvbox: `--c-text-inverse #282828` на `#d65d0e` даёт лишь 3.81:1 (провал), поэтому для gruvbox primary-fill берём **bright orange `#fe8019`** (он уже `--c-accent-hover`, на палитре) + тёмный label = 5.84:1. Технически: либо отдельное правило `:global([data-theme="gruvbox"]) .btn--primary { background: var(--c-accent-hover) }`, либо вводим `--c-accent-btn` (default `#fa2d48`, gruvbox `#fe8019`). **Правило `≥600/≥14px` НЕ является обоснованием AA — оно удалено из бренд-библии.** Любой текст на заливке акцента обязан использовать `--c-text-inverse` (и в gruvbox — fill `#fe8019`); проверять все пилюли/бейджи на акценте по этому же правилу.

### 2.4. gruvbox muted text (фикс AA)
`--c-text-muted #928374` на `#282828` = **4.02:1** — провал AA для body. **Поднять до `#a89984`** (gruvbox fg4, уже живёт как `--c-icon-idle`, `theme.ts:172`) → **5.30:1** ✅. Трогает только gruvbox; default `#888888` = 5.28:1 не трогаем. `theme.ts:122`.

### 2.5. Градиенты favorites/vibe (токенизация + фикс белой иконки)
`YandexDashboard.svelte:104` `#fa2d48→#c01c33`, `:135` `#ffcc00→#ff3333`; `YandexContentHeader.svelte:80`; `YandexView.svelte:257` (UPPERCASE — дрейф регистра). Ввести `--grad-favorites: linear-gradient(135deg, var(--c-accent), color-mix(in srgb, var(--c-accent) 65%, #000))` и `--grad-vibe`. **Важно:** белый глиф на жёлтой ноте `#ffcc00` = `1.51:1` — токенизация это НЕ чинит. Нужен тёмный scrim под иконку или не-белый глиф. `#c01c33`-сирота: больше не удаляем «насухо» — она пригодится как кандидат на `--c-accent-btn` в default (white-on-#c01c33 = 6.08:1), либо удалить, если §2.3 реализуется через label-инверсию.

### 2.6. Высотный рамп default (опционально, низкий приоритет)
`--c-bg-card #1a1a1a`→`#1e1e1e` для более явного отрыва карточек/инпутов от `#121212`. Если делать — синхронно поднять `--c-surface-input` (`theme.ts:50`) и `--c-surface-drag-phantom` (`theme.ts:55`). gruvbox не трогать. Тост `#333333` (`theme.ts:41`) НЕ коллизирует.

### 2.7. FullPlayer фон (тема-слепые литералы)
`FullPlayer.svelte:225` `#121212 0%, #000000 100%`→`var(--c-bg-main) 0%, var(--c-bg-app) 100%`; `:238` `rgba(0,0,0,0.95)`→`var(--c-black-90)`. В gruvbox плеер начнёт уходить в тёплый `#282828`, а не в чёрный.

### 2.8. Палитра плейлистов (опционально, вкусовое)
Default `--c-pl-1..5` (`theme.ts:90-94`) — неон (`#2dfa85` белый = 1.39:1). Видны только на grid-карточках (`PlaylistGrid.svelte:19 colorVar`). Если приглушать — **не брать светлые `#22c55e/#f59e0b/#06b6d4`** (white 2.15–2.43:1): нужен тёмный scrim или L≤0.4. `--c-pl-0 #fa2d48` оставить. gruvbox-палитра (`theme.ts:181-186`) — эталон, не трогать.

---

## 3. Типографика (приоритет №1 пользователя)

Линия: **музыкальная шкала ≈ minor third, потолок веса 700, капсы всегда с трекингом**. Каждое изменение ниже — геометрия (вес/размер/трекинг), цвет не затрагивается → идентично в обеих темах.

### 3.1. Семантические роли (новое в `tokens.css §19`)
«Заголовок» переобъявлен 5 раз с дрейфом: `TrackRow.svelte:334-339` (15/500/snug), `MusicViews.css:114-117` card-title (15/600), `FullPlayer.svelte:295` (24/700), `MusicViews.css:347-352` simple header (24/800), `:285-290` hero (40/800). Свести к трём ролям: **display / title / subtitle**. Паритет-безопасный первый шаг: `MusicViews.css:115` `--weight-semibold`(600)→`--weight-medium`(500) под стать TrackRow (проверить плотные grid-сетки).

### 3.2. Убрать одно-пиксельные ступени 13/15px (санкция DESIGN.md §8.4:586)
| Старое | Новое | Где (примеры) |
|---|---|---|
| `--text-base-sm` 13px → **`--text-base` 14px** | body/meta | `TrackRow.svelte:343,365`; `MusicViews.css:128`; menu rows |
| `--text-md` 15px → **`--text-lg` 16px** | titles | `TrackRow.svelte:335`; `MusicViews.css:116` |

**Обязательная проверка:** высота 2-строчного клампа `TrackRow` после +1px к title с `--leading-snug`. Масштабную «перешкалку» 21/34/44 не трогаем.

### 3.3. Капсы — трекинг и согласованность
`MusicViews.css:277-283` `.header-label`: uppercase, но **без letter-spacing**. **Добавить `letter-spacing: var(--tracking-wide)`** и принять правило: каждый `text-transform: uppercase` несёт `--tracking-wide`. Опционально: `14px→12px` (`--text-sm`) — eyebrow меньше своего заголовка.

### 3.4. Потолок веса = 700 (убрать 800)
`--weight-extrabold`(800) в 3 местах: `MusicViews.css:287`, `:349`, `RadioView.svelte:135`. 800 на grid-заголовке перевешивает 700 у now-playing (`FullPlayer.svelte:295`) — неверная иерархия. Заголовки→`--weight-bold`(700); бейдж 10px→700. Удалить `--weight-extrabold` (`tokens.css:99`).

### 3.5. Leading: слить дубль + добавить body-tight
`--leading-tight`(1.1) ≈ `--leading-snug`(1.2), зияние 1.2→1.5 без компактного body (санкция DESIGN §8.4:588). Целевой набор: `--leading-none`(1) / `--leading-snug`(**1.15**) / `--leading-normal`(**1.4**) / `--leading-relaxed`(**1.6**). Мигрировать `MusicViews.css:289` tight→snug (проверить 2-строчный hero).

### 3.6. Tracking: убрать лишнюю пару
`--tracking-tight`(0.2px) использован 1 раз (`shared.css:249 .meta-tag`, не-uppercase). Удалить `--tracking-tight` (`tokens.css:89`), `.meta-tag`→0. Оставить `--tracking-wide`(0.5px) единственным капс-токеном. Опционально добавить `--tracking-wider:1px` для 10px-капс-бейджей (`RadioView.svelte:139`).

### 3.7. FullPlayer artist 18→16px
`FullPlayer.svelte:300` artist `--text-xl`(18px) при title 24px — слишком близко. →`--text-lg`(16px), отношение 24:16 = 1.5 (чистая квинта). `--text-xl`(18px) дублируется 5 settings-заголовками — дать им отдельную subtitle-роль. Докированный artist (`:301`, 13px) подхватывается ремапом §3.2 → 14px.

### 3.8. Mono-стек (Pi/Linux)
`tokens.css:107` `--font-mono: monospace` (голый keyword) на Pi резолвится в DejaVu шире окружающего sans. Заменить на: `ui-monospace, 'SF Mono', 'Cascadia Code', 'JetBrains Mono', 'Roboto Mono', 'DejaVu Sans Mono', monospace`. Несущие на Pi — `'DejaVu Sans Mono'` и `ui-monospace`. Применяется в `AboutSettings:65`, `AlarmSettings:157`, `ServicesSettings:213`. tabular-nums (`FullPlayer:324`, `TrackRow:367`) остаются на sans — не трогать.

### 3.9. 10px (`--text-2xs`) — строго резервировать
`SideMenu.svelte:418-421` footer: 10px × `--c-text-muted` × `opacity 0.5` — двойной удар. **Снять `opacity` (`:421`)**, поднять `:419` до `--text-xs`(11px). Бейджи/капсы (`RadioView:134`, `card-badge` `MusicViews.css:141`) оставить 10px. Комментарий `tokens.css:62`→«caps/badges only, never body».

### 3.10. Display-шрифт — НЕ внедрять (по умолчанию)
Кастомный variable-фейс несёт +40-60KB woff2, лишний SW-asset на Pi, FOUT-риск, не в backlog §8. **Остаться на system-only `--font-sans` (`tokens.css:106`)** и положиться на дисциплину шкалы/веса. Если когда-нибудь — отдельный `--font-display`, только ≥24px + вордмарк, Latin+Cyrillic subset, `font-display:swap`, `size-adjust`.

---

## 4. Отступы и ритм

База — 4px. Цель: убрать off-grid интервенты (6/10/15/30/50px) и привязать дубли к токенам.

### 4.1. Решение по 10px (`--space-2_5`) — расщепить по роли, удалять ТОЛЬКО после полной миграции
**Поправка по ревью (P1):** в коде **36** использований `--space-2_5` (проверено grep), а не ~9. Удаление токена до миграции ВСЕХ 36 оставит `var(--space-2_5)`→невалид→0 и схлопнет паддинги по всему settings+sidebar. Полный реестр (роль: inline→8px `--space-2`, контейнер/инпут→12px `--space-3`):

- **inline-кластеры → `--space-2`:** `TrackRow:358`, `MusicViews.css:301`, `FullPlayer:298`.
- **контейнеры/паддинги → `--space-3`:** `Modal:212,228`, `SideMenu:231,263,297,333,397,491`, `Input.svelte:138`, `Card.svelte:63`, `SearchView:241`, `PlaylistsView:475`, `LibraryView:441`, `AppearanceSettings:52,67`, `ConnectionSettings:66,81`, `AlarmSettings:110,125,149`, `ServicesSettings:143,158,211`, `AboutSettings:38,53`, `YandexSearchBar:56`, `PlaylistSearchResults:201`, `MusicViews.css:418` (несёт `!important` — мигрировать аккуратно).
- **негативный margin карточки:** `MusicViews.css:84`→`calc(-1*var(--space-3))` — **чинит** существующий рассинхрон 10-vs-12.

Только после прохода по всем 36 — удалить `--space-2_5` (`tokens.css:48`). **Объём — не L, а M/L** (36 сайтов, ~20 файлов, плюс bulk в settings). Низкорисковая альтернатива, если время поджимает: оставить токен, но **алиасить `--space-2_5: var(--space-3)`** и перестать добавлять новые использования.

### 4.2. 6px (`--space-2xs`) — то же, **26** использований (не ~7)
Реестр по роли: inline-группы → `--space-2` (`MainScreen:272`, `MiniPlayer:259,261`, `MusicViews.css:127`, `ContextMenu:331`, плюс остальные ~18 сайтов по settings/sidebar — перечислить при реализации тем же методом, что §4.1); микро → `--space-1` (`MusicViews.css:282`, `ContextMenu:376`). Удалить `--space-2xs` (`tokens.css:47`) **только** после полного прохода по всем 26. Та же альтернатива-алиас допустима.

### 4.3. Зазор под мини-плеером — единый источник, **с живой проверкой ДО удаления**
Дубль: токен `--mini-player-height:90px` (`tokens.css:268`) + локальное переобъявление `MainScreen.svelte:154`. Удалить локальное переобъявление и литерал-фолбэк `MiniPlayer.svelte:194`→`var(--mini-player-height)`. **Поправка по ревью (P2):** прежде чем трогать нижний пад `.list-body` (`MusicViews.css:669`, 50px) и удалять `--space-50px`, **обязательна проверка на moode.local для КАЖДОГО view** (QueueView/SearchView/LibraryView используют разные обёртки скролла), что внешний контейнер реально укорочен 90px-доком и последняя строка его очищает. Если хоть один view не укорочен — оставить там нижний пад, привязанный к `--mini-player-height`, а не к 0. `SearchView.svelte:251` — это **margin-top, не связан** с доком → мигрировать в `--space-10` (40px), **НЕ в 0**. Удаление `--space-50px` (`tokens.css:56`) — последним шагом, после зелёной живой проверки.

### 4.4. Горизонтальные инсеты шелла (видимый «джог»)
**Поправка по ревью (P2):** `MainScreen.svelte:232` уже токенизирован — `padding: var(--space-0) var(--space-8)`, а не литерал `0 32px`. Реальная правка: **`--space-8`(32px)→`--space-4`(16px)** на `:232`, чтобы левый край хедера совпал с телом контента (`MusicViews.css:34` = 16px). gap `--space-15px`→`--space-4` (`:235`). Остальные 2 сайта `--space-15px` (`SideMenu:327`, `FullPlayer:258`)→`--space-4`, удалить `--space-15px` (`tokens.css:53`).

### 4.5. Off-grid в FullPlayer hero
`.player-body` gap `30px`(`:247`)→`--space-8`(32px). Убрать дублирующий `.art-container margin-bottom`(`:266`) — flex gap уже разводит (сейчас 30+10=40px непреднамеренно). `.meta margin-bottom`(`:292`) `10px`→`--space-2`. `AlarmSettings:183`→`--space-8`, удалить `--space-30px`(`tokens.css:55`).

### 4.6. List-ритм и shell-токены (токенизация, 0px сдвига)
Новые токены в `tokens.css §18`: `--row-h:64px`, `--thumb-sm:40px`, `--thumb-md:48px`, `--thumb-lg:64px`, `--sidebar-w:250px`, `--sidebar-w-collapsed:80px`, `--dock-w:280px`. Реальный дубль высоты строки — `TrackRow.svelte:245` ↔ `BaseList.svelte:245` (skeleton-jitter) → оба `var(--row-h)`. Миниатюры: `TrackRow:312`→`--thumb-sm`, `MiniPlayer:248`→`--thumb-lg`, `:290`→`--thumb-md`. Сайдбар: `SideMenu:201/214/446/481/484`, док `MainScreen:296`. `QueueView:229-230` и `PlaylistsView:450-451` — это `.header-icon-wrap` 64×64, НЕ строки.

### 4.7. Размеры контролов
`--control-h-2xl` 50→48 (алиас `--control-h-xl`; `Modal:176`/`ContextMenu:267`). `--circle-btn-sm` 28→32 (= `--circle-btn-md`; `MiniPlayer:265`). `--icon-btn-pad-lg` 10→8 — самый низкоприоритетный (транспорт 44→40px, выше WCAG 2.5.8). **`--circle-play-sm` оставить 44px** — touch-floor, не уменьшать.

---

## 5. Радиусы, тени, движение

### 5.1. Тени — критический баг (P0)
`FullPlayer.svelte:274` `box-shadow: var(--c-shadow-popover)` и `:342` `var(--c-shadow-card)` передают **голый цвет** как box-shadow — по спеке невалидно → артворк и play-кнопка плоские в **обеих** темах. **`:274`→`var(--shadow-lg)`, `:342`→`var(--shadow-sm)`** (оба ссылаются на `--c-shadow-card` rgba(0,0,0,0.3), одинаково в темах).

### 5.2. Система высоты (рамп 3-4 ступени)
Сырые тени мимо токенов: `SortMenu.css:60` `0 10px 40px rgba(0,0,0,0.7)`→`--shadow-xl` (default байт-идентично; **gruvbox светлеет до rgba(40,40,40,0.7)** — видимое, но желательное тема-осознание); `MusicViews.css:675`→`--shadow-lg`; `MiniPlayer.svelte:237`→`--shadow-sm`. **Поправка по ревью (P2):** `MiniPlayer:237` = `0 2px 5px` (blur 5), а `--shadow-sm` = `0 2px 4px` (blur 4) — это **изменение блюра на 1px, НЕ байт-идентично** (санкция DESIGN §8.6), помечаю честно.

**Knob/thumb-тени — пересмотр по ревью (P2, легибилити).** Черновик схлопывал `-strong`(alpha .5)→base(.3) для всех ползунков. Но **`FullPlayer:319` (volume knob) и `VolumeSlider:170`** сидят на размытом ярком артворке (`FullPlayer` bg = `saturate(3) brightness(1.1)`), где `.5`-тень — единственное, что отделяет светлый кружок от светлого фона. **Решение:** для этих двух узлов **оставить `--shadow-sm-strong` (alpha .5)**; на статичном тёмном хроме (`MiniPlayer:228`, `shared.css:191`) — можно `-strong`→base. Перед мержем — проверить knob на СВЕТЛОЙ обложке на moode.local. Итог рамп: ~7 общих ступеней; `--shadow-glow/-focus-ring/-error-ring` — семантические спецы, оставить.

### 5.3. Белый ползунок игнорирует тему
`VolumeSlider.svelte:168` и `FullPlayer.svelte:318` `background: #fff`→`var(--c-text-primary)`. default `#fff` байт-идентично; gruvbox → крем `#fbf1c7` под стать `.common-fill`.

### 5.4. Рамп радиусов — свернуть 5 off-scale
`TrackPlaybackIndicator.svelte:83` `1px`→`--radius-xs`(2px); `shared.css:213`+`MusicViews.css:146` `3px`→`--radius-xs`; `MainScreen.svelte:177` toast `30px`→`--radius-full`; `AlarmSettings:161` `--radius-6px`→`--radius-sm`, затем удалить `--radius-6px`(`tokens.css:126`). `PlaylistSearchResults:174` count-pill `10px`→`--radius-full`.

### 5.5. Карточки/модалки 20→16px (вкусовое, P2)
`tokens.css:119` `--radius-xl` 20→16 — спокойнее, менее «пузырчато». Трогает только обложку FullPlayer (`:77,273`). gruvbox возвращается к историческому 16px (нетто-ноль; см. комментарий `theme.ts:176-178`). Если нужен строгий default-байт-паритет — оставить 20.

### 5.6. Движение — чистка
Удалить `--ease-soft`(`tokens.css:206`), `SideMenu:101,210,277`→`--ease-emphasized`. `--dur-slow-2`(0.25s) **НЕ снапать в 0.2s** — это сглаживание прогресс-бара (`MiniPlayer:94,119`, превышает 1s-поллинг). `transition: all` (`IconButton.svelte:90`, `shared.css:152`)→явные `color/background/transform` (исключить box-shadow, чтобы focus-ring появлялся мгновенно).

### 5.7. Микро-интеракция like (P3, опционально)
`LikeButton.svelte:51` сейчас только opacity-dip. Добавить one-shot `@keyframes like-pop { 50% { transform: scale(1.2) } }` по флипу false→true, `--dur-base`+`--ease-emphasized`, обёрнуть в `@media (prefers-reduced-motion: reduce){ animation:none }`. Цвет — существующий `--c-heart`.

---

## 6. Логотип и айдентика

### 6.1. Критика текущего
Четыре марки в четырёх красных: вордмарк `wave-logo.svg` — один hand-traced `<path>` ~643 узла (7.4KB), legacy SVG 1.0 DOCTYPE, fill `#eb1250` (мёртвая краска — `SideMenu.svelte:313/320` форсят `fill:currentColor !important`); иконка `icon-base.svg` — это **W-зигзаг** `M152 144 l40 224 l64 -140 l64 140 l40 -224`, stroke `#e74c5e` 40px на навы `#1a1a2e`; `public/wave.svg` — Tabler `letter-w-small`, stroke `#000000` (невидим на тёмной вкладке); плюс `vite.svg` (0 ссылок, скаффолдинг).

### 6.2. Выбранное направление: **новый волновой знак — синусоида, осознанный редрэв**
**Поправка по ревью (P1, честность):** текущая иконка — это острый **W-зигзаг** (ломаная), а не плавная волна. Мой основной знак — **плавная синусоида в один период**, и это **сознательный редизайн силуэта**, а НЕ «эволюция W». Я выбираю синусоиду намеренно: она читается как «wave/звуковая волна» прямее, чем буква-зигзаг, масштабируется чище на мелких размерах и даёт спокойный, неугловатый тон бренда. EQ-бары отвергаю как net-new и менее самобытные. Этот редрэв решает logo-1 (один красный), logo-2 (поддерживаемость: ≤10 узлов вместо 643), logo-3 (грунт), logo-5 (видимый фавикон), logo-8 (мёртвая краска).

**Основной знак** (in-app glyph) — `currentColor`-штрих, **оптически центрирован** в 24-боксе (равные 2px-поля; ink-центр = центр бокса = 12, проверено):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Wave">
  <path d="M3 12 C 6 4, 9 4, 12 12 S 18 20, 21 12" />
</svg>
```

(черновой `M2 12 … 20 12` был смещён влево на 2px — поля 2/4px; исправлено на симметричные `M3 … 21`).

Порядок правок: сперва `wave-logo.svg:4` fill→`currentColor`, **затем** снять `!important` в `SideMenu.svelte:313/320`. Вордмарк перестроить как живой текст в `--font-sans` `--weight-semibold`(600), `color: var(--c-accent)`, `letter-spacing: -0.01em` (литерал; `--tracking-tight` это +0.2px, off-scale — не использовать). Удалить `public/vite.svg`. `public/wave.svg` (фавикон) → `stroke="#fa2d48"`.

### 6.3. Запасной вариант (tile/PWA) — ДВА ассета из-за maskable safe-zone
**Поправка по ревью (P0, feasibility).** `manifest.webmanifest:10-22` объявляет оба PNG как `purpose:"any maskable"`. Черновая иконка рисовала волну от x=64 до x=448 на 512-вьюбоксе; расстояние конца от центра + полуштрих 22 = **214px > 204.8** (safe-radius = 80%·256) → на круглых/адаптивных Android-масках кончики волны **обрезались** бы. Это была бы регрессия (текущий W сидит на x 152..392, внутри зоны). Разделяю на ДВА ассета:

**(A) Maskable PNG** (`icon-192/512`, `apple-touch-icon`) — волна вписана в центральные 80%. Концы на x=120 и x=392, амплитуда умеренная, stroke 40 → **максимальное удаление ink от центра вдоль всей кривой = 156px < 204.8** (проверено численной выборкой по безье). Грунт `#121212`, штрих `#fa2d48` (контраст 4.94:1).

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="Wave">
  <rect width="512" height="512" rx="114" fill="#121212"/>
  <path d="M120 256 C 165 150, 211 150, 256 256 S 347 362, 392 256" fill="none" stroke="#fa2d48" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

**(B) Full-bleed favicon SVG** (`public/wave.svg`, браузерная вкладка) — может быть шире, т.к. не маскируется: тот же знак, что §6.2, но `stroke="#fa2d48"`, без грунта.

Обновить `manifest.webmanifest`: либо оставить `"any maskable"` на ассете (A) (он теперь безопасен), либо корректнее — дать (A) как `purpose:"maskable"`, а отдельный full-bleed PNG как `purpose:"any"`. Грунт/фон манифеста — `#121212` (§2.1). Перегенерировать PNG из (A).

---

## 7. Что НЕ трогать (гард-рейлы)

- **gruvbox in-app accent `#d65d0e`** (`theme.ts:116`) для fill и `--c-accent-hover` обеих тем — каноничны; иконки тема-агностичны, не тащить туда `#d65d0e`. (Для primary-кнопки gruvbox §2.3 переиспользует `#fe8019` — это уже существующий `--c-accent-hover`, не новый цвет.)
- **default-токены семантики = текущим литералам** (`#ff4444`/`#2ecc71`/`#ffcc00`) → токенизация даёт **ноль** визуальных изменений в default.
- **`--circle-play-sm` 44px** (`tokens.css:240`) — touch-floor WCAG.
- **tabular-nums на sans** (`FullPlayer:324`, `TrackRow:367`, `TrackPlaybackIndicator:56`) — mono только для version/IP/codes.
- **`#000` сайдбар vs `#121212` main** — намеренный «deep-frame».
- **gruvbox playlist-палитра** (`theme.ts:181-186`) — эталон muted jewel-tones.
- **Display-шрифт не внедрять** по умолчанию.
- **`--shadow-glow / -focus-ring / -error-ring`** — семантические спецы.
- **knob-тени FullPlayer/Volume — `--shadow-sm-strong` (alpha .5)** оставить (легибилити на ярком артворке, §5.2).
- **`shared.css:21-22` дубль `--c-accent`** — оставить (= `#fa2d48`), помнить как синхро-риск.
- **`--c-error-ring` уже есть в обеих темах** (`theme.ts:45` и `:136`) — устаревший комментарий `tokens.css:163-164` «нужен новый per-theme --c-error-ring» неверен, его поправить, а не добавлять токен.

---

## 8. Чистка документации (DESIGN.md)
Legacy зелёный `#4cd964` упомянут **дважды** и оба раза указывает на **уже удалённый** `main.css`: `DESIGN.md:59` (буллет про main.css) и `DESIGN.md:619`. **Удалить/обновить ОБА** (черновик чистил только `:619`). В коде `#4cd964` отсутствует — это чисто доко-долг.

---

## 9. Дорожная карта (порядок исполнения, severity-first)
1. **P0 a11y:** primary-button label→`--c-text-inverse` (default) + gruvbox fill→`#fe8019` (§2.3). `Button.svelte:137` + gruvbox-вариант.
2. **P0 bug:** FullPlayer box-shadow голый-цвет→`--shadow-lg/-sm` (§5.1).
3. **P0 icon:** maskable-safe иконка (A) + full-bleed favicon (B), грунт `#121212`, перегенерация PNG, правка manifest purpose (§6.3).
4. **P1 a11y:** gruvbox `--c-error`→`#fe5b4a` (4.78:1), `--c-text-muted`→`#a89984` (5.30:1) (§2.2, §2.4).
5. **P1 logo:** центрированный знак `M3…21`, вордмарк→currentColor, снять `!important` (§6.2).
6. **P1 spacing:** глобальный focus-visible-ring на текущие классы `.btn-icon/.menu-row` (UI-component 3:1: `#fa2d48`/`#000` 5.53, /`#121212` 4.94, gruvbox `#d65d0e`/`#282828` 3.81 — все ≥3 ✅). Миграция raw-кнопок в примитивы и перенос ring в примитив — ПОЗЖЕ, отдельным шагом (тогда же убрать глобальный селектор и `shared.css:145-172`).
7. **P2:** токенизация теней/радиусов/градиентов; семантический триплет в код; mono-стек; типо-роли; doc-cleanup `:59/:619`.
8. **P2/M-L (не L):** проходы `--space-2_5` (36 сайтов) и `--space-2xs` (26 сайтов) — полный реестр §4.1/4.2, удаление токенов последним шагом или алиас.
9. **P2 gated:** `.list-body` нижний пад + `--space-50px` — **только после живой проверки moode.local** для всех view (§4.3).
10. **P3:** like-pop, радиус 20→16, размеры контролов.

---

> ⚠️ **Примечание к структурированной дорожной карте.** Машиночитаемый массив `roadmap` (вне этого файла) был сгенерирован арт-директором **до** прохода критика и в одном пункте содержит устаревшее значение `gruvbox --c-error #fb4934 (4.29:1)`. **Каноничным считать §2.2 этого отчёта:** `#fe5b4a (4.78:1)` — оно прошло пересчёт WCAG AA. При расхождении доверять тексту отчёта (§1–§9), а не массиву.

---

*Сгенерировано workflow `wave-art-direction-audit`: 13 агентов, ~868k токенов, 5 осей аудита, 44 верифицированных находки. Оценка критика до финализации: 7/10 («revise») → все 10 замечаний интегрированы.*
