<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fade } from 'svelte/transition';
  import type { Character } from '../types';
  import MasonryItem from './MasonryItem.svelte';

  let { characters, animate = true, onOpen, selectMode = false, selectedIds = [], onToggleSelect, onDownload }: {
    characters: Character[];
    animate?: boolean;
    onOpen: (id: string) => void;
    selectMode?: boolean;
    selectedIds?: string[];
    onToggleSelect?: (id: string) => void;
    onDownload?: (character: Character) => void;
  } = $props();

  // Read reduced motion preference once
  const reduceMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  let flipDuration = $derived(animate && !reduceMotion ? 260 : 0);
  let fadeDurationIn = $derived(animate && !reduceMotion ? 160 : 0);
  let fadeDurationOut = $derived(animate && !reduceMotion ? 140 : 0);
</script>

{#if characters.length === 0}
  <p class="col-span-full text-center text-zinc-500 py-16">No characters yet. Add one above!</p>
{:else}
  <div class="columns-[14rem] gap-4 sm:columns-[16rem] lg:columns-[18rem]">
    {#each characters as char (char.id)}
      <div
        animate:flip={{ duration: flipDuration }}
        in:fade={{ duration: fadeDurationIn }}
        out:fade={{ duration: fadeDurationOut }}
      >
        <MasonryItem
          character={char}
          onOpen={onOpen}
          selectMode={selectMode}
          selected={selectedIds.includes(char.id)}
          onToggleSelect={onToggleSelect}
          onDownload={onDownload}
        />
      </div>
    {/each}
  </div>
{/if}
