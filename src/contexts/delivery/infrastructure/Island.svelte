<script>
import { getContext } from 'svelte';

let { name, props = {} } = $props();
const regions = getContext('cms:regions');
</script>

{@html regions ? regions.island(name, props) : ''}
