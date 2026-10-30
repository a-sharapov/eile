<script>
import Breadcrumbs from '$components/Breadcrumbs';
import Cover from '$components/Cover';
import Layout from '$components/Layout';
import Price from '$components/Price';
import { link, site } from '$core';
import Content from '$core/Content';
import Island from '$core/Island';

let { page } = $props();

const fields = $derived(page.fields);
const custom = site().custom;
const cart = link(Number(custom.cart)) ?? '';
</script>

<Layout {page}>
  <Breadcrumbs />
  <div class="product">
    <div class="media">
      <Cover
        title={page.menuTitle || page.title}
        src={fields.cover}
        ratio="1/1"
        sizes="(min-width: 64rem) 38rem, 100vw"
        eager
      />
    </div>
    <div class="buy">
      {#if fields.badge}<span class="badge">{fields.badge}</span>{/if}
      <h1>{page.longTitle || page.title}</h1>
      {#if page.introText}<p class="lead">{page.introText}</p>{/if}
      <Price price={fields.price} old={fields.oldPrice} size="lg" />
      <p class="stock" class:out={fields.inStock === false}>
        {fields.inStock === false ? 'Нет в наличии' : 'В наличии, отправим за 1–2 дня'}
      </p>
      <Island
        name="AddToCart"
        props={{
          id: page.id,
          title: page.longTitle || page.title,
          price: fields.price,
          url: link(page.id) ?? '',
          cartUrl: cart,
          available: fields.inStock !== false,
        }}
      />
      {#if fields.sku}<p class="sku">Артикул {fields.sku}</p>{/if}
    </div>
  </div>
  <div class="prose details"><Content of={page} /></div>
</Layout>

<style>
  .product {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 3.5rem;
    align-items: start;
    margin: 1.25rem 0 3.5rem;
  }

  .buy {
    position: sticky;
    top: 6.5rem;
    display: grid;
    justify-items: start;
    gap: 1rem;
  }

  .badge {
    padding: 0.25rem 0.625rem;
    border-radius: 999rem;
    background: var(--badge);
    color: var(--badge-ink);
    font-size: 0.8125rem;
    font-weight: 700;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.875rem, 1.4rem + 1.8vw, 2.625rem);
    line-height: 1.08;
  }

  .lead {
    margin: 0;
    color: var(--t-muted);
    font-size: 1.125rem;
    line-height: 1.5;
  }

  .stock {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-size: 0.9375rem;
  }

  .stock::before {
    content: '';
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: #2f8a5b;
  }

  .stock.out::before {
    background: #a3a9a5;
  }

  .sku {
    margin: 0;
    color: var(--t-muted);
    font-size: 0.875rem;
  }

  .details {
    padding-top: 2.5rem;
    border-top: 0.0625rem solid var(--t-border);
  }

  @media (max-width: 56rem) {
    .product {
      grid-template-columns: 1fr;
      gap: 1.75rem;
    }

    .buy {
      position: static;
    }
  }
</style>
