<script>
import Layout from '$components/Layout';
import ModalButton from '$components/ModalButton';
import PageHead from '$components/PageHead';
import Content from '$core/Content';
import Form from '$core/Form';

let { page } = $props();

const money = new Intl.NumberFormat('ru-RU');
const price = $derived(
  typeof page.fields.priceFrom === 'number' && page.fields.priceFrom > 0
    ? `от ${money.format(page.fields.priceFrom)} ₽`
    : null
);
</script>

<Layout {page}>
  <PageHead title={page.longTitle || page.title} lead={page.introText}>
    {#if price || page.fields.term}
      <dl class="terms">
        {#if price}
          <div><dt>Стоимость</dt><dd>{price}</dd></div>
        {/if}
        {#if page.fields.term}
          <div><dt>Сроки</dt><dd>{page.fields.term}</dd></div>
        {/if}
      </dl>
    {/if}
  </PageHead>
  <div class="wrap">
    <div class="prose"><Content of={page} /></div>
    <section class="request" aria-labelledby="request-title">
      <h2 id="request-title">Заявка на услугу</h2>
      <p>Опишите объект в паре фраз — инженер перезвонит и уточнит детали.</p>
      <Form name="request" />
      <p class="or">Удобнее голосом? <ModalButton modal="callback" text="Заказать звонок" variant="link" /></p>
    </section>
  </div>
</Layout>

<style>
  .wrap {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 26rem);
    align-items: start;
    gap: 3rem 5rem;
    width: var(--page);
    margin: 3.5rem auto 0;
  }

  .terms {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem 3rem;
    margin: 2rem 0 0;
  }

  dt {
    color: var(--t-muted);
    font-size: 0.875rem;
  }

  dd {
    margin: 0.125rem 0 0;
    font-size: 1.25rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }

  .request {
    position: sticky;
    top: 6rem;
    padding: 2rem;
    border: 0.0625rem solid var(--t-border);
    border-radius: 0.75rem;
    box-shadow: 0 1rem 2.5rem rgb(15 26 43 / 0.06);
  }

  h2 {
    margin: 0;
    font-size: 1.375rem;
  }

  .request > p {
    margin: 0.5rem 0 1.5rem;
    color: var(--t-muted);
    font-size: 0.9375rem;
  }

  .request > .or {
    margin: 1.5rem 0 0;
  }

  @media (max-width: 60rem) {
    .wrap {
      grid-template-columns: 1fr;
    }

    .request {
      position: static;
      padding: 1.5rem;
    }
  }
</style>
