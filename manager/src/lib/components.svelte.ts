import { api } from './api.ts';
import type { ComponentSignature } from './types.ts';

// Каталог меняется только при правке компонентов: грузим один раз за сессию менеджера.
let _loading: Promise<ComponentSignature[]> | null = null;

export var catalog = $state<{ items: ComponentSignature[] | null }>({
  items: null,
});

export var loadCatalog = (force = false): Promise<ComponentSignature[]> =>
  (_loading =
    !force && _loading
      ? _loading
      : api
          .get<ComponentSignature[]>('/components')
          .then((_) => ((catalog.items = _), _))
          .catch((error) => ((_loading = null), Promise.reject(error))));
