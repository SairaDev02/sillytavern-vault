<script lang="ts">
  import type { SortMode } from '../gallery-utils';

  let { searchTerm, sortMode, onSearchChange, onSortChange, selectMode = false, selectedCount = 0, onToggleSelectMode, onDeleteSelected, onCancelSelect }: {
    searchTerm: string;
    sortMode: SortMode;
    onSearchChange: (term: string) => void;
    onSortChange: (mode: SortMode) => void;
    selectMode?: boolean;
    selectedCount?: number;
    onToggleSelectMode?: () => void;
    onDeleteSelected?: () => void;
    onCancelSelect?: () => void;
  } = $props();
</script>

{#if selectMode}
  <!-- Select mode toolbar -->
  <div class="flex flex-col sm:flex-row gap-4 items-start sm:items-center mb-6">
    <span class="text-zinc-300 font-medium">{selectedCount} selected</span>
    <button
      type="button"
      onclick={onDeleteSelected}
      disabled={selectedCount === 0}
      class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-transform hover:bg-red-700 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:bg-red-600 disabled:hover:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
    >
      Delete Selected
    </button>
    <button
      type="button"
      onclick={onCancelSelect}
      class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      Cancel
    </button>
  </div>
{:else}
  <!-- Normal mode toolbar -->
  <div class="flex flex-col sm:flex-row gap-4 items-start sm:items-center mb-6">
    <div class="relative flex-1">
      <input
        type="search"
        placeholder="Search characters..."
        value={searchTerm}
        oninput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
        class="w-full rounded-lg border border-border bg-bg-secondary px-4 py-2 text-zinc-200 placeholder:text-zinc-500 focus:border-accent focus:outline-none"
      />
    </div>

    <select
      value={sortMode}
      onchange={(e) => onSortChange((e.target as HTMLSelectElement).value as SortMode)}
      class="rounded-lg border border-border bg-bg-secondary px-4 py-2 text-zinc-200 focus:border-accent focus:outline-none"
    >
      <option value="newest">Newest first</option>
      <option value="oldest">Oldest first</option>
      <option value="name">Name (A–Z)</option>
    </select>

    <button
      type="button"
      onclick={onToggleSelectMode}
      class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      Select
    </button>
  </div>
{/if}
