// Сборка сайта nvk: node build.mjs [--drafts] [--out=docs] [--og]
//   --drafts  показать черновые карточки кейсов («В работе», «Скоро»)
//   --out=…   папка для результата (по умолчанию docs — её публикует GitHub Pages)
//   --og      дополнительно собрать HTML-шаблоны картинок для превью ссылок в og/
import { readFile, writeFile, mkdir, rm, cp, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from './content.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const argv = process.argv.slice(2);
const DRAFTS = argv.includes('--drafts');
const MAKE_OG = argv.includes('--og');
const EAGER = argv.includes('--eager'); // для скриншотов: грузить все картинки сразу
const outArg = argv.find((a) => a.startsWith('--out='));
const OUT = path.resolve(ROOT, outArg ? outArg.slice(6) : 'docs');
let SITE_URL = (process.env.SITE_URL ?? C.site.url ?? '').trim();
if (SITE_URL && !SITE_URL.endsWith('/')) SITE_URL += '/';

const TG = C.site.telegram;

// ---------- текст ----------
const NBSP = '\u00A0';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function typo(s) {
  let t = String(s);
  t = t.replace(/ +— /g, `${NBSP}— `);
  t = t.replace(/ +· /g, `${NBSP}· `);
  t = t.replace(/(?<=^|[\s(«„"/])([а-яёa-z]{1,2})\s+(?=\S)/giu, `$1${NBSP}`);
  t = t.replace(/(\d)\s+(?=\d{3}(?!\d))/g, `$1${NBSP}`);
  t = t.replace(/(\d)\s+(?=(₽|%|млн|млрд|тыс|мин|час|слайд|месяц|недел|кофе|точ|дн|январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|нояб|декабр))/gu, `$1${NBSP}`);
  // не переносить «питч-дек», «веб-сервисы», «10–15»
  t = t.replace(/(?<![\p{L}\d-])(\p{L}{1,4}-\p{L}+|\d+[–-]\d+)/gu, '<span class="nw">$1</span>');
  return t;
}
const T = (s) => typo(esc(s));

// ---------- иконки ----------
const svg = (d, cls = '') => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const ICON = {
  arrow: svg('M5 12h14M13 6l6 6-6 6'),
  back: svg('M19 12H5M11 18l-6-6 6-6'),
  download: svg('M12 4v11M7 10l5 5 5-5M5 20h14'),
  code: svg('M8 7l-5 5 5 5M16 7l5 5-5 5'),
  check: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#FFFFFF"/><path d="M10 16.5l4 4 8-9" fill="none" stroke="#3346D3" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// ---------- компоненты ----------
const tgButton = (cls = 'btn--primary') => `<a class="btn ${cls}" href="${TG.url}" target="_blank" rel="noopener">${T(C.cta.label)}</a>`;

// Картинка из src/img: src без суффикса, рядом лежат версии -<ширина>.webp.
// По умолчанию 16:9: -800.webp и -1600.webp. Для других форматов передайте widths и размер большой версии (w, h).
function picture(r, src, { cls = '', alt = '', sizes = '(max-width: 899px) 100vw, 560px', eager = false, widths = [800, 1600], w = 1600, h = 900 } = {}) {
  const base = `${r}assets/img/${src}`;
  const set = widths.map((x) => `${base}-${x}.webp ${x}w`).join(', ');
  return `<img${cls ? ` class="${cls}"` : ''} src="${base}-${widths[0]}.webp" srcset="${set}" sizes="${sizes}" width="${w}" height="${h}" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : EAGER ? '' : ' loading="lazy"'}${EAGER ? '' : ' decoding="async"'}>`;
}
const slideImg = (r, n, opts) => picture(r, `rovno/slide-${String(n).padStart(2, '0')}`, opts);

function deckStack(r, { eager = false, sizes } = {}) {
  return `<div class="deck-stack">
${slideImg(r, 6, { cls: 'deck-stack__back', alt: 'Слайд «Пилот» из питч-дека «Ровно» с диаграммой списаний', eager, sizes })}
${slideImg(r, 1, { cls: 'deck-stack__front', alt: 'Обложка питч-дека «Ровно»', eager, sizes })}
</div>`;
}

const msg = (lines, time) => `<div class="tg-msg">${lines.map(T).join('\n')}<time>${time}</time></div>`;
const group = (lines, time, cols, buttons) => `<div class="tg-group">${msg(lines, time)}${kb(cols, buttons)}</div>`;
const kb = (cols, buttons) => `<div class="tg-kb tg-kb--${cols}">${buttons.map((b) => {
  const [label, mod] = Array.isArray(b) ? b : [b, ''];
  return `<span${mod ? ` class="${mod}"` : ''}>${T(label)}</span>`;
}).join('')}</div>`;

function phoneMock() {
  return `<figure class="phone-wrap">
<div class="phone" role="img" aria-label="Пример диалога: бот «Мята · запись» показывает свободное время, а затем сводку записи с кнопками «Подтвердить» и «Изменить»">
<div class="phone__screen" aria-hidden="true">
<div class="tg-head"><svg class="tg-head__back" viewBox="0 0 10 16"><path d="M8 2L2 8l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="tg-ava">М</span><div><b>Мята · запись</b><small>бот</small></div></div>
<div class="tg-chat">
<span class="tg-pill">9 ноября</span>
${group(['Четверг, 12 ноября. Свободное время:'], '10:42', 3, ['10:00', '11:30', ['14:00', 'is-active'], '15:30', '17:00', '18:30', ['‹ Назад', 'is-wide']])}
${group(['Проверьте запись:', '', 'Услуга: Маникюр · 1 800 ₽', 'Когда: чт, 12 ноября, 14:00', 'Мастер: Вера', 'Адрес: ул. Садовая, 12'], '10:42', 2, ['Подтвердить', 'Изменить'])}
</div>
<div class="tg-input">Сообщение</div>
</div>
</div>
<figcaption class="phone__caption">${T('Демо-проект: бот записи в салон «Мята»')}</figcaption>
</figure>`;
}

function chatSnippet({ full = false } = {}) {
  const label = 'Пример: бот подтверждает запись, а накануне визита напоминает о ней и предлагает кнопки «Да, приду» и «Перенести»';
  return `<div class="chat-snippet${full ? ' chat-snippet--full' : ''}" role="img" aria-label="${esc(label)}"><div class="chat-col" aria-hidden="true">
${full ? `${msg(['Готово, вы записаны ✅', 'Напомню накануне и за 2 часа до визита.'], '10:42')}\n<span class="tg-pill">11 ноября</span>\n` : ''}${group(['Напоминаю о записи: завтра, 12 ноября, в 14:00 — маникюр, мастер Вера. Всё в силе?'], '18:00', 2, ['Да, приду', 'Перенести'])}
</div></div>`;
}

function sectionHead(id, title, lead) {
  return `<div class="section__head"><h2 id="${id}-title">${T(title)}</h2>${lead ? `<p>${T(lead)}</p>` : ''}</div>`;
}

function caseCard(r, c, { wide = false } = {}) {
  const draft = c.status !== 'ready';
  let media;
  if (c.cover) media = picture(r, c.cover.src, { alt: c.cover.alt, sizes: wide ? '(max-width: 899px) 100vw, 640px' : '(max-width: 899px) 100vw, 540px' });
  else if (c.visual === 'chat') media = chatSnippet();
  else media = `<div class="card__ph"><span>${T(c.badge || 'Скоро')}</span></div>`;
  const badge = draft && c.visual ? `<span class="badge">${T(c.badge || 'Скоро')}</span>` : '';
  const body = `<div class="card__body"><div class="card__tags"><span class="kicker">${T(c.tag || c.kicker)}</span>${badge}</div><h3>${T(c.title)}</h3><p class="card__meta">${T(c.meta)}</p>${draft ? '' : `<span class="link-more">Смотреть кейс ${ICON.arrow}</span>`}</div>`;
  const cls = `card${wide ? ' card--wide' : ''}${draft ? ' card--draft' : ''}`;
  const inner = `<div class="card__media">${media}</div>${body}`;
  return draft ? `<article class="${cls}">${inner}</article>` : `<a class="${cls}" href="${r}${c.href}">${inner}</a>`;
}

function casesGrid(r, list) {
  if (list.length === 1) return `<div class="cards cards--1">${caseCard(r, list[0], { wide: true })}</div>`;
  return `<div class="cards${list.length === 2 ? ' cards--2' : ''}">${list.map((c) => caseCard(r, c)).join('\n')}</div>`;
}

function services(items) {
  const price = (s) => (s.price ? `<p class="svc__price">${T(s.price)}${s.time ? `<span>${NBSP}· ${T(s.time)}</span>` : ''}</p>` : '');
  return `<ul class="svc">${items.map((s) => `<li><h3>${T(s.title)}</h3><p>${T(s.text)}</p><div class="svc__foot">${price(s)}<p class="svc__meta">${T(s.meta)}</p></div></li>`).join('')}</ul>`;
}

function benefits(b) {
  return `<section class="section--band" id="benefits" aria-labelledby="benefits-title"><div class="container">
${sectionHead('benefits', b.title)}
<ul class="benefits">${b.items.map((i) => `<li>${ICON.check}<h3>${T(i.title)}</h3><p>${T(i.text)}</p></li>`).join('')}</ul>
</div></section>`;
}

function processSection(kind) {
  const steps = C.processSteps(kind);
  return `<section class="section" id="process" aria-labelledby="process-title"><div class="container">
${sectionHead('process', 'Как я работаю')}
<ol class="steps">${steps.map((s) => `<li><h3>${T(s.title)}</h3><p>${T(s.text)}</p></li>`).join('')}</ol>
</div></section>`;
}

function aboutSection(a) {
  return `<section class="section" id="about" aria-labelledby="about-title"><div class="container"><div class="about">
<h2 id="about-title">${T(a.title)}</h2>
<div class="about__text">${a.paragraphs.map((p) => `<p>${T(p)}</p>`).join('')}<ul class="about__facts">${a.facts.map((f) => `<li>${T(f)}</li>`).join('')}</ul></div>
</div></div></section>`;
}

function faqSection(items) {
  return `<section class="section" id="faq" aria-labelledby="faq-title"><div class="container faq-wrap">
<div class="faq-wrap__head"><h2 id="faq-title">Вопросы</h2><p>${T('Не нашли ответ? Спросите в Telegram — отвечу.')}</p><a class="link-more" href="${TG.url}" target="_blank" rel="noopener">${esc(TG.handle)} ${ICON.arrow}</a></div>
<div class="faq">${items.map((i) => `<details><summary>${T(i.q)}</summary><p>${T(i.a)}</p></details>`).join('')}</div>
</div></section>`;
}

function ctaBand(b) {
  return `<section class="section" aria-labelledby="cta-title"><div class="container"><div class="cta-band">
<div><h2 id="cta-title">${T(b.title)}</h2><p>${T(b.text)}</p></div>
<div class="cta-band__act">${tgButton('btn--light')}<span class="cta-band__handle">${T(`Telegram ${TG.handle}`)}</span></div>
</div></div></section>`;
}

// ---------- каркас страницы ----------
let ASSET_V = '';
function layout(page, main) {
  const r = page.root;
  const canonical = SITE_URL ? SITE_URL + page.path : '';
  const ogImage = SITE_URL && page.og ? `${SITE_URL}assets/img/og/${page.og}.png` : '';
  const nav = page.nav.map(([href, label]) => `<a href="${href}">${T(label)}</a>`).join('');
  const meta = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="ru_RU">`,
    `<meta property="og:site_name" content="nvk">`,
    `<meta property="og:title" content="${esc(page.ogTitle || page.title)}">`,
    `<meta property="og:description" content="${esc(page.description)}">`,
    canonical && `<link rel="canonical" href="${canonical}">`,
    canonical && `<meta property="og:url" content="${canonical}">`,
    ogImage && `<meta property="og:image" content="${ogImage}">`,
    ogImage && `<meta property="og:image:width" content="1200">`,
    ogImage && `<meta property="og:image:height" content="630">`,
    ogImage && `<meta name="twitter:card" content="summary_large_image">`,
  ].filter(Boolean).join('\n');
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
${meta}
<meta name="theme-color" content="#FAFAF7">
<meta name="color-scheme" content="light">
<link rel="icon" href="${r}favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${r}apple-touch-icon.png">
<link rel="preload" href="${r}assets/fonts/inter-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${r}assets/fonts/manrope-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${r}assets/css/site.css?v=${ASSET_V}">
</head>
<body>
<a class="skip" href="#main">Перейти к содержанию</a>
<header class="site-header"><div class="container site-header__in">
<a class="wordmark" href="${r || './'}" aria-label="nvk — на главную">nvk<i>.</i></a>
<nav class="nav" aria-label="Разделы">${nav}</nav>
${tgButton('btn--primary btn--sm')}
</div></header>
<main id="main">
${main}
</main>
<footer class="site-footer"><div class="container">
<div class="site-footer__grid">
<div class="site-footer__about"><a class="wordmark" href="${r || './'}" aria-label="nvk — на главную">nvk<i>.</i></a><p>${T(C.site.disclaimer)}</p></div>
<div><h2>Направления</h2><ul><li><a href="${r}design/">${T('Презентации и инфографика')}</a></li><li><a href="${r}dev/">${T('Боты и автоматизация')}</a></li></ul></div>
<div><h2>Связь</h2><ul><li><a href="${TG.url}" target="_blank" rel="noopener">Telegram ${esc(TG.handle)}</a></li></ul></div>
</div>
<p class="site-footer__copy">© ${C.site.year} nvk</p>
</div></footer>
${page.js ? `<script src="${r}assets/js/site.js?v=${ASSET_V}" defer></script>\n` : ''}</body>
</html>
`;
}

const visible = (dir) => C.cases.filter((c) => c.direction === dir && (DRAFTS || c.status === 'ready'));

// ---------- страницы ----------
function pageHub() {
  const H = C.hub;
  const page = {
    path: '', root: '', og: 'hub', title: H.title, description: H.description,
    nav: [['design/', 'Презентации'], ['dev/', 'Боты и автоматизация'], ['#process', 'Как я работаю'], ['#about', 'Обо мне']],
  };
  const dirs = H.directions.map((d) => `<a class="dir" href="${d.href}">
<div class="dir__media${d.visual === 'chat' ? ' dir__media--chat' : ''}">${d.visual === 'deck' ? deckStack('', { sizes: '(max-width: 899px) 90vw, 440px' }) : chatSnippet({ full: true })}</div>
<div class="dir__body"><span class="dir__label">${T(d.label)}</span><h2>${T(d.title)}</h2><p>${T(d.text)}</p><p class="dir__meta">${T(d.meta)}</p><span class="link-more">${T(d.more)} ${ICON.arrow}</span></div>
</a>`).join('\n');
  const main = `<section class="hero hero--hub"><div class="container">
<h1>${T(H.h1)}</h1>
<p class="lead">${T(H.lead)}</p>
<div class="hero__actions">${tgButton()}<span class="hero__note">${esc(TG.handle)}</span></div>
</div></section>
<section class="section section--dirs" aria-label="Направления"><div class="container"><div class="dirs">
${dirs}
</div></div></section>
${processSection('hub')}
${aboutSection(H.about)}
${ctaBand(H.ctaBand)}`;
  return { page, html: layout(page, main) };
}

function pageDirection(kind) {
  const D = C[kind];
  const list = visible(kind);
  const hasCases = list.length > 0;
  const nav = [['#services', 'Услуги']];
  if (hasCases) nav.push(['#cases', 'Кейсы']);
  nav.push(['#process', 'Как я работаю'], ['#faq', 'Вопросы']);
  const page = { path: `${kind}/`, root: '../', og: kind, title: D.title, description: D.description, nav };
  const r = page.root;
  const second = hasCases
    ? `<a class="btn btn--ghost" href="#cases">${list.length > 1 ? 'Смотреть кейсы' : 'Смотреть кейс'}</a>`
    : `<a class="btn btn--ghost" href="#process">Как я работаю</a>`;
  const visual = kind === 'design' ? deckStack(r, { eager: true, sizes: '(max-width: 899px) 90vw, 500px' }) : phoneMock();
  const stack = D.stack ? `<ul class="tags" aria-label="Технологии">${D.stack.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : '';
  const main = `<section class="hero hero--${kind}"><div class="container hero__grid">
<div class="hero__text"><span class="kicker">${T(D.kicker)}</span>
<h1>${T(D.h1)}</h1>
<p class="lead">${T(D.lead)}</p>
${stack}
<div class="hero__actions">${tgButton()}${second}</div></div>
<div class="hero__visual">${visual}</div>
</div></section>
<section class="section" id="services" aria-labelledby="services-title"><div class="container">
${sectionHead('services', 'Что делаю')}
${services(D.services)}
</div></section>
${hasCases ? `<section class="section" id="cases" aria-labelledby="cases-title"><div class="container">
${sectionHead('cases', 'Кейсы', D.casesLead)}
${casesGrid(r, list)}
</div></section>` : ''}
${benefits(D.benefits)}
${processSection(kind)}
${aboutSection(D.about)}
${faqSection(D.faq)}
${ctaBand(D.ctaBand)}`;
  return { page, html: layout(page, main) };
}

function fileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}${NBSP}КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')}${NBSP}МБ`;
}

// Кнопки скачивания: { file } — файл из src/files, { href } — внешняя ссылка (например, GitHub).
async function downloadButtons(r, list) {
  const out = [];
  for (const d of list) {
    if (d.href) { out.push(`<a class="btn btn--ghost" href="${d.href}" target="_blank" rel="noopener">${ICON.code}${T(d.label)}</a>`); continue; }
    const size = (await stat(path.join(SRC, 'files', d.file))).size;
    out.push(`<a class="btn btn--ghost" href="${r}files/${d.file}" download>${ICON.download}${T(d.label)} <small>${fileSize(size)}</small></a>`);
  }
  return `<div class="downloads">${out.join('')}</div>`;
}

const caseSec = (id, title, body) => `<section class="case-sec" aria-labelledby="${id}-title"><h2 id="${id}-title">${T(title)}</h2><div class="case-sec__body">${body}</div></section>`;
const caseFacts = (facts) => `<ul class="facts">${facts.map((f) => `<li><span>${T(f.label)}</span><b>${T(f.value)}</b></li>`).join('')}</ul>`;
const tiles = (items) => `<ul class="decisions">${items.map((d) => `<li><h3>${T(d.title)}</h3><p>${T(d.text)}</p></li>`).join('')}</ul>`;
const flow = (items, label, cls = '', fmt = T) => `<ol class="flow${cls ? ` ${cls}` : ''}" aria-label="${esc(label)}">${items.map((f) => `<li><span>${fmt(f)}</span></li>`).join('')}</ol>`;

async function pageRovno() {
  const R = C.rovno;
  const page = {
    path: 'cases/rovno/', root: '../../', og: 'rovno', title: R.title, description: R.description, js: true,
    nav: [['../../design/#services', 'Услуги'], ['../../design/#cases', 'Кейсы'], ['../../design/#process', 'Как я работаю'], ['../../design/#faq', 'Вопросы']],
  };
  const r = page.root;
  const downloads = await downloadButtons(r, R.downloads);
  const gallery = R.slides.map((name, i) => {
    const n = String(i + 1).padStart(2, '0');
    return `<figure><a href="${r}assets/img/rovno/slide-${n}-1600.webp" data-lightbox data-caption="${esc(name)}">${slideImg(r, i + 1, { alt: `Слайд ${i + 1}. ${R.slideAlts[i]}`, sizes: '(max-width: 699px) 100vw, 548px' })}</a><figcaption><b>${n}</b>${T(name)}</figcaption></figure>`;
  }).join('\n');
  const main = `<section class="case-hero"><div class="container">
<nav class="crumbs" aria-label="Вы здесь"><a href="${r}design/#cases">${ICON.back}${T('Презентации и инфографика')}</a></nav>
<span class="kicker">${T(R.kicker)}</span>
<h1>${T(R.h1)}</h1>
<p class="lead">${T(R.lead)}</p>
${caseFacts(R.facts)}
</div></section>
<div class="container"><div class="case-cover">
<div class="case-cover__main">${slideImg(r, 1, { alt: 'Обложка питч-дека «Ровно»: прогноз выпечки для кофеен', sizes: '(max-width: 699px) 100vw, 760px', eager: true })}</div>
<div class="case-cover__side">${slideImg(r, 6, { alt: 'Слайд «Пилот»: списания падают с первого месяца', sizes: '(max-width: 699px) 50vw, 360px', eager: true })}${slideImg(r, 7, { alt: 'Слайд «Результаты»: итоги пилота', sizes: '(max-width: 699px) 50vw, 360px', eager: true })}</div>
</div></div>
<div class="container case-body">
<section class="case-sec" aria-labelledby="task-title"><h2 id="task-title">Задача</h2><div class="case-sec__body">${R.task.map((p) => `<p>${T(p)}</p>`).join('')}</div></section>
<section class="case-sec" aria-labelledby="solution-title"><h2 id="solution-title">Решение</h2><div class="case-sec__body">
<p>${T(R.solutionLead)}</p>
${flow(R.flow, 'Порядок слайдов')}
${tiles(R.decisions)}
</div></section>
<section class="case-sec" aria-labelledby="result-title"><h2 id="result-title">Результат</h2><div class="case-sec__body">
<p>${T(R.resultLead)}</p>
${downloads}
<p class="credits">${T(R.credits)}</p>
</div></section>
<div class="gallery">
${gallery}
</div>
</div>
${ctaBand(R.ctaBand)}`;
  return { page, html: layout(page, main) };
}

async function pageAi() {
  const A = C.ai;
  const page = {
    path: 'cases/ai-2026/', root: '../../', og: 'ai', title: A.title, description: A.description, js: true,
    nav: [['../../design/#services', 'Услуги'], ['../../design/#cases', 'Кейсы'], ['../../design/#process', 'Как я работаю'], ['../../design/#faq', 'Вопросы']],
  };
  const r = page.root;
  // Карточки 4:5: -540.webp и -1080.webp (оригинал 1080×1350).
  const cards = A.cards.map((name, i) => {
    const n = String(i + 1).padStart(2, '0');
    const img = picture(r, `ai/card-${n}`, { widths: [540, 1080], w: 1080, h: 1350, alt: `Карточка ${i + 1}. ${A.cardAlts[i]}`, sizes: '(max-width: 899px) 50vw, 266px', eager: i < 4 });
    return `<figure><a href="${r}assets/img/ai/card-${n}-1080.webp" data-lightbox data-caption="${esc(name)}">${img}</a><figcaption><b>${n}</b>${T(name)}</figcaption></figure>`;
  }).join('\n');
  const sources = `<ul class="sources">${A.sources.map((s) => `<li><a href="${s.href}" target="_blank" rel="noopener">${T(s.label)}${ICON.arrow}</a><p>${T(s.note)}</p></li>`).join('')}</ul>`;
  const main = `<section class="case-hero"><div class="container">
<nav class="crumbs" aria-label="Вы здесь"><a href="${r}design/#cases">${ICON.back}${T('Презентации и инфографика')}</a></nav>
<span class="kicker">${T(A.kicker)}</span>
<h1>${T(A.h1)}</h1>
<p class="lead">${T(A.lead)}</p>
${caseFacts(A.facts)}
</div></section>
<div class="container"><div class="gallery gallery--cards">
${cards}
</div></div>
<div class="container case-body">
${caseSec('task', 'Задача', A.task.map((p) => `<p>${T(p)}</p>`).join(''))}
${caseSec('solution', 'Решение', `<p>${T(A.solutionLead)}</p>
${flow(A.flow, 'Порядок карточек')}
${tiles(A.decisions)}`)}
${caseSec('data', 'Данные', `<p>${T(A.dataLead)}</p>
${sources}`)}
${caseSec('result', 'Результат', `<p>${T(A.resultLead)}</p>
${await downloadButtons(r, A.downloads)}`)}
</div>
${ctaBand(A.ctaBand)}`;
  return { page, html: layout(page, main) };
}

async function pageKedr() {
  const K = C.kedr;
  const page = {
    path: 'cases/kedr/', root: '../../', og: 'kedr', title: K.title, description: K.description, js: true,
    nav: [['../../design/#services', 'Услуги'], ['../../design/#cases', 'Кейсы'], ['../../design/#process', 'Как я работаю'], ['../../design/#faq', 'Вопросы']],
  };
  const r = page.root;
  // Карточки 3:4: -600.webp и -1200.webp (оригинал 1200×1600).
  const cards = K.cards.map((name, i) => {
    const n = String(i + 1).padStart(2, '0');
    const img = picture(r, `kedr/card-${n}`, { widths: [600, 1200], w: 1200, h: 1600, alt: `Карточка ${i + 1}. ${K.cardAlts[i]}`, sizes: '(max-width: 899px) 50vw, 266px', eager: i < 4 });
    return `<figure><a href="${r}assets/img/kedr/card-${n}-1200.webp" data-lightbox data-caption="${esc(name)}">${img}</a><figcaption><b>${n}</b>${T(name)}</figcaption></figure>`;
  }).join('\n');
  const P = K.photo;
  const photo = `<figure class="case-shot"><a href="${r}assets/img/${P.src}-2400.webp" data-lightbox data-caption="${esc(P.caption)}">${picture(r, P.src, { widths: [800, 1600, 2400], w: 1600, h: 900, alt: P.alt, sizes: '(max-width: 767px) 100vw, 720px' })}</a><figcaption>${T(P.caption)}</figcaption></figure>`;
  const main = `<section class="case-hero"><div class="container">
<nav class="crumbs" aria-label="Вы здесь"><a href="${r}design/#cases">${ICON.back}${T('Презентации и инфографика')}</a></nav>
<span class="kicker">${T(K.kicker)}</span>
<h1>${T(K.h1)}</h1>
<p class="lead">${T(K.lead)}</p>
${caseFacts(K.facts)}
</div></section>
<div class="container"><div class="gallery gallery--cards gallery--34">
${cards}
</div></div>
<div class="container case-body">
${caseSec('task', 'Задача', K.task.map((p) => `<p>${T(p)}</p>`).join(''))}
${caseSec('solution', 'Решение', `<p>${T(K.solutionLead)}</p>
${flow(K.flow, 'Порядок карточек')}
${tiles(K.decisions)}`)}
${caseSec('photo', 'Обработка фото', `<p>${T(K.photoLead)}</p>
${photo}
<p>${T(K.photoNote)}</p>`)}
${caseSec('result', 'Результат', `<p>${T(K.resultLead)}</p>
${await downloadButtons(r, K.downloads)}`)}
</div>
${ctaBand(K.ctaBand)}`;
  return { page, html: layout(page, main) };
}

// Два ролика: широкий для экранов от 700 px и вертикальный для телефонов — какой показать, решает CSS.
// Без звука; site.js включает видимый ролик, когда он на экране (если в системе не выбрано «уменьшить движение»).
function caseVideo(r, V) {
  const video = (v, cls) => `<video class="case-video__${cls}" width="${v.width}" height="${v.height}" controls muted playsinline loop preload="none" data-autoplay poster="${r}assets/img/${v.poster}" aria-label="${esc(V.label)}"><source src="${r}assets/video/${v.file}" type="video/mp4"></video>`;
  return `<div class="container"><figure class="case-video">
${video(V.wide, 'wide')}
${video(V.tall, 'tall')}
<figcaption>${T(V.caption)}</figcaption>
</figure></div>`;
}

// Обложка-картинка кейса: широкая на компьютере, вертикальная на телефоне.
function caseHeroImage(r, H) {
  const tall = [800, 1600].map((x) => `${r}assets/img/${H.tall}-${x}.webp ${x}w`).join(', ');
  const img = picture(r, H.wide, { w: 1600, h: 900, alt: H.alt, sizes: '(max-width: 1199px) 100vw, 1120px', widths: [800, 1600, 2400], eager: true });
  return `<div class="container"><figure class="case-shot">
<picture><source media="(max-width: 699px)" srcset="${tall}" sizes="100vw" width="800" height="1000">${img}</picture>
<figcaption>${T(H.caption)}</figcaption>
</figure></div>`;
}

async function pageMint() {
  const M = C.mint;
  const page = {
    path: 'cases/mint-bot/', root: '../../', og: 'mint', title: M.title, description: M.description, js: true,
    nav: [['../../dev/#services', 'Услуги'], ['../../dev/#cases', 'Кейсы'], ['../../dev/#process', 'Как я работаю'], ['../../dev/#faq', 'Вопросы']],
  };
  const r = page.root;
  const term = M.terminal.map(([kind, line]) => (kind === 'out' ? esc(line) : `<span class="term__${kind}">${esc(line)}</span>`)).join('\n');
  const code = (s) => esc(s);
  const main = `<section class="case-hero"><div class="container">
<nav class="crumbs" aria-label="Вы здесь"><a href="${r}dev/#cases">${ICON.back}${T('Боты и автоматизация')}</a></nav>
<span class="kicker">${T(M.kicker)}</span>
<h1>${T(M.h1)}</h1>
<p class="lead">${T(M.lead)}</p>
${caseFacts(M.facts)}
</div></section>
${caseVideo(r, M.video)}
<div class="container case-body">
${caseSec('task', 'Задача', M.task.map((p) => `<p>${T(p)}</p>`).join(''))}
${caseSec('solution', 'Решение', `<p>${T(M.solutionLead)}</p>
${flow(M.flow, 'Шаги записи')}
${tiles(M.features)}
<p>${T(M.solutionNote)}</p>`)}
${caseSec('arch', 'Как устроено', `<p>${T(M.archLead)}</p>
${flow(M.archFlow, 'Направление зависимостей', 'flow--code', code)}
<dl class="arch">${M.arch.map(([k, v]) => `<div><dt><code>${esc(k)}</code></dt><dd>${T(v)}</dd></div>`).join('')}</dl>`)}
${caseSec('decisions', 'Ключевые решения', tiles(M.decisions))}
${caseSec('tests', 'Тесты', `<p>${T(M.testsLead)}</p>
<pre class="term"><code>${term}</code></pre>
<ul class="checks">${M.tests.map((t) => `<li>${T(t)}</li>`).join('')}</ul>
<p class="note">${T(M.testsNote)}</p>`)}
${caseSec('open', 'Открытые вопросы', `<ul class="checks checks--open">${M.open.map((t) => `<li>${T(t)}</li>`).join('')}</ul>`)}
${caseSec('result', 'Результат', `<p>${T(M.resultLead)}</p>
${await downloadButtons(r, M.downloads)}`)}
</div>
${ctaBand(M.ctaBand)}`;
  return { page, html: layout(page, main) };
}

async function pageLeads() {
  const L = C.leads;
  const page = {
    path: 'cases/leads/', root: '../../', og: 'leads', title: L.title, description: L.description, js: true,
    nav: [['../../dev/#services', 'Услуги'], ['../../dev/#cases', 'Кейсы'], ['../../dev/#process', 'Как я работаю'], ['../../dev/#faq', 'Вопросы']],
  };
  const r = page.root;
  // Строка прогресса pytest: на узком экране точки обрезаются, а «[100%]» остаётся видна.
  const termLine = ([kind, line]) => {
    if (kind === 'out') return esc(line);
    if (kind === 'progress') { const [dots, pct] = line.split(/\s+(?=\[)/); return `<span class="term__progress"><span>${esc(dots)}</span><span>${esc(pct)}</span></span>`; }
    return `<span class="term__${kind}">${esc(line)}</span>`;
  };
  const term = L.terminal.map(termLine).join('\n');
  // Скриншоты 16:10: -800.webp и -1600.webp (оригинал 3200×2000).
  const shots = L.shots.map((s, i) => {
    const n = String(i + 1).padStart(2, '0');
    const img = picture(r, s.src, { w: 1600, h: 1000, alt: s.alt, sizes: '(max-width: 699px) 100vw, 548px' });
    return `<figure><a href="${r}assets/img/${s.src}-1600.webp" data-lightbox data-caption="${esc(s.caption)}">${img}</a><figcaption><b>${n}</b>${T(s.caption)}</figcaption></figure>`;
  }).join('\n');
  const main = `<section class="case-hero"><div class="container">
<nav class="crumbs" aria-label="Вы здесь"><a href="${r}dev/#cases">${ICON.back}${T('Боты и автоматизация')}</a></nav>
<span class="kicker">${T(L.kicker)}</span>
<h1>${T(L.h1)}</h1>
<p class="lead">${T(L.lead)}</p>
${caseFacts(L.facts)}
</div></section>
${caseVideo(r, L.video)}
<div class="container case-body">
${caseSec('task', 'Задача', L.task.map((p) => `<p>${T(p)}</p>`).join(''))}
${caseSec('solution', 'Решение', `<p>${T(L.solutionLead)}</p>
${flow(L.flow, 'Путь заявки')}
${tiles(L.features)}
<p>${T(L.solutionNote)}</p>`)}
<div class="gallery">
${shots}
</div>
${caseSec('arch', 'Как устроено', `<p>${T(L.archLead)}</p>
${flow(L.archFlow, 'Путь заявки по коду', 'flow--code', esc)}
<dl class="arch">${L.arch.map(([k, v]) => `<div><dt><code>${esc(k)}</code></dt><dd>${T(v)}</dd></div>`).join('')}</dl>`)}
${caseSec('decisions', 'Ключевые решения', tiles(L.decisions))}
${caseSec('tests', 'Тесты', `<p>${T(L.testsLead)}</p>
<pre class="term"><code>${term}</code></pre>
<ul class="checks">${L.tests.map((t) => `<li>${T(t)}</li>`).join('')}</ul>
<p class="note">${T(L.testsNote)}</p>`)}
${caseSec('open', 'Открытые вопросы', `<ul class="checks checks--open">${L.open.map((t) => `<li>${T(t)}</li>`).join('')}</ul>`)}
${caseSec('result', 'Результат', `<p>${T(L.resultLead)}</p>
${await downloadButtons(r, L.downloads)}`)}
</div>
${ctaBand(L.ctaBand)}`;
  return { page, html: layout(page, main) };
}

async function pagePolka() {
  const P = C.polka;
  const page = {
    path: 'cases/polka/', root: '../../', og: 'polka', title: P.title, description: P.description, js: true,
    nav: [['../../dev/#services', 'Услуги'], ['../../dev/#cases', 'Кейсы'], ['../../dev/#process', 'Как я работаю'], ['../../dev/#faq', 'Вопросы']],
  };
  const r = page.root;
  const termLine = ([kind, line]) => {
    if (kind === 'out') return esc(line);
    if (kind === 'progress') { const [dots, pct] = line.split(/\s+(?=\[)/); return `<span class="term__progress"><span>${esc(dots)}</span><span>${esc(pct)}</span></span>`; }
    return `<span class="term__${kind}">${esc(line)}</span>`;
  };
  const term = P.terminal.map(termLine).join('\n');
  const shots = P.shots.map((s, i) => {
    const n = String(i + 1).padStart(2, '0');
    const img = picture(r, s.src, { w: 1600, h: 1000, alt: s.alt, sizes: '(max-width: 699px) 100vw, 548px' });
    return `<figure><a href="${r}assets/img/${s.src}-1600.webp" data-lightbox data-caption="${esc(s.caption)}">${img}</a><figcaption><b>${n}</b>${T(s.caption)}</figcaption></figure>`;
  }).join('\n');
  const main = `<section class="case-hero"><div class="container">
<nav class="crumbs" aria-label="Вы здесь"><a href="${r}dev/#cases">${ICON.back}${T('Боты и автоматизация')}</a></nav>
<span class="kicker">${T(P.kicker)}</span>
<h1>${T(P.h1)}</h1>
<p class="lead">${T(P.lead)}</p>
${caseFacts(P.facts)}
</div></section>
${caseHeroImage(r, P.hero)}
<div class="container case-body">
${caseSec('task', 'Задача', P.task.map((p) => `<p>${T(p)}</p>`).join(''))}
${caseSec('solution', 'Решение', `<p>${T(P.solutionLead)}</p>
${flow(P.flow, 'Путь данных')}
${tiles(P.features)}
<p>${T(P.solutionNote)}</p>`)}
<div class="gallery">
${shots}
</div>
${caseSec('arch', 'Как устроено', `<p>${T(P.archLead)}</p>
${flow(P.archFlow, 'Путь данных по коду', 'flow--code', esc)}
<dl class="arch">${P.arch.map(([k, v]) => `<div><dt><code>${esc(k)}</code></dt><dd>${T(v)}</dd></div>`).join('')}</dl>`)}
${caseSec('decisions', 'Ключевые решения', tiles(P.decisions))}
${caseSec('tests', 'Тесты', `<p>${T(P.testsLead)}</p>
<pre class="term"><code>${term}</code></pre>
<ul class="checks">${P.tests.map((t) => `<li>${T(t)}</li>`).join('')}</ul>
<p class="note">${T(P.testsNote)}</p>`)}
${caseSec('open', 'Открытые вопросы', `<ul class="checks checks--open">${P.open.map((t) => `<li>${T(t)}</li>`).join('')}</ul>`)}
${caseSec('result', 'Результат', `<p>${T(P.resultLead)}</p>
${await downloadButtons(r, P.downloads)}`)}
</div>
${ctaBand(P.ctaBand)}`;
  return { page, html: layout(page, main) };
}

function page404() {
  const home = SITE_URL || '/';
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Страница не найдена — nvk</title>
<meta name="robots" content="noindex">
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#FAFAF7;color:#2B2B29;font:400 17px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}
main{padding:40px 24px;max-width:560px}
.w{font-weight:800;font-size:28px;letter-spacing:-.04em;color:#141414;text-decoration:none}
.w i{font-style:normal;color:#3346D3}
h1{margin:40px 0 12px;font-size:40px;line-height:1.1;letter-spacing:-.03em;color:#141414}
p{margin:0 0 32px;color:#66655F}
a.b{display:inline-flex;align-items:center;min-height:48px;padding:12px 24px;border-radius:999px;background:#3346D3;color:#fff;font-weight:600;text-decoration:none}
a.b:hover{background:#2636B5}
a:focus-visible{outline:2px solid #3346D3;outline-offset:3px}
</style>
</head>
<body>
<main>
<a class="w" href="${home}" data-home>nvk<i>.</i></a>
<h1>Страница не${NBSP}найдена</h1>
<p>Возможно, ссылка устарела. Начните с${NBSP}главной${NBSP}— там оба направления и${NBSP}контакты.</p>
<a class="b" href="${home}" data-home>На главную</a>
</main>
${SITE_URL ? '' : `<script>(function(){var h=location.hostname,s=location.pathname.split('/')[1];if(/\\.github\\.io$/.test(h)&&s&&h.split('.')[0]!==s){document.querySelectorAll('[data-home]').forEach(function(a){a.href='/'+s+'/';});}})();</script>\n`}</body>
</html>
`;
}

// ---------- картинки для превью ссылок ----------
function ogPage(kind) {
  const r = '../src/';
  const css = `<link rel="stylesheet" href="${r}css/site.css">
<style>
html,body{width:1200px;height:630px;margin:0;overflow:hidden}
.og{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;width:1200px;height:630px;padding:64px 72px;box-sizing:border-box;background:var(--paper)}
.og--text{grid-template-columns:1fr}
.og .wordmark{position:absolute;left:72px;top:56px;font-size:34px;padding:0}
.og__foot{position:absolute;left:72px;bottom:52px;font-size:22px;color:var(--muted);font-weight:500}
.og h1{font-size:54px;line-height:1.06;letter-spacing:-.035em;margin-top:20px}
.og--text h1{font-size:76px;max-width:11em;margin-top:0}
.og p{margin-top:20px;font-size:24px;line-height:1.45;color:var(--text)}
.og .kicker{font-size:14px;padding:9px 14px}
.og .deck-stack img{width:86%}
.og .chat-snippet{border-radius:16px;padding:28px;height:auto}
.og .chat-snippet .tg-msg{font-size:17px;max-width:420px}
.og .chat-snippet .tg-kb{max-width:420px}
.og .chat-snippet .tg-kb span{font-size:15px;padding:10px 6px}
.og .chat-snippet .tg-pill{font-size:14px}
.og__cover{border-radius:12px;border:1px solid var(--line);overflow:hidden;background:#fff}
.og__sheet{position:absolute;right:0;top:70px;width:584px;height:490px;overflow:hidden;border-radius:14px 0 0 14px;background:var(--surface)}
.og__sheet img{position:absolute;left:-176px;top:-18px;width:1040px;max-width:none;height:auto}
.og__phone{position:absolute;right:136px;top:35px;width:288px;height:560px;overflow:hidden}
.og__phone img{position:absolute;left:-390px;top:-20px;width:1068px;max-width:none;height:auto}
.og__phone--v{right:150px;width:269px;border-radius:36px}
.og__phone--v img{left:-49px;top:-76px;width:367px}
.og__cards{position:absolute;right:72px;top:40px;width:520px;height:550px}
.og__card{position:absolute;width:400px;height:500px;border-radius:14px;box-shadow:0 2px 4px rgba(20,20,20,.08),0 18px 44px rgba(20,20,20,.22)}
.og__card--back{right:0;top:36px;width:360px;height:450px;transform:rotate(6deg)}
.og__card--front{left:0;top:25px}
.og__card--34{width:375px;height:500px}
.og__card--back.og__card--34{width:338px;height:450px}
</style>`;
  const shell = (cls, inner) => `<!doctype html><html lang="ru"><head><meta charset="utf-8">${css}</head><body><div class="og ${cls}"><span class="wordmark">nvk<i>.</i></span>${inner}<span class="og__foot">t.me/${TG.handle.replace('@', '')}</span></div></body></html>`;
  const slide = (n) => `${r}img/rovno/slide-${String(n).padStart(2, '0')}-1600.webp`;
  if (kind === 'hub') return shell('og--text', `<div><h1>${T(C.hub.h1)}</h1><p>${T('Презентации и инфографика · Боты и автоматизация на Python')}</p></div>`);
  if (kind === 'design') return shell('', `<div><span class="kicker">${T(C.design.kicker)}</span><h1>${T(C.design.h1)}</h1></div><div class="deck-stack"><img class="deck-stack__back" src="${slide(6)}" alt=""><img class="deck-stack__front" src="${slide(1)}" alt=""></div>`);
  if (kind === 'dev') return shell('', `<div><span class="kicker">${T(C.dev.kicker)}</span><h1>${T(C.dev.h1)}</h1></div>${chatSnippet({ full: true })}`);
  // Телефон вырезан из постера видео (кадр 1600×900): телефон занимает x 585–1015, y 30–868.
  if (kind === 'mint') return shell('', `<div><span class="kicker">${T('Кейс · Демо-проект')}</span><h1>${T(C.mint.h1)}</h1><p>${T('Python · aiogram 3 · 37 тестов')}</p></div><div class="og__phone"><img src="${r}img/mint/poster-1600.webp" alt=""></div>`);
  // Телефон вырезан из вертикального постера (720×1280): телефон занимает x 96–624, y 150–1250.
  if (kind === 'leads') return shell('', `<div><span class="kicker">${T('Кейс · Демо-проект')}</span><h1>${T(C.leads.h1)}</h1><p>${T('Python · FastAPI · 70 тестов')}</p></div><div class="og__phone og__phone--v"><img src="${r}img/leads/poster-vertical.webp" alt=""></div>`);
  if (kind === 'polka') return shell('', `<div><span class="kicker">${T('Кейс · Демо-проект')}</span><h1>${T(C.polka.h1)}</h1><p>${T('Python · pandas · 114 тестов')}</p></div><div class="og__sheet"><img src="${r}img/polka/cover-1600.webp" alt=""></div>`);
  if (kind === 'kedr') return shell('', `<div><span class="kicker">${T('Кейс · Демо-проект')}</span><h1>${T('Карточки товара «Кедр»')}</h1><p>${T('8 карточек для Wildberries и Ozon · обработка фото')}</p></div><div class="og__cards"><img class="og__card og__card--back og__card--34" src="${r}img/kedr/card-07-1200.webp" alt=""><img class="og__card og__card--front og__card--34" src="${r}img/kedr/card-01-1200.webp" alt=""></div>`);
  if (kind === 'ai') return shell('', `<div><span class="kicker">${T('Кейс · Демо-проект')}</span><h1>${T('Карусель «ИИ в 2026»')}</h1><p>${T('8 карточек · реальные данные')}</p></div><div class="og__cards"><img class="og__card og__card--back" src="${r}img/ai/card-04-1080.webp" alt=""><img class="og__card og__card--front" src="${r}img/ai/card-01-1080.webp" alt=""></div>`);
  return shell('', `<div><span class="kicker">${T('Кейс · Демо-проект')}</span><h1>${T('Питч-дек «Ровно»')}</h1><p>${T('12 слайдов · PowerPoint и PDF')}</p></div><div class="og__cover"><img src="${slide(1)}" alt=""></div>`);
}

// ---------- проверка ссылок ----------
function checkLinks(file, html) {
  const missing = [];
  const dir = path.dirname(file);
  const refs = [...html.matchAll(/\b(?:href|src|poster)="([^"]+)"/g)].map((m) => m[1]);
  for (const m of html.matchAll(/\bsrcset="([^"]+)"/g)) refs.push(...m[1].split(',').map((s) => s.trim().split(/\s+/)[0]));
  for (const ref of refs) {
    if (/^(https?:|mailto:|tel:|#|data:|\/)/.test(ref)) continue;
    const clean = decodeURI(ref.split('#')[0].split('?')[0]);
    if (!clean) continue;
    let target = path.resolve(dir, clean);
    if (clean.endsWith('/') || clean === '.' || clean === './') target = path.join(target, 'index.html');
    if (!existsSync(target)) missing.push(ref);
  }
  return missing;
}

// ---------- сборка ----------
async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(path.join(OUT, 'assets'), { recursive: true });
  for (const d of ['fonts', 'css', 'js', 'img', 'video']) await cp(path.join(SRC, d), path.join(OUT, 'assets', d), { recursive: true });
  await cp(path.join(SRC, 'files'), path.join(OUT, 'files'), { recursive: true });
  for (const f of ['favicon.svg', 'apple-touch-icon.png']) if (existsSync(path.join(SRC, f))) await cp(path.join(SRC, f), path.join(OUT, f));

  const hash = createHash('sha1');
  hash.update(await readFile(path.join(SRC, 'css', 'site.css')));
  hash.update(await readFile(path.join(SRC, 'js', 'site.js')));
  ASSET_V = hash.digest('hex').slice(0, 8);

  const pages = [pageHub(), pageDirection('design'), pageDirection('dev'), await pageRovno(), await pageAi(), await pageKedr(), await pageMint(), await pageLeads(), await pagePolka()];
  for (const { page, html } of pages) {
    const file = path.join(OUT, page.path, 'index.html');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, html);
  }
  await writeFile(path.join(OUT, '404.html'), page404());
  let problems = 0;
  for (const { page, html } of pages) {
    const missing = checkLinks(path.join(OUT, page.path, 'index.html'), html);
    if (missing.length) { problems += missing.length; console.warn(`! ${page.path || '/'}: нет файлов ${missing.join(', ')}`); }
    console.log(`✓ ${page.path || '/'}`);
  }
  await writeFile(path.join(OUT, '.nojekyll'), '');
  const robots = ['User-agent: *', 'Allow: /'];
  if (SITE_URL) {
    const urls = pages.map(({ page }) => `  <url><loc>${SITE_URL}${page.path}</loc></url>`).join('\n');
    await writeFile(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
    robots.push(`Sitemap: ${SITE_URL}sitemap.xml`);
  } else {
    console.warn('! SITE_URL не задан: в превью ссылок не будет картинки, sitemap.xml не создан (см. README).');
  }
  await writeFile(path.join(OUT, 'robots.txt'), `${robots.join('\n')}\n`);

  if (MAKE_OG) {
    await mkdir(path.join(ROOT, 'og'), { recursive: true });
    for (const k of ['hub', 'design', 'dev', 'rovno', 'ai', 'kedr', 'mint', 'leads', 'polka']) await writeFile(path.join(ROOT, 'og', `${k}.html`), ogPage(k));
    console.log('✓ og/*.html');
  }
  console.log(`Готово: ${path.relative(ROOT, OUT) || '.'}${DRAFTS ? ' (с черновиками)' : ''}${problems ? `, проблем со ссылками: ${problems}` : ''}`);
  if (problems) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
