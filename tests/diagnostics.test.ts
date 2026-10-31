import { afterEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { SCAFFOLDS } from '../src/scaffolds/index.ts';
import { DEMO } from './fixtures/demo.ts';

let app: App;

afterEach(() => app?.close());

const ids = (): string[] =>
  app.diagnostics.report(true).findings.map((_) => _.id);

const finding = (id: string) =>
  app.diagnostics.report(true).findings.find((_) => _.id === id);

const pageId = (path: string): number => app.content.published.byPath(path)!.id;

describe('диагностика на свежих каркасах', () => {
  it.each(SCAFFOLDS.map((_) => [_.name, _] as const))(
    '%s: ни битых ссылок, ни потерянных страниц, ни ошибок',
    (_name, scaffold) => {
      app = createApp({ scaffold });
      const report = app.diagnostics.report();
      expect(report.findings.filter((_) => _.severity === 'error')).toEqual([]);
      expect(
        report.findings.filter(
          (_) => _.group === 'links' || _.id === 'pages.orphans'
        )
      ).toEqual([]);
    }
  );
});

describe('находки', () => {
  it('ссылки: в никуда, на корзину, на черновик, через переадресацию', () => {
    app = createApp({ scaffold: DEMO });
    const home = app.site.settings.get().homePageId!;
    const about = pageId('/o-proekte');
    const contacts = pageId('/kontakty');
    app.content.pages.edit(about, { alias: 'about' });
    app.redirects.rules.create({ from: '/promo', to: '/blog' });
    app.content.pages.edit(home, {
      content: `<p><a href="/nope">a</a> <a href="[~${contacts}~]">b</a>
        <a href="/o-proekte">c</a> <a href="/promo?x=1">d</a> <img src="/media/none.png">
        <a href="/blog/page-2">e</a> <a href="https://example.com">f</a> <a href="#top">g</a></p>`,
    });
    app.content.pages.unpublish(contacts);
    expect(finding('links.broken')?.items.map((_) => _.detail)).toEqual([
      '/nope',
      '/media/none.png',
    ]);
    expect(finding('links.unpublished')?.items).toEqual([
      {
        label: 'Главная',
        detail: `[~${contacts}~]`,
        fix: { href: `/pages/${home}` },
      },
    ]);
    expect(finding('links.redirected')?.items.map((_) => _.detail)).toEqual([
      '/o-proekte',
      '/promo?x=1',
    ]);
    app.content.pages.trash(contacts);
    expect(finding('links.broken')?.items.map((_) => _.detail)).toContain(
      `[~${contacts}~]`
    );
  });

  it('страницы: одинаковые заголовки, потерянная страница, нет 404, длинный заголовок', () => {
    app = createApp({ scaffold: DEMO });
    const lost = app.content.pages.create({
      title: 'Контакты',
      alias: 'kontakty-2',
      longTitle:
        'Очень длинный заголовок страницы, который поисковик обязательно обрежет в выдаче',
      template: 'Base',
      description: 'Есть',
      hiddenFromMenu: true,
      publish: true,
    });
    expect(finding('pages.orphans')?.items.map((_) => _.fix?.href)).toEqual([
      `/pages/${lost}`,
    ]);
    expect(finding('pages.long_title')?.severity).toBe('info');
    app.content.pages.edit(lost, { longTitle: '' });
    expect(finding('pages.duplicate_titles')?.count).toBe(2);
    app.site.settings.update({ notFoundPageId: null });
    expect(ids()).toContain('settings.no_404');
  });

  it('медиа: картинка без описания и тяжёлая без уменьшенных копий', () => {
    app = createApp({ scaffold: DEMO });
    app.media.files.save({
      path: 'photos/big.jpg',
      data: new Uint8Array(1_200_000),
    });
    app.media.files.save({
      path: 'photos/ok.jpg',
      data: new Uint8Array(10),
    });
    app.media.files.describe('photos/ok.jpg', 'Чашка чая');
    expect(finding('media.no_alt')?.items).toEqual([
      {
        label: 'photos/big.jpg',
        fix: { href: '/media?file=photos%2Fbig.jpg' },
      },
    ]);
    expect(finding('media.heavy')?.items[0]).toMatchObject({
      label: 'photos/big.jpg',
      detail: '1,1 МБ',
    });
  });

  it('настройки: robots закрывает сайт, формы без каналов, ИИ-поиск выключен', () => {
    app = createApp({ scaffold: DEMO });
    app.site.settings.update({
      robots:
        'User-agent: Yandex\nDisallow: /tmp\n\nUser-agent: *\nDisallow: /\n',
      aiSearch: false,
    });
    app.forms.forms.save('callback', {
      title: 'Звонок',
      source: '<input name="phone" required>',
    });
    expect(finding('settings.robots_block')?.severity).toBe('error');
    expect(finding('settings.forms_silent')?.items).toEqual([
      { label: 'Форма «Звонок»', fix: { href: '/forms/callback' } },
    ]);
    expect(finding('settings.ai_search_off')?.severity).toBe('info');
    app.site.settings.update({ robots: 'User-agent: *\nDisallow: /search' });
    expect(ids()).not.toContain('settings.robots_block');
  });
});

describe('отчёт', () => {
  it('держится до события сайта, «Обновить» считает заново', () => {
    app = createApp({ scaffold: DEMO });
    const first = app.diagnostics.report();
    expect(app.diagnostics.report()).toBe(first);
    app.content.pages.edit(pageId('/kontakty'), { description: '' });
    expect(app.diagnostics.report()).not.toBe(first);
    const second = app.diagnostics.report();
    expect(app.diagnostics.report(true)).not.toBe(second);
  });

  it('свои проверки регистрируются, упавшая — тоже находка, число проблем без info', () => {
    app = createApp({ scaffold: DEMO });
    app.diagnostics.register({
      id: 'backups',
      run: () => [
        {
          id: 'server.no_backups',
          group: 'server',
          severity: 'warning',
          title: 'Автокопии выключены',
          hint: 'Включите в настройках.',
          items: [{ label: 'Копии', fix: { href: '/settings?tab=backups' } }],
          count: 1,
        },
      ],
    });
    app.diagnostics.register({
      id: 'https',
      run: () => {
        throw new Error('нет сертификата');
      },
    });
    const report = app.diagnostics.report();
    // Группа «сервер» — последней; в ней ошибка раньше предупреждения.
    expect(report.findings.slice(-2).map((_) => _.id)).toEqual([
      'check.failed.https',
      'server.no_backups',
    ]);
    expect(report.findings.at(-2)).toMatchObject({
      id: 'check.failed.https',
      severity: 'error',
      hint: 'нет сертификата',
    });
    expect(report.problems).toBe(
      report.findings
        .filter((_) => _.severity !== 'info')
        .reduce((sum, _) => sum + _.count, 0)
    );
  });

  it('тысяча страниц со ссылками — быстрее 200 мс', () => {
    app = createApp({ scaffold: DEMO });
    const blog = pageId('/blog');
    const text = `<p>${'Текст страницы. '.repeat(200)}</p><a href="/blog">в блог</a> <a href="[~${blog}~]">ещё</a> <a href="/nope">x</a>`;
    Array.from({ length: 1000 }, (_, n) =>
      app.content.pages.create({
        parentId: blog,
        title: `Запись ${n}`,
        template: 'Base',
        content: text,
        hiddenFromMenu: true,
        publish: true,
      })
    );
    const report = app.diagnostics.report(true);
    expect(report.tookMs).toBeLessThan(200);
    expect(report.findings.find((_) => _.id === 'links.broken')?.count).toBe(
      1000
    );
  });
});
