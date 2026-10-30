<script>
import { getContext } from 'svelte';

// Форма из модуля «Формы»: рисуется на каждом запросе, страница вокруг остаётся в кэше.
let { name } = $props();
const regions = getContext('cms:regions');
</script>

{@html regions?.module ? regions.module('Form', name) : ''}
