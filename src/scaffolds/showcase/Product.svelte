<script>
import Breadcrumbs from '$components/Breadcrumbs';
import Cover from '$components/Cover';
import Layout from '$components/Layout';
import Modal from '$components/Modal';
import ModalButton from '$components/ModalButton';
import Price from '$components/Price';
import { site } from '$core';
import Content from '$core/Content';

let { page } = $props();

const fields = $derived(page.fields);
const name = $derived(page.longTitle || page.title);
// Окно заказа показывает текст скрытой страницы «Запрос»: в нём форма, её правят в менеджере.
const request = Number(site().custom.request) || null;
</script>

<Layout {page}>
  <Breadcrumbs />
  <div class="product">
    <div class="media">
      <Cover
        title={page.menuTitle || page.title}
        src={fields.cover}
        ratio="4/5"
        sizes="(min-width: 64rem) 38rem, 100vw"
        eager
      />
    </div>
    <div class="buy">
      {#if fields.badge}<span class="badge">{fields.badge}</span>{/if}
      <h1>{name}</h1>
      {#if fields.sku}<p class="sku">Артикул {fields.sku}</p>{/if}
      <Price price={fields.price} old={fields.oldPrice} size="lg" />
      <p class="stock" class:made={fields.inStock === false}>
        {fields.inStock === false ? 'Под заказ — от двух недель' : 'Есть в мастерской'}
      </p>
      {#if page.introText}<p class="lead">{page.introText}</p>{/if}
      {#if request}
        <ModalButton modal="request" text={fields.price ? 'Заказать' : 'Узнать цену'} />
        <p class="note">Оставьте телефон — мастер перезвонит и расскажет о сроках и доставке.</p>
      {/if}
    </div>
  </div>
  <div class="prose details"><Content of={page} /></div>
  {#if request}<Modal id="request" title={name} source={request} size="sm" />{/if}
</Layout>

<style>
  .product {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: 4rem;
    align-items: start;
    margin: 1.5rem 0 4rem;
  }

  .buy {
    position: sticky;
    top: 2rem;
    display: grid;
    justify-items: start;
    gap: 1rem;
  }

  .badge {
    padding: 0.25rem 0.75rem;
    border-radius: 999rem;
    background: var(--t-tint, var(--t-hover));
    color: var(--t-accent);
    font-size: 0.8125rem;
    font-weight: 650;
  }

  h1 {
    margin: 0;
    font-size: clamp(2rem, 1.5rem + 2vw, 3rem);
    line-height: 1.05;
  }

  .sku {
    margin: -0.5rem 0 0;
    color: var(--t-muted);
    font-size: 0.875rem;
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
    background: #3d7a4f;
  }

  .made::before {
    background: #b07a1c;
  }

  .lead {
    margin: 0.5rem 0;
    font-size: 1.125rem;
    line-height: 1.55;
  }

  .buy :global(.open) {
    min-height: 3rem;
    padding: 0 1.75rem;
    border-radius: 999rem;
  }

  .note {
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
      gap: 2rem;
    }

    .buy {
      position: static;
    }
  }
</style>
