<!-- @component
ИИ-помощник: настоящее окно запроса в редакторе шаблона, три шага, что он умеет и как подключаются агенты.
-->
<script lang="ts">
import Shot from '$components/Shot';
import { current, site } from '$core';

const t = site().i18n;
// Снимок менеджера на языке страницы.
const shot = current()?.language === 'en' ? 'ai-en' : 'ai';

const steps = [t.aiStep1, t.aiStep2, t.aiStep3];
const facts = [
  [t.aiWrites, t.aiWritesText],
  [t.aiKnows, t.aiKnowsText],
  [t.aiModel, t.aiModelText],
  [t.aiAgents, t.aiAgentsText],
];
</script>

<div class="ai">
  <figure class="screen">
    <Shot
      name={shot}
      alt={t.aiShot}
      title={t.winManager}
      sizes="(min-width: 80rem) 43rem, (min-width: 60rem) calc(54.6vw - 1.2rem), calc(94vw - 1rem)"
    />
  </figure>
  <div class="how">
    <ol class="steps">
      {#each steps as step}<li>{step}</li>{/each}
    </ol>
    <dl class="facts">
      {#each facts as { 0: term, 1: text }}
        <div>
          <dt>{term}</dt>
          <dd>{text}</dd>
        </div>
      {/each}
    </dl>
  </div>
</div>

<style>
  .ai {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
    gap: clamp(2rem, 1rem + 3vw, 4rem);
    align-items: start;
    width: min(100% - 2 * var(--gutter), var(--wide));
    margin: 3rem auto 0;
  }

  .screen {
    margin: 0;
  }

  .steps {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.9rem;
    margin: 0 0 2.25rem;
    padding: 0;
    list-style: none;
    counter-reset: step;
  }

  .steps li {
    position: relative;
    padding-left: 2.75rem;
    font-size: 1.0625rem;
    line-height: 1.5;
    counter-increment: step;
  }

  .steps li::before {
    content: counter(step);
    position: absolute;
    left: 0;
    top: -0.05rem;
    display: grid;
    place-items: center;
    width: 1.85rem;
    height: 1.85rem;
    border-radius: 50%;
    background: var(--fill);
    color: var(--on-fill);
    font: 650 0.875rem/1 var(--sans);
  }

  .facts {
    display: grid;
    gap: 1.25rem;
    margin: 0;
    padding-top: 1.75rem;
    border-top: 1px solid var(--line);
  }

  dt {
    font: 600 1.0625rem/1.35 var(--sans);
  }

  dd {
    margin: 0.3rem 0 0;
    color: var(--muted);
    font-size: 0.9375rem;
    line-height: 1.55;
  }

  @media (max-width: 60rem) {
    .ai {
      grid-template-columns: minmax(0, 1fr);
    }

    .facts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 36rem) {
    .facts {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
