<script lang="ts">
  import type { Character } from '../types';

  let { character, onOpen, selectMode = false, selected = false, onToggleSelect, onDownload }: {
    character: Character;
    onOpen: (id: string) => void;
    selectMode?: boolean;
    selected?: boolean;
    onToggleSelect?: (id: string) => void;
    onDownload?: (character: Character) => void;
  } = $props();

  function handleDownloadClick(e: MouseEvent) {
    e.stopPropagation();
    onDownload?.(character);
  }
</script>

{#snippet cardImage()}
  <span
    class="relative block overflow-hidden bg-zinc-800"
    style={`aspect-ratio: ${character.width ?? 4} / ${character.height ?? 3}`}
  >
    <img
      src={character.image}
      alt={character.name}
      width={character.width}
      height={character.height}
      loading="lazy"
      decoding="async"
      class="block h-auto w-full transition-transform duration-300 ease-out motion-safe:group-hover:scale-[1.02] motion-safe:group-focus-within:scale-[1.02] motion-reduce:transition-none"
    />
    <span
      class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4 pt-12 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
      aria-hidden="true"
    >
      <span class="block text-sm font-medium text-white">{character.name}</span>
    </span>
  </span>
{/snippet}

<figure class="group relative mb-4 break-inside-avoid overflow-hidden rounded-xl">
  {#if selectMode}
    <label class="selection-card relative block w-full cursor-pointer overflow-hidden rounded-xl">
      {@render cardImage()}
      <span class="absolute top-2 left-2 flex rounded bg-black p-1">
        <input
          type="checkbox"
          checked={selected}
          onchange={() => onToggleSelect?.(character.id)}
          data-character-id={character.id}
          class="h-5 w-5 cursor-pointer accent-selection"
          aria-label={`Select ${character.name}`}
        />
      </span>
    </label>
  {:else}
    <button
      type="button"
      class="browse-card relative block w-full overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      aria-label={character.name}
      onclick={() => onOpen(character.id)}
    >
      {@render cardImage()}
    </button>
    <button
      type="button"
      onclick={handleDownloadClick}
      class="absolute top-2 right-2 z-10 rounded-lg bg-black/50 p-2 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:bg-black focus-visible:ring-2 focus-visible:ring-accent/50 motion-reduce:transition-none"
      aria-label={`Download ${character.name}`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    </button>
  {/if}

  {#if character.description}
    <figcaption class="sr-only">{character.description}</figcaption>
  {/if}
</figure>

<style>
  /* A two-tone inset remains visible over both light and dark artwork. */
  .selection-card:has(input:focus-visible)::after,
  .browse-card:focus-visible::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 3px var(--color-white), inset 0 0 0 6px var(--color-black);
    pointer-events: none;
  }
</style>
