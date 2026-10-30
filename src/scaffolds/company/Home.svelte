<script>
import Layout from '$components/Layout';
import ModalButton from '$components/ModalButton';
import { site as settings } from '$core';
import Content from '$core/Content';

let { page } = $props();

const site = settings();
const phone = site.custom.phone;
const tel = `tel:${phone.replace(/[^\d+]/g, '')}`;
</script>

<Layout {page}>
  <section class="hero">
    <div class="wrap">
      <div class="pitch">
        <h1>{page.longTitle || page.title}</h1>
        {#if page.introText}<p class="lead">{page.introText}</p>{/if}
        <div class="actions">
          <ModalButton modal="callback" text="Заказать звонок" />
          <a class="secondary" href="#services">Услуги и цены</a>
        </div>
      </div>
      <aside class="reach" aria-label="Связаться">
        <p>Позвоните — ответит инженер, а не колл-центр</p>
        <a class="phone" href={tel}>{phone}</a>
        <p class="hours">{site.custom.hours}</p>
      </aside>
    </div>
  </section>

  <div class="wrap prose sections"><Content of={page} /></div>

  <section class="cta" data-band>
    <div class="wrap">
      <h2>Расскажите о задаче — перезвоним</h2>
      <p>Уточним, что за объект и что нужно сделать, назовём сроки и стоимость выезда инженера.</p>
      <div class="actions">
        <ModalButton modal="callback" text="Заказать звонок" variant="secondary" />
        <a class="phone" href={tel}>{phone}</a>
      </div>
    </div>
  </section>
</Layout>

<style>
  .wrap {
    width: var(--page);
    margin-inline: auto;
  }

  .hero {
    padding: clamp(3.5rem, 2rem + 6vw, 7rem) 0 clamp(3rem, 2rem + 4vw, 5.5rem);
    border-bottom: 0.0625rem solid var(--t-border);
  }

  .hero .wrap {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 20rem;
    align-items: end;
    gap: 3rem 5rem;
  }

  h1 {
    max-width: 50rem;
    margin: 0;
    font-size: clamp(2.375rem, 1.5rem + 3.6vw, 4.25rem);
    line-height: 1.04;
    letter-spacing: -0.035em;
  }

  .lead {
    max-width: 38rem;
    margin: 1.5rem 0 0;
    color: var(--t-muted);
    font-size: clamp(1.125rem, 1rem + 0.4vw, 1.3125rem);
    line-height: 1.55;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1.5rem;
    margin-top: 2.25rem;
  }

  .secondary {
    font-weight: 600;
    text-decoration: none;
  }

  .secondary:hover {
    text-decoration: underline;
  }

  .reach {
    padding: 1.5rem 0 0.25rem 1.75rem;
    border-left: 0.0625rem solid var(--t-border);
  }

  .reach p {
    margin: 0;
    color: var(--t-muted);
    font-size: 0.9375rem;
  }

  .reach .phone {
    display: block;
    margin: 0.5rem 0 0.25rem;
    color: var(--t-text);
    font-size: 1.625rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    text-decoration: none;
    white-space: nowrap;
  }

  .reach .phone:hover {
    color: var(--t-accent);
  }

  /* Разделы главной — в тексте страницы: заголовок раздела отделён воздухом. */
  .sections :global(h2) {
    margin-top: 5.5rem;
  }

  .cta {
    margin-top: 7rem;
    padding: clamp(3rem, 2rem + 4vw, 5rem) 0;
    background: var(--accent);
    color: #fff;
  }

  .cta h2 {
    max-width: 40rem;
    margin: 0;
    font-size: clamp(1.75rem, 1.3rem + 1.8vw, 2.625rem);
    line-height: 1.12;
  }

  .cta p {
    max-width: 36rem;
    margin: 1rem 0 0;
    color: #d7e0f2;
    font-size: 1.125rem;
  }

  .cta .phone {
    color: #fff;
    font-size: 1.25rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    text-decoration: none;
  }

  .cta .phone:hover {
    text-decoration: underline;
  }

  .cta :global(:focus-visible) {
    outline-color: #fff;
  }

  @media (max-width: 56rem) {
    .hero .wrap {
      grid-template-columns: 1fr;
      gap: 2.5rem;
    }

    .reach {
      padding: 1.25rem 0 0;
      border-top: 0.0625rem solid var(--t-border);
      border-left: 0;
    }
  }
</style>
