<script lang="ts">

  import { tick } from 'svelte';
  import type { Character } from '../types';
  import { downloadCharacterImage } from '../download';
  import { PAGE_SIZE, filterAndSortCharacters, type SortMode } from '../gallery-utils';
  import GalleryToolbar from './GalleryToolbar.svelte';
  import MasonryGrid from './MasonryGrid.svelte';
  import Lightbox from './Lightbox.svelte';

  let { characters, onEdit, onDelete, onDeleteMany }: {
    characters: Character[];
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    onDeleteMany: (ids: string[]) => Promise<boolean>;
  } = $props();

  // Search and sort state
  let searchTerm = $state('');
  let sortMode = $state<SortMode>('newest');

  // Selected character for lightbox
  let selectedCharacter: Character | null = $state(null);

  // Batch selection state
  let selectMode = $state(false);
  let selectedIds: string[] = $state([]);
  let selectButton: HTMLButtonElement | undefined = $state();
  let cancelButton: HTMLButtonElement | undefined = $state();
  let grid: HTMLDivElement | undefined = $state();

  // Incremental loading
  let visibleCount = $state(PAGE_SIZE);
  let sentinelEl = $state<HTMLDivElement | undefined>(undefined);

  // Filter and sort derived
  let filteredCharacters = $derived(
    filterAndSortCharacters(characters, searchTerm, sortMode)
  );

  let visibleCharacters = $derived(filteredCharacters.slice(0, visibleCount));
  let hasMore = $derived(visibleCount < filteredCharacters.length);

  // Watch the sentinel whenever it exists. `sentinelEl` is state, so this effect
  // re-runs when the sentinel is added, recreated, or removed. That matters:
  // the sentinel appears only once a page is full, which can happen long after
  // mount, and a fresh element needs a fresh observer.
  $effect(() => {
    const sentinel = sentinelEl;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          visibleCount = Math.min(visibleCount + PAGE_SIZE, filteredCharacters.length);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  function handleSearchChange(term: string) {
    searchTerm = term;
    visibleCount = PAGE_SIZE; // Reset pagination on search
  }

  function handleSortChange(mode: SortMode) {
    sortMode = mode;
    visibleCount = PAGE_SIZE; // The first page of a new order starts at the top
  }

  function openCharacter(id: string) {
    if (selectMode) return; // Don't open lightbox in select mode
    const char = characters.find((c) => c.id === id);
    if (char) {
      selectedCharacter = char;
    }
  }

  function closeLightbox() {
    selectedCharacter = null;
  }

  function toggleSelect(id: string) {
    if (selectedIds.includes(id)) {
      selectedIds = selectedIds.filter((i) => i !== id);
    } else {
      selectedIds = [...selectedIds, id];
    }
  }

  async function handleEnterSelectMode() {
    selectMode = true;
    await tick();
    // Outgoing animated cards can still be in the DOM; focus the first card
    // in the current rendered list, not an obsolete outgoing element.
    const firstId = visibleCharacters[0]?.id;
    const first = [...(grid?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? [])]
      .find((input) => input.dataset.characterId === firstId);
    (first ?? cancelButton)?.focus();
  }

  async function handleDeleteSelected() {
    if (selectedIds.length === 0) return;
    const deleted = await onDeleteMany(selectedIds);
    if (deleted) {
      selectedIds = [];
      selectMode = false;
      await tick();
      selectButton?.focus();
    }
  }

  async function handleCancelSelect() {
    selectMode = false;
    selectedIds = [];
    await tick();
    selectButton?.focus();
  }

  function handleDownload(character: Character) {
    downloadCharacterImage(character).catch((err) => {
      console.error('Download failed:', err);
    });
  }
</script>

<GalleryToolbar
  searchTerm={searchTerm}
  sortMode={sortMode}
  onSearchChange={handleSearchChange}
  onSortChange={handleSortChange}
  selectMode={selectMode}
  selectedCount={selectedIds.length}
  onToggleSelectMode={handleEnterSelectMode}
  onDeleteSelected={handleDeleteSelected}
  onCancelSelect={handleCancelSelect}
  bind:selectButton
  bind:cancelButton
/>

<div bind:this={grid}>
  <MasonryGrid
    characters={visibleCharacters}
    animate={true}
    onOpen={openCharacter}
    selectMode={selectMode}
    selectedIds={selectedIds}
    onToggleSelect={toggleSelect}
    onDownload={handleDownload}
  />
</div>

{#if hasMore}
  <div bind:this={sentinelEl} class="py-8 text-center">
    <span class="text-zinc-500">Loading more...</span>
  </div>
{/if}

<Lightbox
  character={selectedCharacter}
  characters={filteredCharacters}
  onEdit={onEdit}
  onDelete={onDelete}
  onClose={closeLightbox}
  onSelect={openCharacter}
/>
