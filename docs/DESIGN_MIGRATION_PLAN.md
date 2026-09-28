# Wave UI — План полной миграции на токены и примитивы (паритетный)

> Статус: план. Цель — вынести ВСЕ дизайнерские величины в единый статический слой токенов (`src/styles/tokens.css`) + per-theme цвета (`theme.ts`) + переиспользуемые Svelte-примитивы, СОХРАНИВ визуальный паритет (точные текущие вычисленные значения). «Нечётные» off-scale величины токенизируются КАК ЕСТЬ и помечаются кандидатами на рационализацию ПОЗЖЕ (этап Claude Design — это уже визуальное изменение, не часть паритетной миграции).
>
> Источник истины токенов — утверждённый спек (см. раздел «Канонический набор токенов» ниже). Этот документ переводит спек в пошаговый, файл-за-файлом план с батчами, рисками паритета и стратегией верификации.

---

## 0. Ключевые факты, подтверждённые сверкой с кодом

Перед планированием код был сверен напрямую. Подтверждено и уточнено:

1. **`--radius-xl` рассинхронизирован между темами** — `theme.ts:92` (default) = `20px`, `theme.ts:202` (gruvbox) = `16px`, `shared.css:106` (статический `:root`) = `20px`. Радиус — инвариантная ось, поэтому это БАГ. Унифицируем на **20px** (см. ниже).
2. **Дублирование invariant-токенов**: `--radius-*`, `--header-height`, `--mini-player-height`, `--trans-fast`, `--trans-smooth` определены ДВАЖДЫ — в `theme.ts.colors` (инжектится циклом `ui.ts:19-21` через `setProperty`) И в `shared.css :root`. `--icon-stroke-width` — только в `theme.ts.colors`. `--z-sidebar/--z-menu/--z-context-menu` — только в `theme.ts.colors` (в `shared.css :root` их НЕТ, есть лишь base/dock/modal/toast/drag-item).
3. **`ui.ts` инжектит ВЕСЬ объект `theme.colors`** циклом `Object.entries(theme.colors).forEach(... root.style.setProperty(key, value))`. Inline `style` на `:root` имеет приоритет над статическим `:root` из CSS-файла. Поэтому пока invariant-токены лежат внутри `theme.colors`, они переопределяют статический слой при каждой смене темы. После выноса их из `theme.colors` цикл перестанет их инжектить — статический `tokens.css` станет единственным источником.
4. **`src/assets/main.css` — МЁРТВЫЙ ФАЙЛ.** Уточнение к спеку: он НЕ импортируется и НЕ линкуется нигде (`grep` по `src/`, `index.html`, `vite.config.*` — пусто). Его легаси `:root` (`--bg-color`/`--text-color`/`--accent-color:#4cd964`), второй `body`/`button`-резет, `.bg-blur`/`.bg-overlay`/`.shadow` и scrollbar-правила НЕ применяются. Значит он не влияет на текущий рендер → его удаление паритет-нейтрально (а не «слияние глобальной базы», как предполагал спек). Это снижает риск.
5. **`src/app.css` — пустой (0 строк), но импортируется** в `main.ts:4` (`import './app.css'`). Мёртвый, но безвредный импорт.
6. **`SortMenu.css` подключается через `@import "../../styles/SortMenu.css"`** внутри `<style>` `LibraryView.svelte:426`, а НЕ глобально. Это значит: (а) его токены резолвятся в рантайме из `:root` (ОК), (б) при правках SortMenu.css паритет нужно проверять именно в LibraryView (sort-меню).
7. **`App.svelte`** импортирует `shared.css` (`:22`) и `MusicViews.css` (`:23`); локальный `<style>`-блок пуст. Это глобальный хост стилей. `tokens.css` нужно импортировать ПЕРВЫМ — до `shared.css`.
8. **FullPlayer shadow-баг подтверждён** (`FullPlayer.svelte:274`): `box-shadow: var(--c-shadow-popover)` — цвет-токен (`rgba(...)`) подставлен как ПОЛНОЕ значение `box-shadow` ⇒ невалидно, тень НЕ рендерится. Замена на `--shadow-md`/`--shadow-xl` = ИСПРАВЛЕНИЕ (тень появится) ⇒ визуальное изменение ⇒ НЕ часть паритетной миграции (см. раздел рисков).
9. `.btn-icon` физически определён в ДВУХ глобальных файлах (`shared.css:167` базовый + `MusicViews.css:521` вариант `.small`) — не дубль селектора, а базовый+модификатор; конфликта нет, но держать в уме при правках.

---

## 1. Канонический набор токенов (целевой `tokens.css`)

Полный набор берётся из утверждённого спека. Здесь — сводка по осям и куда что кладётся. Точные значения и `mapsToRaw` — в спеке (раздел `scales`); ниже только организация и решения, влияющие на план.

### 1.1. Новый статический слой `src/styles/tokens.css` (`:root`, themeInvariant)

Инвариантные оси (одинаковы для default и gruvbox), физически статичны:

- **spacing** `--space-*`: on-scale `0/0_5/1/2/3/4/5/6/8/10` (база 4px) + off-scale алиасы `--space-px(1)/--space-2xs(6)/--space-2_5(10)/--space-3px(3)/--space-5px(5)/--space-7px(7)/--space-14px(14)/--space-15px(15)/--space-28px(28)/--space-30px(30)/--space-50px(50)`. Отрицательные отступы — через `calc(-1 * var(--space-N))`, отдельных токенов нет. `auto` остаётся литералом (ключевое слово).
- **typography** `--text-2xs..8xl` (15 размеров 1:1), `--leading-none/tight/snug/normal`, `--tracking-tight/wide`, `--weight-regular/medium/semibold/bold/extrabold` (`bold`→700), `--font-sans` (слияние двух стеков; системный шрифт резолвится первым ⇒ инертно), `--font-mono`. Алиасы контролов: `--text-control(=--text-base)`, `--weight-control(=--weight-bold)`.
- **radius** `--radius-xs(2)/sm(4)/md(8)/lg(12)/xl(20)/full(9999)/circle(50%)/pill(=var(--radius-full))/6px`. Существующие sm/md/lg/xl/full переносятся; xl **унифицируется на 20px**.
- **border-width** `--border-width-thin(1px)/thick(2px)`.
- **z-index** ПОЛНЫЙ набор: существующие `--z-base/dock/modal/toast/drag-item/sidebar/menu/context-menu` + новые `--z-bg(-1)/above(2)/content(3)/overlay-local(10)/miniplayer(100)`. КРИТИЧНО: в статический слой добавить и sidebar/menu/context-menu (их нет в текущем `shared.css :root`).
- **transition** `--trans-fast(0.2s ease)/--trans-smooth(0.3s cubic-bezier(0.2,0.8,0.2,1))` + декомпозиция `--dur-instant(0.1s)/fast(0.2s)/base(0.3s)/slow(0.4s)/slow-2(0.25s)` и `--ease-default(ease)/emphasized(cubic-bezier(0.2,0.8,0.2,1))/sharp(cubic-bezier(0.2,0,0,1))/soft(cubic-bezier(0.25,0.46,0.45,0.94))/linear`.
- **control-size** `--control-h-sm(32)/md(36)/lg(40)/xl(48)/2xl(50)`, `--control-pad-x-sm(16)/md(20)`, `--icon-btn-pad(8)/-lg(10)/-sm(6)`, `--switch-w(44)/h(24)/knob(20)`, `--circle-btn-sm(28)/md(32)`, `--circle-play-sm(44)/md(48)/lg(64)`.
- **icon-size** `--icon-size-xs(16)/sm(18)/md(20)/lg(24)/xl(28)`.
- **opacity** `--opacity-hidden(0)/ghost(0.3)/faint(0.5)/muted(0.6)/dim(0.7)/strong(0.8)/visible(1)`.
- **layout** `--header-height(64)/--mini-player-height(90)/--icon-stroke-width(1.5px)` — вынести из `theme.colors`.
- **breakpoint** `--bp-sm(600)/md(768)/lg(800)` — **DOC-ONLY** (CSS var нельзя в `@media`-feature). Зеркало в `constants.ts`.

