<script lang="ts">

  import { tick, untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import type { Character } from '../types';
  import { PAGE_SIZE, filterAndSortCharacters, type SortMode } from '../gallery-utils';
  import GalleryToolbar from './GalleryToolbar.svelte';
  import MasonryGrid from './MasonryGrid.svelte';
  import Lightbox from './Lightbox.svelte';

  const NO_MATCH_MESSAGE = 'No characters match your search.';
  const RESULTS_RESTORED_MESSAGE = 'Search results restored.';

  let { characters, onEdit, onDelete, onDeleteMany, onDownload, notice, onLightboxChange, returnFocusCharacterId }: {
    characters: Character[];
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    onDeleteMany: (ids: string[]) => Promise<boolean>;
    // The page owns the attempt and its notice, so the Gallery only reports the
    // Character the user asked to download.
    onDownload: (character: Character) => void;
    // The page decides where its one notice is presented, which needs to know
    // whether a dialog is open. This Gallery owns that state, so it reports it
    // rather than making the page inspect the DOM.
    notice?: Snippet;
    onLightboxChange?: (open: boolean) => void;
    // A form that has just closed asks for one return handover: the edited
    // Character's card, or Search when that Character is not on the page.
    returnFocusCharacterId?: string;
  } = $props();

  // Search and sort state
  let searchTerm = $state('');
  let sortMode = $state<SortMode>('newest');

  // The open Character is held by identity, not by a copy. The library is the
  // only owner of the record, so a published change reaches the dialog instead
  // of leaving it on a snapshot taken when the card was opened.
  let selectedId = $state<string | null>(null);
  let selectedCharacter = $derived(
    selectedId === null ? null : characters.find((candidate) => candidate.id === selectedId) ?? null
  );

  // The page presents its one download notice in exactly one place, so it needs
  // the dialog's state. One report per change.
  $effect(() => {
    onLightboxChange?.(selectedCharacter !== null);
  });

  // A Gallery that is torn down takes its dialog with it, so a page still told
  // that a dialog is open would have nowhere to present the notice.
  $effect(() => () => onLightboxChange?.(false));

  // Batch selection state
  let selectMode = $state(false);
  let selectedIds: string[] = $state([]);
  let selectButton: HTMLButtonElement | undefined = $state();
  let cancelButton: HTMLButtonElement | undefined = $state();
  let searchInput: HTMLInputElement | undefined = $state();
  let grid: HTMLDivElement | undefined = $state();

  // Incremental loading
  let visibleCount = $state(PAGE_SIZE);
  let sentinelEl = $state<HTMLDivElement | undefined>(undefined);

  // The page sets this when a form closes. It is a one-shot request, so a later
  // page of results never repeats the handover, and a Gallery that was never
  // asked does nothing. It is the consumption state of the request, separate
  // from the `returnFocusCharacterId` prop the page passes: the prop is the
  // page's request for this mount, this is the copy that has not been spent yet.
  let pendingReturn: string | null = untrack(() => returnFocusCharacterId ?? null);

  // Filter and sort derived
  let filteredCharacters = $derived(
    filterAndSortCharacters(characters, searchTerm, sortMode)
  );

  let visibleCharacters = $derived(filteredCharacters.slice(0, visibleCount));
  let hasMore = $derived(visibleCount < filteredCharacters.length);

  /**
   * Why no card is shown. Genuine emptiness is derived from the canonical
   * library rather than from the rendered page, so it takes precedence over a
   * search that matched nothing.
   */
  let emptyState = $derived<'none' | 'empty-library' | 'no-matches'>(
    characters.length === 0
      ? 'empty-library'
      : filteredCharacters.length === 0
        ? 'no-matches'
        : 'none'
  );

  // Only the search transitions are announced. A surviving live region whose
  // text changes says what a screen reader needs, while narrowing a result list
  // stays silent: no count is read out per keystroke. A genuinely empty library
  // is visible on its own and is never announced here.
  let searchStatus = $state('');
  let lastEmptyState: typeof emptyState = 'none';

  $effect(() => {
    const current = emptyState;
    const previous = lastEmptyState;
    lastEmptyState = current;

    if (current === previous) return;
    if (current === 'no-matches') {
      searchStatus = NO_MATCH_MESSAGE;
    } else if (current === 'none' && previous === 'no-matches') {
      searchStatus = RESULTS_RESTORED_MESSAGE;
    } else if (current === 'empty-library') {
      // The genuine empty message speaks for itself, so the search status must
      // not keep claiming that a search is what hides the Characters.
      searchStatus = '';
    }
  });

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

  /**
   * Clear search is an ordinary search change, so it takes the same path as
   * typing and keeps the sort order, the selection, and the selection mode.
   * Only the recovery focus depends on the mode: browse returns to Search, while
   * selection continues at the first card of the restored list.
   */
  async function handleClearSearch() {
    handleSearchChange('');
    await tick();
    if (selectMode) {
      focusFirstRenderedCheckbox();
    } else {
      searchInput?.focus();
    }
  }

  function openCharacter(id: string) {
    if (selectMode) return; // Don't open lightbox in select mode
    if (characters.some((candidate) => candidate.id === id)) {
      selectedId = id;
    }
  }

  function closeLightbox() {
    selectedId = null;
  }

  function toggleSelect(id: string) {
    if (selectedIds.includes(id)) {
      selectedIds = selectedIds.filter((i) => i !== id);
    } else {
      selectedIds = [...selectedIds, id];
    }
  }

  /**
   * Focus the first card of the current rendered list without toggling it.
   * Outgoing animated cards can still be in the DOM, so match the current list
   * instead of taking the first checkbox in document order. With no card to
   * continue from, Cancel is the way out of selection mode.
   */
  function focusFirstRenderedCheckbox() {
    const firstId = visibleCharacters[0]?.id;
    const first = [...(grid?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? [])]
      .find((input) => input.dataset.characterId === firstId);
    (first ?? cancelButton)?.focus();
  }

  /**
   * The rendered card for a Character, or undefined when that Character is not
   * on the page. The card carries its record identity, so this resolves by
   * identity: document order is not a contract, and a name is not identity,
   * because two Characters can share one. The page remounts this Gallery in
   * browse mode, so the card's browse button is the one that opens it.
   */
  function renderedCard(characterId: string): HTMLElement | undefined {
    const cards = grid?.querySelectorAll<HTMLElement>('button[data-character-id]') ?? [];
    return [...cards].find((card) => card.dataset.characterId === characterId);
  }

  /**
   * Take the return handover the page asked for once, after this Gallery has
   * rendered: the edited Character's card, or Search when it is not on the
   * page. Consuming the request here is what stops a later page from moving
   * focus again.
   */
  $effect(() => {
    if (pendingReturn === null) return;
    const id = pendingReturn;
    pendingReturn = null;
    (renderedCard(id) ?? searchInput)?.focus();
  });

  async function handleEnterSelectMode() {
    selectMode = true;
    await tick();
    focusFirstRenderedCheckbox();
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
  bind:searchInput
/>

<span role="status" aria-live="polite" aria-atomic="true" class="sr-only">{searchStatus}</span>

<div bind:this={grid}>
  <MasonryGrid
    characters={visibleCharacters}
    animate={true}
    onOpen={openCharacter}
    selectMode={selectMode}
    selectedIds={selectedIds}
    onToggleSelect={toggleSelect}
    onDownload={onDownload}
  />
</div>

{#if emptyState === 'empty-library'}
  <p class="py-16 text-center text-zinc-500">No characters yet. Add one above!</p>
{:else if emptyState === 'no-matches'}
  <div class="py-16 text-center">
    <p class="text-zinc-500">{NO_MATCH_MESSAGE}</p>
    <button
      type="button"
      onclick={handleClearSearch}
      class="mt-4 rounded-lg border border-zinc-500 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      Clear search
    </button>
  </div>
{/if}

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
  onDownload={onDownload}
  {notice}
/>
