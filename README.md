# Сайт-портфолио nvk

Статический сайт без зависимостей. Тексты и данные — в `content.mjs`, сборка — `node build.mjs` (Node.js 18+), результат — папка `docs/`. Её и публикует GitHub Pages.

## Структура

```
content.mjs        все тексты и данные: кейсы, услуги, FAQ, ссылки
build.mjs          сборщик: HTML, типографика, проверка ссылок
src/
  css/site.css     стили
  js/site.js       просмотр слайдов и автозапуск видео на страницах кейсов
  fonts/           Manrope и Inter (woff2)
  img/             картинки кейсов; img/og — превью для ссылок
  video/           видео кейса с ботом (MP4, без звука)
  files/           файлы для скачивания: PPTX и PDF питч-дека, ZIP с кодом бота
  favicon.svg, apple-touch-icon.png
tools/             crop.py (резать длинные скриншоты), touch-icon.html (исходник иконки)
docs/              готовый сайт — руками не править, перезаписывается при сборке
```

## Сборка

```sh
node build.mjs                          # чистовая сборка в docs/
node build.mjs --drafts --out=preview   # с черновыми карточками «В работе» и «Скоро» — только для просмотра
node build.mjs --og                     # плюс HTML-шаблоны картинок превью в og/
```

Сборщик сам расставляет неразрывные пробелы, копирует `src/` в `docs/assets/` и проверяет внутренние ссылки. Сборку с `--drafts` не публикуйте: собирайте её в отдельную папку, как в примере.

Посмотреть локально:

```sh
python3 -m http.server -d docs 8000     # затем открыть http://localhost:8000/
```

## Публикация на GitHub Pages

Адрес уже вписан в `content.mjs` → `site.url`: `https://just-nvk.github.io/`. Он подходит, если репозиторий называется `just-nvk.github.io`.

1. Создайте на GitHub публичный репозиторий `just-nvk.github.io` — пустой, без README и .gitignore. На бесплатном тарифе Pages работает только с публичными.
2. Отправьте в него эту папку:
   ```sh
   git init -b main
   git config user.name "nvk"
   git config user.email "ID+just-nvk@users.noreply.github.com"
   git add .
   git commit -m "Сайт-портфолио"
   git remote add origin https://just-nvk@github.com/just-nvk/just-nvk.github.io.git
   git push -u origin main
   ```
   Почта в `user.email` — автор коммитов. Свой адрес вида `…+just-nvk@users.noreply.github.com` возьмите на GitHub: Settings → Emails. Без этих двух строк Git подпишет коммит тем аккаунтом, что настроен на компьютере.

   `just-nvk@` в адресе подсказывает Git, под каким аккаунтом входить. Это важно, если на компьютере уже есть вход в другой аккаунт GitHub: иначе `git push` ответит ошибкой 403 `Permission … denied to …`. В окне входа выберите вход через браузер и проверьте, что в браузере открыт аккаунт just-nvk. Если окно не появилось, удалите сохранённый вход: «Диспетчер учётных данных» → «Учётные данные Windows» → записи `git:https://github.com` → «Удалить».
3. В репозитории откройте Settings → Pages → Build and deployment. Source: Deploy from a branch, Branch: `main`, папка `/docs` → Save.
4. Через пару минут сайт откроется по адресу `https://just-nvk.github.io/`.

Если назвать репозиторий иначе, например `portfolio`, сайт будет по адресу `https://just-nvk.github.io/portfolio/`. Впишите его в `site.url`, пересоберите (`node build.mjs`) и отправьте изменения. Свой домен подключается в Settings → Pages → Custom domain — тогда в `site.url` укажите его. Адрес нужен для картинки в превью ссылок, canonical и `sitemap.xml`.

Кнопки «Код на GitHub» на страницах кейсов ведут в репозитории `just-nvk/mint-bot`, `just-nvk/metr-leads` и `just-nvk/polka-report`. Опубликуйте их раньше, чем начнёте делиться ссылкой на сайт.

Telegram запоминает превью ссылки. Если ссылку отправляли до того, как появилась картинка, обновите превью через бота @WebpageBot.