### 1.2. Композитные токены, тоже в `tokens.css`, но ССЫЛАЮТСЯ на per-theme цвет (themeInvariant=false по цвету, инвариантны по геометрии)

`var()` резолвится в рантайме под активную тему, поэтому физически они в `tokens.css`, а цвета остаются в `theme.ts`:

- **border-composite**: `--border-default(=var(--border-width-thin) solid var(--c-border))`, `--border-default-dim(... var(--c-border-dim))`, `--border-dashed(=var(--border-width-thick) dashed var(--c-border-dashed))`.
- **shadow**: `--shadow-xs/sm/md/md-popover/lg/xl/xl-header/2xl/glow/focus-ring/error-ring` + `-strong`-варианты на `--c-black-50/70` где нужен строгий паритет (точные значения и -strong в спеке).

### 1.3. Остаётся в `theme.ts.colors` (per-theme, чисто цвет)

Все `--c-*` (атомарные прозрачности, акценты, текст, фоны, surface, border-цвет, overlay/shadow-цвет, icon-цвет, палитра плейлистов) + **НОВЫЙ `--c-error-ring`** (default `rgba(255,68,68,0.3)`; gruvbox — производное от `--c-error`) для `--shadow-error-ring`.

Из `theme.ts.colors` **ВЫНОСИМ** (в tokens.css): `--radius-*`, `--z-*`, `--trans-*`, `--header-height`, `--mini-player-height`, `--icon-stroke-width`. После этого цикл `ui.ts` инжектит ТОЛЬКО цвета.

---

## 2. Svelte-примитивы (создаются в Батче 0)

Цель — устранить bespoke-классы и дубли. Каждый примитив строится ТОЧНО на текущих значениях соответствующего класса (паритет), параметризуется через пропсы/варианты. Примитивы — обёртки, существующие глобальные классы (`.btn-primary` и т.п.) ОСТАЮТСЯ рабочими на время миграции (примитив их использует или воспроизводит 1:1), чтобы не ломать ещё не мигрированные вызовы.

| Примитив | Заменяет (bespoke/дубли) | Базовые значения (паритет) | Варианты/пропсы |
|---|---|---|---|
| `Button.svelte` | `.btn-primary`, `.btn-secondary` (MusicViews) | h `--control-h-lg(40)`, radius `--radius-pill`, pad `0 --control-pad-x-md`, `--text-control`, `--weight-control`, transition `transform --dur-instant, background --dur-fast, opacity --dur-fast` | `variant: primary\|secondary`, `size: md\|sm(--control-h-md 36, pad 0 --space-4, --text-sm 12 в мобиле)`, `disabled` |
| `IconButton.svelte` | `.btn-icon` (shared), `.btn-icon.small` (MusicViews), `.btn-action`, `.vol-btn`, `.side-btn`, `.tiny-dots` | radius `--radius-circle`, pad `--icon-btn-pad(8)`, glyph `--icon-size-lg(24)`, transition `all --trans-fast` | `size: sm(circle --circle-btn-md 32, glyph --icon-size-sm 18)\|md\|lg`, `padVariant: lg(10)/sm(6)`, `bordered`(=.btn-action: `--border-default`, w `--control-h-lg`, glyph `--icon-size-sm`), `active` |
| `PlayButton.svelte` | `.play-btn` (MiniPlayer 48), `.play-btn-large` (FullPlayer 64/docked 44) | circle, accent bg, glyph; `--circle-play-md(48)` / `--circle-play-lg(64)` / `--circle-play-sm(44)` | `size: mini(48)\|full(64)\|docked(44)`, glyph `--icon-size-lg(24)`/`--icon-size-xl(28)` |
| `Toggle.svelte` (Switch) | `.toggle-btn`+`.toggle-circle` (DUP в AlarmSettings + ServicesSettings) | track `--switch-w(44)×--switch-h(24)`, knob `--switch-knob(20)`, inset `--space-px`, travel `translateX(20px)` | `checked`, `disabled` |
| `SearchInput.svelte` | `.search-input-container` (MusicViews) + локальные `search-input` (PlaylistsView/RadioView/YandexSearchBar) | h `--control-h-xl(48)`, radius `--radius-lg`, pad `0 --space-4`, input `--text-lg(16)`, icon `--icon-size-md(20)`, margin-bottom `--space-6` | `placeholder`, `value(bind)`, слот для clear |
| `ClearButton.svelte` | `.clear-icon-btn` (DUP PlaylistsView + SearchView), `.clear-btn` (YandexSearchBar) | glyph `--icon-size-xs(16)`, circle/naked по текущему | вариант под каждый исходный размер (паритет на старте) |
| `CardMenuButton.svelte` | `.card-menu-btn` (PlaylistGrid), `.context-menu-btn` (TrackRow) | circle `--circle-btn-sm(28)`, triple-dot glyph `--icon-size-xs(16)` | `variant: card\|row` (на старте — паритет каждого) |

Примечание: примитивы вводятся в Батче 0, но ПОДКЛЮЧАЮТСЯ к компонентам в соответствующих листовых батчах (1–4). В Батче 0 проверяем только их изолированный рендер.

---

## 3. Стратегия миграции и инварианты

