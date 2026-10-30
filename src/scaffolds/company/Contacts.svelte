<script>
import Layout from '$components/Layout';
import PageHead from '$components/PageHead';
import { site as settings } from '$core';
import Content from '$core/Content';

let { page } = $props();

const site = settings();
const phone = site.custom.phone;
</script>

<Layout {page}>
  <PageHead title={page.longTitle || page.title} lead={page.introText} />
  <div class="wrap">
    <dl class="details">
      <div>
        <dt>Телефон</dt>
        <dd class="big"><a href="tel:{phone.replace(/[^\d+]/g, '')}">{phone}</a></dd>
      </div>
      <div>
        <dt>Почта</dt>
        <dd><a href="mailto:{site.custom.email}">{site.custom.email}</a></dd>
      </div>
      <div>
        <dt>Адрес</dt>
        <dd>{site.custom.address}</dd>
      </div>
      <div>
        <dt>Часы работы</dt>
        <dd>{site.custom.hours}</dd>
      </div>
    </dl>
    <div class="prose"><Content of={page} /></div>
  </div>
</Layout>

<style>
  .wrap {
    display: grid;
    grid-template-columns: minmax(0, 20rem) minmax(0, 1fr);
    gap: 3rem 6rem;
    width: var(--page);
    margin: 3.5rem auto 0;
  }

  .details {
    display: grid;
    align-content: start;
    gap: 1.75rem;
    margin: 0;
  }

  dt {
    color: var(--t-muted);
    font-size: 0.875rem;
  }

  dd {
    margin: 0.25rem 0 0;
    font-size: 1.0625rem;
  }

  dd a {
    color: var(--t-text);
    text-decoration: none;
  }

  dd a:hover {
    color: var(--t-accent);
  }

  .big {
    font-size: 1.625rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  .prose :global(h2:first-child) {
    margin-top: 0;
  }

  @media (max-width: 52rem) {
    .wrap {
      grid-template-columns: 1fr;
    }
  }
</style>
