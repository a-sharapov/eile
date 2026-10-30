// Теги `{i18n.key}` и `[@key]` — для текста страниц и параметров компонентов. В шаблоне и компоненте
// переводы и свои настройки — обычные выражения `{site.i18n.key}` и `{site.custom.key}`; старый тег
// в разметке Svelte принял бы за своё выражение и упал бы при рендере, поэтому его ловим при сохранении.

const _I18N = /\{i18n\.\w/;
const _SETTING = /\[@\w/;

// Код и стили не проверяем: там такие строки могут быть по делу.
const _CODE =
  /(<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>)/g;

/** Есть ли в разметке теги ключей, которые в шаблоне не работают. */
export var hasKeyTags = (source: string): boolean =>
  source
    .split(_CODE)
    .some(
      (part, index) =>
        index % 2 === 0 && (_I18N.test(part) || _SETTING.test(part))
    );