1. **Паритет-аксиома.** Любая замена `raw → var(--token)` допустима ТОЛЬКО если вычисленное значение токена байт-в-байт совпадает с текущим в ОБЕИХ темах. Цвета не трогаем (отдельный colors-агент). Для значений с per-theme расхождением (см. риски) — отдельные `-strong`/`-header` варианты или оставить литерал.
2. **Off-scale = как есть.** 3/5/6/7/10/14/15/30/50px и т.п. получают свой токен с ТЕКУЩИМ значением; рационализация — позже.
3. **Порядок импорта.** В `App.svelte`: `tokens.css` → `shared.css` → `MusicViews.css`. `theme.ts` инжектит цвета ПОВЕРХ (inline на `:root`) после.
4. **Отрицательные значения** — `calc(-1 * var(--space-N))`, без отдельных токенов.
5. **`!important`** — сохраняется как `var(--token) !important`.
6. **`@media`** — литералы остаются (CSS var нельзя в feature-query); единый источник — `BREAKPOINTS` в `constants.ts`.
7. **JS-переходы Svelte** (`fade/fly/scale duration:100/150/200/300`) не читают CSS var — зеркалить как `MOTION = { instant:100, fast:200, base:300 }` в `constants.ts`.
8. **Фундамент → листья.** Сначала Батч 0 (источник истины + общие классы + примитивы), затем листья. Внутри батча файлы НЕ пересекаются по правкам (разные файлы) ⇒ можно параллелить.
9. **Один батч = один коммит** (или один коммит на под-волну), чтобы `git diff` был обозримым для паритетной сверки.

---

## 4. Батчи

### BATCH 0 — ФУНДАМЕНТ (строго первым, в одиночку, НЕ параллелить)

Источник истины токенов + общие классы + создание примитивов. Пока тут хардкод — миграция листьев бессмысленна.

**0.1. Создать `src/styles/tokens.css`** — все инвариантные оси из раздела 1.1 + композитные из 1.2. `--radius-xl: 20px`. Полный набор `--z-*` (включая sidebar/menu/context-menu).

**0.2. `src/lib/theme.ts`** — УДАЛИТЬ из обоих объектов `colors`: `--radius-sm/md/lg/xl/full`, `--z-base/dock/modal/toast/drag-item/sidebar/menu/context-menu`, `--trans-fast/--trans-smooth`, `--header-height`, `--mini-player-height`, `--icon-stroke-width`. ДОБАВИТЬ в обе темы `--c-error-ring` (default `rgba(255,68,68,0.3)`; gruvbox — производное от `--c-error`, согласовать с colors-агентом). Остаются только `--c-*`. Проверить, что `ui.ts` цикл не сломается (он итерирует `theme.colors` — просто станет меньше ключей).

**0.3. `src/App.svelte`** — добавить `import "../styles/tokens.css"` (или `./styles/tokens.css`) ПЕРВЫМ, до `shared.css` (`:22`) и `MusicViews.css` (`:23`).

**0.4. `src/styles/shared.css`** (305) — миграция raw → token + удаление продублированного `:root`:
- УДАЛИТЬ из `:root` (строки ~3-123) ВСЕ invariant-токены, теперь живущие в tokens.css: `--radius-*`(103-107), `--header-height`/`--mini-player-height`(100-101), `--z-*`(112-116), `--trans-*`(121-122), `--icon-stroke-width`(95). Цвета `--c-*` — ПОКА оставить (их вынос/синхронизация — задача colors-агента; здесь не трогаем, чтобы не пересекаться). [Если colors-агент уже вынес — `:root` shared.css схлопывается.]
- `body` (128-135): `margin:0`→`var(--space-0)`; `font-family`→`var(--font-sans)`.
- `button` (137-145): `padding:0`→`var(--space-0)`; `font-family: inherit` — ОСТАВИТЬ литералом (поведенческое).
- `.btn-icon` (167-194): `padding:8px`→`var(--icon-btn-pad)`; `border-radius:50%`→`var(--radius-circle)`; `transition: all var(--trans-fast)` (уже токен) — оставить; `.btn-icon:active transform:scale(0.95)` — оставить; svg `width/height:24px`→`var(--icon-size-lg)`.
- `input[type=range]` (197-220): `height:4px`→`var(--space-1)`; `border-radius:2px`→`var(--radius-xs)`; thumb `12px`→оставить (не на шкале spacing — это размер ползунка; токенизировать как литерал или ввести при необходимости; ПАРИТЕТ: оставить `12px`); thumb `border-radius:50%`→`var(--radius-circle)`; `box-shadow:0 1px 3px var(--c-black-50)`→`var(--shadow-xs-strong)`; `transition: transform 0.1s`→`transform var(--dur-instant)`.
- `.scroll-y` scrollbar (229-236): `width:6px`→`var(--space-2xs)`; `border-radius:3px`→`var(--radius-xs)` (off-scale 3→2: ПАРИТЕТ-РИСК на 1px скругления scrollbar-thumb; если нужен строгий байт-паритет — оставить `3px` литералом и пометить кандидатом). **Решение: оставить `3px` литералом для строгого паритета** (помечено как кандидат).
- `.header-actions` (247-251): `gap:12px`→`var(--space-3)`.
- `.meta-badges` (253-257): `gap:8px`→`var(--space-2)`; `margin:0px 0 6px`→`var(--space-0) 0 var(--space-2xs)`.
- `.meta-tag` (259-273): `font-size:11px`→`var(--text-xs)`; `font-weight:600`→`var(--weight-semibold)`; `border:1px solid transparent`→`var(--border-width-thin) solid transparent`; `padding:3px 6px`→`var(--space-3px) var(--space-2xs)`; `height:18px`→оставить (размер контрола, литерал/`--icon-size-sm`? — ПАРИТЕТ: оставить `18px` литералом); `border-radius: var(--radius-sm)` (уже токен); `letter-spacing:0.2px`→`var(--tracking-tight)`; `line-height:1`→`var(--leading-none)`. `.meta-tag.quality opacity:0.9`→`var(--opacity-strong)` (0.9→0.8: ПАРИТЕТ-РИСК! `--opacity-strong`=0.8≠0.9). **Решение: оставить `0.9` литералом** (off-scale кандидат).
- `@media(max-width:768px)` (283-305): литерал media остаётся; внутри `.header-actions gap:8px`→`var(--space-2)`; `.btn-primary/.btn-secondary padding:8px 16px`→`var(--space-2) var(--space-4)`, `font-size:12px`→`var(--text-sm)`; `.btn-action width:32px`→`var(--control-h-sm)`; svg `16px`→`var(--icon-size-xs)`.

