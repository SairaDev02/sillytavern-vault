<script lang="ts">

  import type { Character } from '../types';
  import { downloadCharacterImage } from '../download';
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
  let sortMode = $state<'newest' | 'oldest' | 'name'>('newest');

  // Selected character for lightbox
  let selectedCharacter: Character | null = $state(null);

  // Batch selection state
  let selectMode = $state(false);
  let selectedIds: string[] = $state([]);

  // Incremental loading
  let visibleCount = $state(24);
  let sentinelEl: HTMLDivElement | undefined;
  let observer: IntersectionObserver | null = null;

  // Filter and sort derived
  let filteredCharacters = $derived.by(() => {
    let result = characters;

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      result = result.filter((c) =>
        c.name.toLowerCase().includes(term) ||
        c.description.toLowerCase().includes(term)
      );
    }

    return [...result].sort((a, b) => {
      if (sortMode === 'newest') return b.createdAt - a.createdAt;
      if (sortMode === 'oldest') return a.createdAt - b.createdAt;
      return a.name.localeCompare(b.name);
    });
  });

  let visibleCharacters = $derived(filteredCharacters.slice(0, visibleCount));

  function handleSearchChange(term: string) {
    searchTerm = term;
    visibleCount = 24; // Reset pagination on search
  }

  function handleSortChange(mode: 'newest' | 'oldest' | 'name') {
    sortMode = mode;
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

  function handleToggleSelectMode() {
    selectMode = !selectMode;
    if (!selectMode) {
      selectedIds = [];
    }
  }

  async function handleDeleteSelected() {
    if (selectedIds.length === 0) return;
    const deleted = await onDeleteMany(selectedIds);
    if (deleted) {
      selectedIds = [];
      selectMode = false;
    }
  }

  function handleCancelSelect() {
    selectMode = false;
    selectedIds = [];
  }

  function handleDownload(character: Character) {
    downloadCharacterImage(character).catch((err) => {
      console.error('Download failed:', err);
    });
  }

  // Set up IntersectionObserver for incremental loading
  $effect(() => {
    if (observer) {
      observer.disconnect();
    }

    if (!sentinelEl) return;

    observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && visibleCount < filteredCharacters.length) {
        visibleCount += 24;
      }
    }, { threshold: 0.1 });

    observer.observe(sentinelEl);
  });
</script>

<GalleryToolbar
  searchTerm={searchTerm}
  sortMode={sortMode}
  onSearchChange={handleSearchChange}
  onSortChange={handleSortChange}
  selectMode={selectMode}
  selectedCount={selectedIds.length}
  onToggleSelectMode={handleToggleSelectMode}
  onDeleteSelected={handleDeleteSelected}
  onCancelSelect={handleCancelSelect}
/>

<MasonryGrid
  characters={visibleCharacters}
  animate={true}
  onOpen={openCharacter}
  selectMode={selectMode}
  selectedIds={selectedIds}
  onToggleSelect={toggleSelect}
  onDownload={handleDownload}
/>

{#if visibleCount < filteredCharacters.length}
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
