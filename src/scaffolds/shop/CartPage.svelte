<script>
import Layout from '$components/Layout';
import { link, site } from '$core';
import Content from '$core/Content';
import Island from '$core/Island';

let { page } = $props();

const custom = site().custom;
const catalog = link(Number(custom.catalog)) ?? '/';
</script>

<Layout {page}>
  <h1>{page.longTitle || page.title}</h1>
  <div class="layout">
    <section class="lines" aria-label="Товары в корзине">
      <Island name="Cart" props={{ currency: custom.currency, catalogUrl: catalog, form: 'order' }} />
    </section>
    <!-- Остров Cart прячет этот блок, пока корзина пуста, и пишет состав заказа в поле формы. -->
    <section class="checkout prose" data-checkout>
      <Content of={page} />
    </section>
  </div>
</Layout>

<style>
  h1 {
    margin: 0 0 2rem;
    font-size: clamp(2rem, 1.5rem + 2vw, 2.75rem);
    line-height: 1.1;
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: 3.5rem;
    align-items: start;
  }

  .checkout {
    padding: 2rem;
    border-radius: 0.75rem;
    background: var(--t-surface);
    box-shadow: 0 0.0625rem 0.125rem rgb(19 52 38 / 0.06), 0 0.75rem 2rem rgb(19 52 38 / 0.06);
  }

  .checkout[hidden] {
    display: none;
  }

  .checkout :global(h2:first-child) {
    margin-top: 0;
  }

  @media (max-width: 60rem) {
    .layout {
      grid-template-columns: 1fr;
      gap: 2rem;
    }

    .checkout {
      padding: 1.5rem;
    }
  }
</style>