**0.5. `src/components/views/MusicViews.css`** (701) — самый крупный общий файл. Миграция по секциям (точные строки выше в Read):
- Контейнеры: `.content-padded padding:16px`→`var(--space-4)`; `.no-bottom-pad padding-bottom:0`→`var(--space-0)`.
- Grid/cards: `.music-grid gap:20px`→`var(--space-5)`, `padding-bottom:20px`→`var(--space-5)`; `.horizontal padding-bottom:4px`→`var(--space-1)`; `.horizontal .music-card margin-right:16px`→`var(--space-4)`, `width:180px` оставить (размер карточки — литерал); `.music-card padding:12px`→`var(--space-3)`, `border-radius: var(--radius-lg)`(уже), `transition: background 0.2s, transform 0.2s`→`background var(--dur-fast), transform var(--dur-fast)`, `margin:-10px`→`calc(-1 * var(--space-2_5))`; `.is-active .card-img-container box-shadow:0 0 0 3px var(--c-accent)`→`var(--shadow-focus-ring)`; `.card-img-container border-radius: var(--radius-md)`(уже), `margin-bottom:12px`→`var(--space-3)`, `box-shadow:0 8px 24px var(--c-shadow-card)`→`var(--shadow-lg)`; `.card-title font-weight:600`→`var(--weight-semibold)`, `font-size:15px`→`var(--text-md)`, `margin-bottom:4px`→`var(--space-1)`; `.card-sub-row gap:6px`→`var(--space-2xs)`, `font-size:13px`→`var(--text-base-sm)`; `.card-badge font-size:10px`→`var(--text-2xs)`, `font-weight:600`→`var(--weight-semibold)`, `background: rgba(255,255,255,0.1)`→`var(--c-bg-placeholder)`? **НЕТ — это цвет, отдать colors-агенту** (оставить); `padding:2px 5px`→`var(--space-0_5) var(--space-5px)`, `border-radius:3px`→`var(--radius-xs)` (ПАРИТЕТ-РИСК 3→2: **оставить `3px`**), `line-height:1`→`var(--leading-none)`; `.card-badge.quality border:1px solid var(--c-border)`→`var(--border-default)`.
- play-overlay: `inset:0`→`var(--space-0)`; `opacity:0`→`var(--opacity-hidden)`; `transition: opacity 0.2s`→`opacity var(--dur-fast)`; `.overlay-icon width:48px`→оставить (icon размер вне icon-size шкалы — литерал или `--circle-play-md`? ПАРИТЕТ: оставить `48px`), `filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5))` — цвет в filter, оставить; `.icon-fallback font-size:40px`→`var(--text-6xl)`; `.dashed-cover border:2px dashed var(--c-border-dashed)`→`var(--border-dashed)`; `.playlist-icon-bg opacity:0.3`→`var(--opacity-ghost)`; `.new-playlist-icon/.playlist-icon-bg width/height:40px/60px`→оставить (размеры иконок-плейсхолдеров — литералы); `stroke-width:1.5`→`var(--icon-stroke-width)`? (1.5 vs 1.5px — ПАРИТЕТ ОК, но `stroke-width` принимает unitless; токен=`1.5px`. **Оставить `1.5` литералом** во избежание единиц).
- `@media(768)` grid `gap:16px`→`var(--space-4)`.
- Headers: `.view-header gap:24px`→`var(--space-6)`, `margin-bottom:24px`→`var(--space-6)`; `.header-art border-radius: var(--radius-lg)`(уже), `box-shadow:0 10px 40px var(--c-shadow-header)`→`var(--shadow-xl-header)` (КРИТИЧНО — НЕ `--shadow-xl`, цвет theme-divergent), `width:200px` оставить; `.header-info padding-top:4px`→`var(--space-1)`; `.header-label font-size:14px`→`var(--text-base)`, `font-weight:600`→`var(--weight-semibold)`, `margin-bottom:6px`→`var(--space-2xs)`; `.header-title font-size:40px`→`var(--text-6xl)`, `font-weight:800`→`var(--weight-extrabold)`, `margin:0 0 8px 0`→`var(--space-0) var(--space-0) var(--space-2) var(--space-0)`, `line-height:1.1`→`var(--leading-tight)`; `.header-subtitle-row gap:10px`→`var(--space-2_5)`, `margin-bottom:8px`→`var(--space-2)`; `.header-sub-text font-size:20px`→`var(--text-2xl)`, `color: rgba(255,255,255,0.7)` — цвет, оставить, `font-weight:500`→`var(--weight-medium)`; `.header-actions gap:12px`→`var(--space-3)`, `margin-top:16px`→`var(--space-4)`; `.track-count margin-top:12px`→`var(--space-3)`, `font-size:14px`→`var(--text-base)`, `font-weight:500`→`var(--weight-medium)`; `.view-header-simple padding:16px 20px`→`var(--space-4) var(--space-5)`, `min-height:80px` оставить; `.view-header-simple .header-info margin-right:16px`→`var(--space-4)`; `.view-header-simple .header-title font-size:24px`→`var(--text-3xl)`, `font-weight:800`→`var(--weight-extrabold)`, `line-height:1.2`→`var(--leading-snug)`; `.header-subtitle font-size:14px`→`var(--text-base)`, `font-weight:500`→`var(--weight-medium)`, `margin-top:4px`→`var(--space-1)`; `.view-header-simple .header-actions gap:12px`→`var(--space-3)`, `margin-top:0`→`var(--space-0)`.
- `@media(800)` (off-scale bp): литерал остаётся; `gap:20px`→`var(--space-5)`; `.header-art width:180px` оставить; `.header-title font-size:28px`→`var(--text-4xl)`.
- `@media(600)`: литерал; `padding:12px 16px !important`→`var(--space-3) var(--space-4) !important`; `min-height:60px !important` оставить; `margin-right:10px !important`→`var(--space-2_5) !important`; `font-size:18px !important`→`var(--text-xl) !important`; `font-size:13px !important`→`var(--text-base-sm) !important`; `.header-actions gap:8px !important`→`var(--space-2) !important`, `margin:0 !important`→`var(--space-0) !important`; `.btn-action width/height:36px !important`→`var(--control-h-md) !important`.
- Special buttons: `.btn-primary/.btn-secondary/.btn-action height:40px`→`var(--control-h-lg)`, `border-radius:20px`→`var(--radius-pill)` (см. риск pill-drift), `font-weight:700`→`var(--weight-control)`, `font-size:14px`→`var(--text-control)`, `padding:0 20px`→`var(--space-0) var(--control-pad-x-md)`, `transition: transform 0.1s, background 0.2s, opacity 0.2s`→`transform var(--dur-instant), background var(--dur-fast), opacity var(--dur-fast)`; `:active transform:scale(0.97)` оставить; `.btn-primary letter-spacing:0.5px`→`var(--tracking-wide)`, `:disabled opacity:0.6`→`var(--opacity-muted)`; `.btn-action border:1px solid var(--c-border)`→`var(--border-default)`, `padding:0`→`var(--space-0)`, `width:40px`→`var(--control-h-lg)`; `.btn-action svg width/height:18px !important`→`var(--icon-size-sm) !important`, `stroke-width:1.5` оставить.
- `.btn-icon.small width/height:32px`→`var(--circle-btn-md)`, `padding:0`→`var(--space-0)`, `border-radius:50%`→`var(--radius-circle)`, `transition: background 0.2s, color 0.2s`→`background var(--dur-fast), color var(--dur-fast)`; svg `18px !important`→`var(--icon-size-sm) !important` (две группы: `.btn-icon.small svg` и `.group-actions .btn-icon.small svg`).
- Search input: `.search-input-container border:1px solid var(--c-border-dim)`→`var(--border-default-dim)`, `border-radius: var(--radius-lg)`(уже), `height/min-height:48px`→`var(--control-h-xl)`, `padding:0 16px`→`var(--space-0) var(--space-4)` (или `--control-pad-x-sm`), `margin-bottom:24px`→`var(--space-6)`, `transition` уже на `--trans-fast`; `input font-size:16px`→`var(--text-lg)`, `padding:0`→`var(--space-0)`, `margin:0`→`var(--space-0)`, `font-family: inherit` оставить; `.search-icon width/height:20px`→`var(--icon-size-md)`, `margin-right:12px`→`var(--space-3)`; svg `stroke-width: var(--icon-stroke-width)`(уже).
- Drag&drop: `.floating-item z-index: var(--z-drag-item)`(уже), `border-radius: var(--radius-md)`(уже), `box-shadow:0 20px 50px var(--c-shadow-phantom)`→`var(--shadow-2xl)`, `opacity:0.95`→**оставить** (off-scale, кандидат), `transform:scale(1.02)` оставить; `.dropping transition: top 0.2s cubic-bezier(0.2,0,0,1), left 0.2s ...`→`top var(--dur-fast) var(--ease-sharp), left var(--dur-fast) var(--ease-sharp) !important`; `.row-wrapper transition: transform 0.2s cubic-bezier(0.2,0,0,1)`→`transform var(--dur-fast) var(--ease-sharp)`, `z-index:1`→`var(--z-base)`; `.ghost-placeholder opacity:0`→`var(--opacity-hidden)`; `.just-dropped animation: landDown 0.3s cubic-bezier(0.2,0.8,0.2,1)`→`landDown var(--dur-base) var(--ease-emphasized)`, `z-index:2`→`var(--z-above)`, `border-radius: var(--radius-md)`(уже); `.list-body padding-bottom:50px`→`var(--space-50px)`; `@keyframes landDown box-shadow:0 10px 30px var(--c-shadow-card)`→`var(--shadow-lg)` (ПАРИТЕТ: `--shadow-lg`=`0 8px 24px`≠`0 10px 30px`! **Решение: оставить `0 10px 30px var(--c-shadow-card)` литералом** — off-scale near-dup кандидат).
- Empty states: `.empty-state-container height:300px` оставить, `opacity:0.6`→`var(--opacity-muted)`; `.empty-state-icon font-size:48px`→`var(--text-7xl)`, `margin-bottom:12px`→`var(--space-3)`.

