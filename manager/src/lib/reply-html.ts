const _ESCAPE: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

// Ответ модели — с Markdown: жирный, код и списки. Сначала экранируем всё, потом размечаем своё —
// HTML из ответа (и из текста посетителей, который модель могла пересказать) не выполнится.
const _inline = (line: string): string =>
  line
    .replace(/[&<>"]/g, (_) => _ESCAPE[_]!)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

/** Разметка ответа агента: абзацы, списки «- » и «1. », жирный и код. */
export var replyHtml = (text: string): string =>
  text
    .trim()
    .split(/\n{2,}/)
    .map((block) =>
      ((lines) =>
        lines.every((_) => /^\s*(?:[-*]|\d+\.)\s+/.test(_))
          ? `<ul>${lines.map((_) => `<li>${_inline(_.replace(/^\s*(?:[-*]|\d+\.)\s+/, ''))}</li>`).join('')}</ul>`
          : `<p>${lines.map(_inline).join('<br>')}</p>`)(block.split('\n'))
    )
    .join('');
