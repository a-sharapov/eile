<script lang="ts">
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';

// Плагины — в дереве «Элементы»; отдельного списка нет.
void goto(resolve('/(app)/elements'), { replace: true });
</script>