**0.6. `src/styles/SortMenu.css`** (95):
- `.sort-wrapper margin-left:8px`→`var(--space-2)`; `.sort-trigger gap:6px`→`var(--space-2xs)`, `padding:0 8px`→`var(--space-0) var(--space-2)`, `font-size:13px`→`var(--text-base-sm)`, `font-weight:600`→`var(--weight-semibold)`, `transition: color 0.2s`→`color var(--dur-fast)`; `.sort-trigger-icon opacity:0.7`→`var(--opacity-dim)`, svg `16px`→`var(--icon-size-xs)`; `.sort-backdrop inset:0`→`var(--space-0)`, `z-index: var(--z-menu)`(уже); `.sort-menu margin-top:8px`→`var(--space-2)`, `min-width:160px` оставить, `border:1px solid var(--c-border)`→`var(--border-default)`, `border-radius:12px`→`var(--radius-lg)`, `box-shadow:0 10px 40px rgba(0,0,0,0.7)`→`var(--shadow-xl)` (raw rgba → `--c-black-70` через токен; ПАРИТЕТ-РИСК: `--c-black-70` в gruvbox=`rgba(40,40,40,0.7)`≠`rgba(0,0,0,0.7)` ⇒ изменит gruvbox-тень sort-меню. **Проверить в обеих темах; если gruvbox-различие неприемлемо — оставить literal или ввести вариант**), `padding:6px 0`→`var(--space-2xs) var(--space-0)`, `z-index: calc(var(--z-menu)+1)`(уже); `.sort-item padding:12px 14px`→`var(--space-3) var(--space-14px)`, `font-size:14px`→`var(--text-base)`, `transition: background 0.1s, color 0.1s`→`background var(--dur-instant), color var(--dur-instant)`; `.sort-item.selected font-weight:500`→`var(--weight-medium)`, `background: rgba(255,255,255,0.05)` — цвет (off-palette), **оставить/отдать colors-агенту**.

**0.7. Очистка мёртвого кода:**
- Удалить импорт `import './app.css'` из `main.ts:4` И удалить файл `src/app.css` (пуст, безвреден, но мёртв).
- Удалить файл `src/assets/main.css` — он НЕ импортируется нигде (подтверждено), значит удаление паритет-нейтрально. (Если есть сомнение — сначала `grep` ещё раз перед удалением; план уже подтвердил отсутствие ссылок.)

**0.8. Создать примитивы** (раздел 2) — `Button.svelte`, `IconButton.svelte`, `PlayButton.svelte`, `Toggle.svelte`, `SearchInput.svelte`, `ClearButton.svelte`, `CardMenuButton.svelte` в `src/components/primitives/`. На этом шаге только определения + изолированный smoke (не подключать к листьям).

**0.9. `src/lib/constants.ts`** — добавить `BREAKPOINTS = { sm:600, md:768, lg:800 }` и `MOTION = { instant:100, fast:200, base:300 }` (зеркало для matchMedia и JS-переходов). Перевести существующие `matchMedia`/Svelte-`transition`-вызовы на них в соответствующих листовых батчах.

**Верификация Батча 0:** `npm run check` (типы), `npm run test:run`, `npm run build`. Затем `git diff` по каждому изменённому файлу — глазами сверить, что каждое значение токена == старому raw (учитывая gruvbox!). Визуальный смоук на `moode.local` в ОБЕИХ темах: общий вид списков/карточек/кнопок/sort-меню/поиска. Особое внимание: `--radius-xl` (gruvbox карточки/модалки станут 16→20 — ОЖИДАЕМО), тени header/sort-меню в gruvbox.

---

### BATCH 1 — АТОМАРНЫЕ КОМПОНЕНТЫ (low, параллельно, файлы не пересекаются)

`ImageLoader.svelte`, `Skeleton.svelte`, `TrackThumb.svelte`, `LikeButton.svelte`, `PlayModeButton.svelte`, `TrackPlaybackIndicator.svelte`, `SettingsView.svelte`, `views/YandexSearchResults.svelte`, `views/yandex/YandexNotConnected.svelte`, `views/YandexView.svelte`.

