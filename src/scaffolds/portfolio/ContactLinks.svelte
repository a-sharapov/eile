<!-- @component
Почта и Telegram крупно — из своих настроек сайта email и telegram.
-->
<script lang="ts">
import { site } from '$core';

let {
  /** Подпись над почтой */
  emailLabel = 'Почта',
  /** Подпись над Telegram */
  telegramLabel = 'Telegram',
}: { emailLabel?: string; telegramLabel?: string } = $props();

const custom = site().custom;
const telegram = custom.telegram.replace(/^@/, '');
</script>

<dl class="links">
  <div>
    <dt>{emailLabel}</dt>
    <dd><a href="mailto:{custom.email}">{custom.email}</a></dd>
  </div>
  <div>
    <dt>{telegramLabel}</dt>
    <dd><a href="https://t.me/{telegram}">@{telegram}</a></dd>
  </div>
</dl>

<style>
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem 4rem;
    margin: 2.5rem 0 4rem;
  }

  dt {
    color: var(--t-muted, #5b5852);
    font-size: 0.9375rem;
  }

  dd {
    margin: 0.25rem 0 0;
    font-size: clamp(1.5rem, 1rem + 2vw, 2.5rem);
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.025em;
    overflow-wrap: anywhere;
  }

  a {
    text-decoration: none;
  }
</style>
