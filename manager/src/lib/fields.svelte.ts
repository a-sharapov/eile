import { api } from './api.ts';
import type { Field } from './types.ts';

export var fields = $state<{ items: Field[] }>({ items: [] });

export var loadFields = (): Promise<Field[]> =>
  api.get<Field[]>('/fields').then((_) => ((fields.items = _), _));