Маленькие style-блоки. Зависят только от мигрированного фундамента.

Типовые правки на файл:
- `ImageLoader.svelte` (26): радиусы/transition/opacity placeholder → токены. Без кнопок.
- `Skeleton.svelte` (17): `radius` проп default `"4px"`→`var(--radius-sm)`; shimmer `transition/animation`→`--dur-*`/`--ease-linear`; `opacity`→`--opacity-ghost`.
- `TrackThumb.svelte` (14): radius/размеры → токены (размеры обложки — литералы по паритету).
- `LikeButton.svelte` (13): использует `.btn-icon`(shared); локальный `.like-btn` → `IconButton` (Батч 0) с `padVariant: lg(10)/sm(6)`; heart-цвет — отдать colors-агенту. ПАРИТЕТ: padding 10/6.
- `PlayModeButton.svelte` (29): `.btn-icon`+`.mode-btn` → `IconButton`; padding 10/6, glyph 24/20.
- `TrackPlaybackIndicator.svelte` (53): `border-radius:1px`→`var(--radius-xs)` (1→2 ПАРИТЕТ-РИСК на 1px бар-эквалайзера; **оставить `1px` литералом** если строгий байт-паритет, помечено кандидатом); анимации→`--dur-*`/`--ease-linear`; высоты баров — литералы.
- `SettingsView.svelte` (7): `content-padded`/`view-container`(MV) — уже мигрированы; локального почти нет.
- `YandexSearchResults.svelte` (6), `YandexNotConnected.svelte` (11), `YandexView.svelte` (28): на общих классах; локальный spacing → `--space-*` (YandexNotConnected: `margin-top:50px`→`var(--space-50px)`).

**Верификация:** `check` + `test:run` + per-file `git diff`. Смоук: загрузка обложек, скелетоны, like/mode-кнопки в плеере, индикатор воспроизведения, Yandex-вьюхи.

---

### BATCH 2 — ПЛЕЕР И СРЕДНИЕ КОМПОНЕНТЫ (med, параллельно, разные файлы)

`MiniPlayer.svelte`, `FullPlayer.svelte`, `VolumeSlider.svelte`, `Modal.svelte`, `ContextMenu.svelte`, `TrackRow.svelte`, `MainScreen.svelte`.

- **MiniPlayer.svelte** (104): `.play-btn`(48) → `PlayButton size="mini"`; `box-shadow:0 4px 12px var(--c-shadow-card)`→`var(--shadow-md)`; `box-shadow:0 1px 3px var(--c-black-50)`→`var(--shadow-xs-strong)`; `box-shadow:0 2px 5px var(--c-shadow-card)`→ПАРИТЕТ-РИСК (`--shadow-sm`=`0 2px 4px`≠`0 2px 5px`) **оставить литералом** (near-dup кандидат); z-index 101/105/110 → `--z-miniplayer` + `calc` или **оставить литералами** (off-scale, помечено); `.btn-icon`(shared) → `IconButton`; spacing→`--space-*`.
- **FullPlayer.svelte** (155): `.play-btn-large`(64/docked 44) → `PlayButton size="full"`/`"docked"`; `.side-btn` → `IconButton` (padding 10/6, glyph 24/20); `border-radius:8px`(`:279`)→`var(--radius-md)`; `box-shadow:0 2px 4px var(--c-black-50)`(`:319`)→`var(--shadow-xs-strong)`? (ПАРИТЕТ: `--shadow-xs-strong`=`0 1px 3px`≠`0 2px 4px` ⇒ это `--shadow-sm-strong`. **Использовать `--shadow-sm-strong`** `0 2px 4px var(--c-black-50)`); `transition: transform 0.1s`→`transform var(--dur-instant)`; `.side-btn:active opacity:0.7`→`var(--opacity-dim)`. **shadow-БАГ (НЕ паритет):** `:274 box-shadow: var(--c-shadow-popover)` и `:342 box-shadow: var(--c-shadow-card)` — цвет-токен как полное значение ⇒ тень не рендерится. Замена на `--shadow-md`/`--shadow-md-popover`/`--shadow-xl` = ИСПРАВЛЕНИЕ (визуальное изменение). **НЕ делать в паритетной миграции — согласовать с владельцем отдельно; пока оставить как есть (баг сохраняется) ИЛИ заменить на невалидный-эквивалент чтобы паритет = «тень всё ещё не видна».** Рекомендация: оставить строки `:274/:342` НЕ тронутыми в этом батче, завести отдельную задачу «fix FullPlayer shadow».
- **VolumeSlider.svelte** (90): локальный `.vol-btn` → `IconButton`; thumb-центрирование `--space-7px`/`--space-px` (parity-critical: `padding:7px 16px`, `margin-top:calc(-1*var(--space-7px))`, `top/left:1px`→`var(--space-px)`, `margin:0 1px`→`var(--space-0) var(--space-px)`); rail radius→`--radius-xs`; thumb `border-radius:50%`→`--radius-circle`.
- **Modal.svelte** (161): локальный `.btn` → `Button` (или оставить как есть, привести значения к токенам: `--text-control`, h, radius); `.modal-header height:50px`→`var(--control-h-2xl)`; `line-height:1.5`→`var(--leading-normal)`; `box-shadow` error-ring `0 0 0 1px rgba(255,68,68,0.3)`→`var(--shadow-error-ring)` (требует `--c-error-ring` из Батча 0); backdrop z `var(--z-modal)`(уже); spacing/radius→токены.
- **ContextMenu.svelte** (144): `.menu-header height:50px`→`var(--control-h-2xl)`; `.back-btn-area height:48px`→`var(--control-h-xl)`; `.icon` svg `20px`→`--icon-size-md`; row padding `12px 14px`-подобные→`--space-3`/`--space-14px`; z `var(--z-context-menu)`(уже); `scroll-y`/`text-ellipsis`(shared) уже.
- **TrackRow.svelte** (144): `.context-menu-btn` → `CardMenuButton variant="row"`; `.btn-icon`(shared)→`IconButton`; `font-size:13px`→`--text-base-sm`, `font-weight:500`→`--weight-medium`, `line-height:1.2`→`--leading-snug`; small svg `16px`→`--icon-size-xs`; `meta-tag`(shared) уже.
- **MainScreen.svelte** (191): `.hamburger-btn`/`.back-btn` → `IconButton`; off-scale spacing `15px`(`gap/padding-top/right`)→`--space-15px`, `50px`(padding-bottom)→`--space-50px`; popover `box-shadow:0 4px 15px var(--c-shadow-popover)`→`var(--shadow-md-popover)`; z-index фон-слои (`-1`/`-2`/`0`)→`--z-bg`/`calc`/`--z-base`-родственные (паритет: числа сохранить); glyph 24→`--icon-size-lg`.

