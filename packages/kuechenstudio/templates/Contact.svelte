<script lang="ts">
import Booking from '$components/Booking';
import Layout from '$components/Layout';
import PageHead from '$components/PageHead';
import Picture from '$components/Picture';
import Content from '$core/Content';

let { page } = $props();

const photo = $derived(
  typeof page.fields.photo === 'string' ? page.fields.photo : ''
);
</script>

<Layout {page}>
  <PageHead title={page.longTitle || page.title} lead={page.introText} />
  <div class="form-area">
    <Booking heading="" />
  </div>
  <div class="container more">
    <div class="prose"><Content of={page} /></div>
    <div class="aside">
      <Picture path={photo} focus={page.fields.photoFocus} shape="card" collapse sizes="(min-width: 56rem) 30rem, 100vw" />
    </div>
  </div>
</Layout>

<style>
  .form-area {
    margin-top: clamp(3rem, 2rem + 3vw, 5rem);
  }

  .more {
    display: grid;
    grid-template-columns: minmax(0, 40rem) minmax(0, 30rem);
    justify-content: space-between;
    align-items: start;
    gap: 2.5rem 4rem;
    margin-top: clamp(3.5rem, 2.5rem + 3vw, 5.5rem);
  }

  .prose :global(> :first-child) {
    margin-top: 0;
  }

  @media (max-width: 56rem) {
    .more {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