## Картинки превью

Готовые лежат в `src/img/og/` (1200×630). Если поменяли заголовки:

```sh
node build.mjs --og
for k in hub design dev rovno ai kedr mint leads polka; do
  chromium --headless --hide-scrollbars --window-size=1200,630 --virtual-time-budget=3000 \
    --screenshot="src/img/og/$k.png" "file://$PWD/og/$k.html"
done
node build.mjs
```

Вместо `chromium` подойдёт `google-chrome`.

## Видео и код

- Видео — `src/video/`: широкое `mint-demo.mp4` (1920×1080) показывается на экранах от 700 px, вертикальное `mint-demo-vertical.mp4` (720×1280) — на телефонах. Постеры — `src/img/mint/`. Если перерендерили ролики, сожмите их для сайта (около 3 МБ каждый):
  ```sh
  ffmpeg -i bot-demo.mp4 -an -r 30 -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -movflags +faststart src/video/mint-demo.mp4
  ffmpeg -i bot-demo-vertical.mp4 -an -r 30 -vf scale=720:-2 -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -movflags +faststart src/video/mint-demo-vertical.mp4
  ```
- Сервис заявок: видео `leads-demo.mp4` и `leads-demo-vertical.mp4` (около 1 МБ каждое), постеры и скриншоты галереи — `src/img/leads/` (галерея 16:10: `-800.webp` и `-1600.webp`). Исходники видео и скриншотов — в папке проекта `case4-leads`.
- Отчёт для «Полки»: обложка — `src/img/polka/hero-800/1600/2400.webp` (16:9, на экранах от 700 px) и `hero-tall-800/1600.webp` (4:5, на телефонах), карточка — `cover`, галерея 16:10 — `summary`, `checks`, `products`, `run`. Исходники — в папке проекта `case5-polka` (`shots.py` → `gallery.py` и `hero.py`).
- Код для скачивания — `src/files/mint-bot.zip`, `src/files/metr-leads.zip` и `src/files/polka-report.zip`, пример отчёта — `src/files/polka-otchet-oktyabr-2026.xlsx` (собирается командой `python -m polka_report` в папке `polka-report`). Если код изменился, пересоберите архив из папки проекта без `.venv`, `data/` и `.env` (например, `git archive --format=zip --prefix=metr-leads/ -o …/src/files/metr-leads.zip HEAD`) — или скачайте свежий с GitHub: Code → Download ZIP.

## Как добавить кейс

1. Карточка — в `content.mjs`, массив `cases`. `status: 'draft'` — карточка видна только в сборке с `--drafts`, `'ready'` — на сайте. Готовому кейсу нужны `href` (адрес страницы) и `cover`: путь к картинке в `src/img/` без суффикса, рядом должны лежать версии `-800.webp` и `-1600.webp` (16:9). Для картинок другого формата у `picture()` есть параметры `widths`, `w` и `h` — так подключены карточки карусели 4:5 (`-540.webp` и `-1080.webp`).
2. Страницу кейса собирает своя функция в `build.mjs` (образцы — `pageRovno()` со слайдами, `pageAi()` с карточками карусели и `pageMint()` с видео и кодом, `pageLeads()` — то же плюс галерея скриншотов, `pagePolka()` — с картинкой вместо видео), тексты страницы — в `content.mjs` (объекты `rovno`, `ai`, `mint`, `leads` и `polka`). Файлы для скачивания кладите в `src/files/`.
3. Пока у направления нет готовых кейсов, блок кейсов на его странице скрыт. Если готовый кейс один, карточка растягивается на всю ширину.

## Цены

Цены «от» и сроки услуг — в `content.mjs`, поля `price` и `time` у `services` в объектах `design` и `dev`. Те же цифры повторяются в ответах FAQ «Сколько стоит…» — меняйте вместе.

## Лицензии

- Шрифты Manrope и Inter — SIL Open Font License 1.1: можно использовать на сайте, в том числе коммерческом.
- Фото в питч-деке — Unsplash License: бесплатно, в том числе для коммерческих проектов.
- Кейсы — демо-проекты: компании, люди и цифры вымышлены.
