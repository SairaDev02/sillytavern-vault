<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { CharacterLibrary, type CharacterDraft } from './character-library.svelte';
  import type { Character } from './types';
  import Gallery from './components/Gallery.svelte';
  import CharacterForm from './components/CharacterForm.svelte';

  const DELETE_FAILED = 'Could not delete the Character. It is still in your library.';
  const BATCH_DELETE_FAILED =
    'Could not delete the selected Characters. Nothing was removed, ' +
    'so your selection is unchanged.';

  // One library per page. It is the only writer of Character records and the
  // only owner of the list; this shell renders what the library publishes.
  const library = new CharacterLibrary();

  let editingCharacter = $state<Character | null>(null);
  let showForm = $state(false);
  // Kept in the page shell so a delete failure survives closing the lightbox.
  let deleteNotice = $state<string | null>(null);

  onMount(() => {
    void library.initialize();
  });

  onDestroy(() => library.dispose());

  async function handleSave(draft: CharacterDraft) {
    // A rejection reaches the form, which keeps the draft and shows its message.
    await library.save(draft);
    deleteNotice = null;
    editingCharacter = null;
    showForm = false;
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this character?')) return;
    try {
      await library.remove(id);
      deleteNotice = null;
    } catch (error) {
      console.error('Failed to delete the character:', error);
      deleteNotice = DELETE_FAILED;
    }
  }

  async function handleDeleteMany(ids: string[]): Promise<boolean> {
    if (!confirm(`Delete ${ids.length} characters?`)) return false;
    try {
      await library.removeMany(ids);
      deleteNotice = null;
      return true;
    } catch (error) {
      console.error('Failed to delete the selected characters:', error);
      deleteNotice = BATCH_DELETE_FAILED;
      return false;
    }
  }

  function startAdd() {
    if (library.status !== 'ready') return;
    editingCharacter = null;
    showForm = true;
  }

  function startEdit(id: string) {
    const character = library.characters.find((candidate) => candidate.id === id);
    if (!character) return;
    editingCharacter = character;
    showForm = true;
  }

  function cancelForm() {
    showForm = false;
    editingCharacter = null;
  }

  function retry() {
    void library.initialize();
  }
</script>

<div class="min-h-screen bg-bg-primary text-zinc-200">
  <header class="border-b-2 border-border bg-bg-secondary px-6 py-5 sm:px-10">
    <div class="flex items-center justify-between">
      <h1 class="text-accent text-2xl font-bold">Character Gallery</h1>
      <button
        type="button"
        disabled={library.status !== 'ready'}
        class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-transform hover:bg-accent-hover hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-accent"
        onclick={startAdd}
      >
        + Add Character
      </button>
    </div>
  </header>

  <main class="px-4 py-8 sm:px-6 lg:px-10">
    {#if deleteNotice}
      <div
        role="status"
        aria-live="polite"
        class="mb-6 flex items-start justify-between gap-4 rounded-xl border border-danger/50 bg-bg-secondary px-4 py-3"
      >
        <p class="text-sm text-danger">{deleteNotice}</p>
        <button
          type="button"
          onclick={() => (deleteNotice = null)}
          class="rounded-lg border border-border px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          Dismiss
        </button>
      </div>
    {/if}

    {#if showForm}
      {#key editingCharacter?.id ?? 'new'}
        <CharacterForm
          editingCharacter={editingCharacter}
          onSave={handleSave}
          onCancel={cancelForm}
        />
      {/key}
    {:else if library.status === 'loading'}
      <p class="text-center text-zinc-400 py-12" role="status">Loading your character library...</p>
    {:else if library.status === 'failed'}
      <div
        role="alert"
        class="mx-auto max-w-lg rounded-xl border border-danger/50 bg-bg-secondary p-6 text-center"
      >
        <h2 class="mb-2 text-lg font-bold text-danger">Could not open your character library</h2>
        <p class="mb-1 text-zinc-300">
          Your Characters are still stored in this browser. Try again before you leave this page.
        </p>
        {#if library.failureMessage}
          <p class="mb-4 break-words text-sm text-zinc-400">{library.failureMessage}</p>
        {/if}
        <button
          type="button"
          onclick={retry}
          class="rounded-lg bg-accent px-4 py-2 text-white hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          Retry
        </button>
      </div>
    {:else}
      {#if library.repairWarning}
        <p class="mb-6 text-center text-sm text-warning" role="status">{library.repairWarning}</p>
      {/if}
      <Gallery
        characters={library.characters}
        onEdit={startEdit}
        onDelete={handleDelete}
        onDeleteMany={handleDeleteMany}
      />
    {/if}
  </main>
</div>