**Верификация:** `check`+`test:run`+per-file diff. Смоук: мини/полный плеер (play/prev/next, переход dock↔full), громкость (thumb на месте!), модалки (в т.ч. error-ring), контекстное меню, строки треков, гамбургер/назад/фон-блюр. Обе темы.

---

### BATCH 3 — VIEWS НА ОБЩИХ КЛАССАХ (med, параллельно, разные файлы)

`views/BaseList.svelte`, `views/LibraryView.svelte`, `views/PlaylistGrid.svelte`, `views/PlaylistSearchResults.svelte`, `views/RadioView.svelte`, `views/SearchView.svelte`, `views/YandexContentHeader.svelte`, `views/YandexDashboard.svelte`.

Опираются на `music-card`/`music-grid`/`play-overlay`/`view-*` (Батч 0). Локального немного.

- **BaseList.svelte** (48): `content-padded`/`list-body`/`row-wrapper`(MV) уже; локальные `transition`/`ease`→`--dur-*`/`--ease-sharp`.
- **LibraryView.svelte** (56): использует `btn-primary/secondary`(MV)→ можно `Button`; `@import SortMenu.css`(`:426`) — уже мигрирован в Батче 0; `meta-*`(shared) уже; локальный spacing→`--space-*`.
- **PlaylistGrid.svelte** (69): `.card-menu-btn` → `CardMenuButton variant="card"`(28px); dropzone `border:2px dashed var(--c-border)`→ выбрать `--border-dashed` (использует `--c-border`, MusicViews использует `--c-border-dashed` — спек: брать `--c-border-dashed`; ПАРИТЕТ-РИСК: сменит цвет рамки PlaylistGrid с border на border-dashed ⇒ **проверить в обеих темах; если разный — оставить локальный вариант**); `music-card`(MV) уже.
- **PlaylistSearchResults.svelte** (92): `.btn-icon`(shared)→`IconButton`; card-классы(MV) уже; локальный spacing/typography→токены.
- **RadioView.svelte** (69): локальный `search-input` → `SearchInput` (Батч 0); active `box-shadow:0 0 10px var(--c-shadow-glow-accent)`→`var(--shadow-glow)`; RadioView badge `font-weight:800`→`--weight-extrabold`; card-классы(MV) уже.
- **SearchView.svelte** (66): `.clear-icon-btn`(DUP) → `ClearButton`; локальный search → `SearchInput`; card/meta(MV/shared) уже.
- **YandexContentHeader.svelte** (34): `btn-primary/secondary`(MV)→`Button`; header/card(MV) уже.
- **YandexDashboard.svelte** (41): card-классы(MV) уже; локальный spacing/typography→токены.

**Верификация:** `check`+`test:run`+per-file diff. Смоук: библиотека (+sort-меню), сетки плейлистов (+three-dot, dropzone), поиск плейлистов/глобальный (+clear), радио (+поиск, +active glow), Yandex dashboard/header. Обе темы.

---

### BATCH 4 — КРУПНЫЕ VIEWS И SETTINGS (high, часть последовательно)

**Волна 4a (крупные, последовательно — большие блоки):**
- **SideMenu.svelte** (299, самый большой): `.collapse-btn height:40px`→`--control-h-lg`; `.side-btn`→`IconButton`; `.nav-item height:48px`→`--control-h-xl`; drawer width/transform `transition 0.4s/0.5s cubic-bezier(0.25,0.46,0.45,0.94)`→`--dur-slow`+`--ease-soft`; z `var(--z-sidebar)`(теперь в tokens.css — проверить наличие!); off-scale `28px`(`top:-28px` fold handle)→`calc(-1*var(--space-28px))`; spacing/typography/radius/opacity → токены массово.
- **PlaylistsView.svelte** (104): локальный `search-input`+`.clear-icon-btn`(DUP) → `SearchInput`+`ClearButton`; `btn-action`/`btn-primary`/`btn-secondary`(MV)→`Button`/`IconButton`; `.group-actions .btn-icon.small`(MV) уже; spacing→токены.
- **QueueView.svelte** (36): `btn-action`/`btn-primary/secondary`(MV)→`Button`; header/content(MV) уже; локальный spacing→токены.

**Волна 4b (settings, пары — синхронно из-за общих примитивов):**
- **AlarmSettings.svelte** (139) + **ServicesSettings.svelte** (155) — мигрировать СОВМЕСТНО: оба содержат DUP `.toggle-btn`+`.toggle-circle` → заменить на `Toggle` (Батч 0), устранив дубль. ServicesSettings: `box-shadow ... rgba(0,0,0,0.3)` (raw) → `--shadow-xs`/`--c-shadow-card` (ПАРИТЕТ-РИСК: raw rgba не адаптируется под gruvbox; токен сменит gruvbox-тень — **проверить в обеих темах**). AlarmSettings: `.mono-badge border-radius:6px`→`--radius-6px`, mono → `--font-mono`; select arrow gap `30px`→`--space-30px`; `padding:6px 30px 6px 12px`→`var(--space-2xs) var(--space-30px) var(--space-2xs) var(--space-3)`.
- **AppearanceSettings.svelte** (65): spacing/typography/radius → токены; без кнопок-дублей.
- **ConnectionSettings.svelte** (67): `btn-primary`(MV)→`Button`; input/spacing→токены; `font-family: monospace` (если есть) → `--font-mono`.
- **AboutSettings.svelte** (51): version `monospace`→`--font-mono`; spacing/typography→токены; без кнопок.
- **YandexSearchBar.svelte** (35): `.search-input`+`.clear-btn`(DUP) → `SearchInput`+`ClearButton`; `content-padded`(MV) уже; spacing→токены.

**Верификация:** `check`+`test:run`+per-file diff. Смоук: боковое меню (collapse/expand анимация, nav, fold handle), плейлисты (поиск+clear+group actions+кнопки), очередь, ВСЕ settings-экраны — особенно toggle-свитчи (Alarm/Services: трек 44×24, knob 20, travel), select-стрелка Alarm, mono-бейджи, тени в gruvbox. Обе темы.

---

## 5. Сводка рисков паритета (что НЕ трогать или делать осторожно)

