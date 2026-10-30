<script lang="ts">
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';

$effect(() => void goto(resolve('/(app)/pages'), { replace: true }));
</script>
