import { describe, expect, it } from 'bun:test';
import type { ElementName } from '../domain/element.ts';
import { describeComponent } from './svelte-signature.ts';

const describe_ = (source: string) =>
  describeComponent({ name: 'Gallery' as ElementName, source });

describe('сигнатура компонента', () => {
  it('описание из @component, параметры с типами, подписями и умолчаниями', () => {
    expect(
      describe_(`<!-- @component
Галерея из папки медиатеки.
-->
<script lang="ts">
let {
  /** Папка медиатеки */
  folder,
  columns = 3,
  // Во всю ширину
  wide = false,
  shift = -1.5,
  caption = null,
  children,
}: { folder: string; columns?: number; wide?: boolean; caption?: string | null } = $props();
</script>
<div>{folder}</div>`)
    ).toEqual({
      name: 'Gallery' as ElementName,
      description: 'Галерея из папки медиатеки.',
      props: [
        {
          name: 'folder',
          type: 'string',
          label: 'Папка медиатеки',
          defaultValue: null,
          required: true,
          options: [],
        },
        {
          name: 'columns',
          type: 'number',
          label: 'columns',
          defaultValue: 3,
          required: false,
          options: [],
        },
        {
          name: 'wide',
          type: 'boolean',
          label: 'Во всю ширину',
          defaultValue: false,
          required: false,
          options: [],
        },
        {
          name: 'shift',
          type: 'number',
          label: 'shift',
          defaultValue: -1.5,
          required: false,
          options: [],
        },
        {
          name: 'caption',
          type: 'string',
          label: 'caption',
          defaultValue: null,
          required: false,
          options: [],
        },
      ],
    });
  });

  it('объединение литералов даёт варианты с подписями из комментария, `number | null` — число', () => {
    const { props } = describe_(
      "<script lang=\"ts\">\nlet {\n  /** Оттенок: info=Заметка, warning=Внимание */\n  tone = 'info',\n  parent = null,\n}: { tone?: 'info' | 'warning' | 'error'; parent?: number | null } = $props();\n</script>"
    );
    expect(props.map((_) => [_.name, _.type, _.label, _.options])).toEqual([
      [
        'tone',
        'string',
        'Оттенок',
        [
          { value: 'info', label: 'Заметка' },
          { value: 'warning', label: 'Внимание' },
          { value: 'error', label: 'error' },
        ],
      ],
      ['parent', 'number', 'parent', []],
    ]);
  });

  it('без TypeScript тип берётся из умолчания, сложные умолчания пропускаются', () => {
    expect(
      describe_(
        '<script>\nlet { parent = null, items = [], title = "Меню" } = $props();\n</script>'
      ).props.map((_) => [_.name, _.type])
    ).toEqual([
      ['parent', 'string'],
      ['title', 'string'],
    ]);
  });

  it('без $props и с ошибкой в исходнике — пустая сигнатура', () => {
    expect(describe_('<p>Просто разметка</p>')).toEqual({
      name: 'Gallery' as ElementName,
      description: '',
      props: [],
    });
    expect(describe_('<script>let {</script>').props).toEqual([]);
  });
});