| # | Риск | Файлы | Решение в паритетной миграции |
|---|---|---|---|
| R1 | **`--radius-xl` 20(default)/16(gruvbox)** | theme.ts, везде где radius-xl | Унифицировать на **20px** в tokens.css. gruvbox 16→20 — СОГЛАСОВАННОЕ мелкое визуальное изменение (карточки/модалки чуть круглее). Явно отметить в коммите. |
| R2 | **pill-drift**: `.btn-*` хардкодят `border-radius:20px`(==default xl, но gruvbox xl=16) | MusicViews.css | Ввести `--radius-pill: var(--radius-full)` (капсула, паритет-safe для коротких контролов И убирает дрейф). Если нужен строгий байт-паритет 20px — `--radius-pill: 20px`. |
| R3 | **FullPlayer shadow-БАГ** (`:274/:342` цвет-токен как полный box-shadow ⇒ тень не видна) | FullPlayer.svelte | НЕ исправлять в паритетной миграции (исправление = появление тени = визуальное изменение). Оставить строки нетронутыми; завести отдельную задачу, согласовать с владельцем. |
| R4 | **shadow с одной геометрией, 3 разных цвета** (`0 10px 40px` × `--c-black-70`/raw rgba0.7/`--c-shadow-header`; header в gruvbox=0.2) | MusicViews(header), SortMenu, others | НЕ сливать. `--shadow-xl` (для black-70) и `--shadow-xl-header` (для shadow-header) — РАЗНЫЕ токены. |
| R5 | **raw rgba в box-shadow обходят `--c-shadow-*`** (не адаптируются под gruvbox) | ServicesSettings(0.3), AlarmSettings, main.css(мёртв, удаляем), SortMenu(0.7) | Перед заменой на токен СВЕРИТЬ значение в ОБЕИХ темах. Если токенизация меняет gruvbox — оставить литерал или ввести явный вариант. |
| R6 | **near-dup shadow геометрии** (0 2px4 vs 0 2px5; 0 4px12 vs 0 4px15; 0 8px24 vs 0 10px30) | MiniPlayer, MainScreen, MusicViews keyframe | Для НЕ совпадающих оставить литерал (или отдельный токен `--shadow-md-popover` для 0 4px15). Не схлопывать. |
| R7 | **off-scale opacity** (0.9/0.95/0.85; 0.1/0.2/0.4) | meta-tag, floating-item, др. | Оставить литералом где ≠ значению токена (0.9≠0.8). Только точные совпадения → токен. |
| R8 | **radius 1px/3px → 2px** (TrackPlaybackIndicator, scrollbar, card-badge) | shared.css, MusicViews.css, TrackPlaybackIndicator | Оставить `1px`/`3px` литералами для строгого байт-паритета (помечены кандидатами). НЕ снапить к `--radius-xs`(2). |
| R9 | **keyframe landDown `0 10px 30px`** ≠ `--shadow-lg`(0 8px 24px) | MusicViews.css | Оставить литералом. |
| R10 | **dropzone border `--c-border` vs `--c-border-dashed`** | PlaylistGrid vs MusicViews | Спек: брать `--c-border-dashed`. Но это сменит цвет рамки PlaylistGrid → СВЕРИТЬ в обеих темах; если различается — оставить локальный вариант (паритет важнее унификации). |
| R11 | **z-index 101/105/110 MiniPlayer; локальные 2/3/4/5/10** | MiniPlayer, RadioView, PlaylistGrid | Числа сохранить (паритет). Либо `--z-miniplayer`+`calc`, либо оставить литералами + пометить кандидатами. |
| R12 | **`--c-error-ring` нужен ДО Modal** | theme.ts, Modal | Завести в Батче 0, иначе `--shadow-error-ring` сломается. |
| R13 | **`--z-sidebar/menu/context-menu` отсутствуют в shared.css :root** | SideMenu, ContextMenu, SortMenu | Добавить в tokens.css ДО Батчей 2/4, иначе при статической загрузке (без активной темы из ui.ts) переменная undefined. |
| R14 | **stroke-width 1.5 (unitless) vs `--icon-stroke-width`(1.5px)** | MusicViews, SortMenu, settings | `stroke-width` принимает unitless; токен с `px` валиден для большинства, но безопаснее оставить `1.5` литералом для SVG `stroke-width`, а токен использовать для CSS-свойств где это `px`. |
| R15 | **font-family слияние** (shared без Helvetica/Arial vs main.css с ними) | shared.css | `--font-sans` без хвоста Helvetica/Arial — системный шрифт резолвится первым ⇒ инертно. main.css мёртв, его стек не применялся. Паритет сохранён. |

---

## 6. Стратегия верификации (на каждый батч)

1. **Типы:** `npm run check` (svelte-check) — без новых ошибок.
2. **Тесты:** `npm run test:run` — все зелёные (тесты в `src/lib/__tests__/`).
3. **Сборка:** `npm run build` — успешна (ловит сломанные `@import`/var).
4. **Diff-паритет (главное):** `git diff <файл>` по каждому изменённому файлу. Для КАЖДОЙ замены `raw → var(--token)` вручную убедиться, что вычисленное значение токена == старому raw В ОБЕИХ ТЕМАХ. Особое внимание — композитным (shadow/border) и off-scale.
5. **Вычисленные значения (опционально, усиление):** до миграции снять снапшот `getComputedStyle` ключевых селекторов в обеих темах (скрипт в devtools/Playwright); после — сравнить. Допустимые расхождения только из согласованного списка (R1 gruvbox radius-xl).
6. **Визуальный смоук на `moode.local`:** в обеих темах (default + gruvbox) пройти по экранам, затронутым батчем (списки выше per-batch). Сверить с прод-скриншотами до миграции. Особый чек-лист: VolumeSlider thumb (R6/space-7px), toggle-свитчи (travel), тени header/sort/services в gruvbox (R4/R5), радиусы карточек/модалок в gruvbox (R1 — ОЖИДАЕМОЕ изменение), error-ring модалки (R12).
7. **Коммит на батч** с явной пометкой согласованных визуальных изменений (R1) в сообщении.

---

## 7. Порядок исполнения (итог)

```
Батч 0 (фундамент, в одиночку) ──► verify ──► commit
   ├─ tokens.css (новый)
   ├─ theme.ts (вынос invariant, +c-error-ring)
   ├─ App.svelte (импорт tokens.css первым)
   ├─ shared.css / MusicViews.css / SortMenu.css (raw→token)
   ├─ удалить app.css+импорт, удалить мёртвый main.css
   ├─ примитивы (Button/IconButton/PlayButton/Toggle/SearchInput/ClearButton/CardMenuButton)
   └─ constants.ts (BREAKPOINTS, MOTION)
Батч 1 (атомарные, ∥) ──► verify ──► commit
Батч 2 (плеер/средние, ∥) ──► verify ──► commit   [FullPlayer shadow-баг — НЕ трогать]
Батч 3 (views на общих классах, ∥) ──► verify ──► commit
Батч 4a (крупные: SideMenu, PlaylistsView, QueueView — посл.) ──► verify ──► commit
Батч 4b (settings: Alarm+Services пара, Appearance, Connection, About, YandexSearchBar) ──► verify ──► commit
```

После полной миграции — отдельная веха «рационализация off-scale» (этап Claude Design) по списку `offScaleFlags` из спека (6/10/30/50px, 13/15/28/60px, near-dup shadows, opacity ramp, FullPlayer shadow-fix R3 и т.д.). Это уже визуальные изменения, вне паритетной миграции.
