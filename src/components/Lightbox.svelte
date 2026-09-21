<script lang="ts">
  import type { Character } from '../types';
  import { downloadCharacterImage } from '../download';

  let { character, characters, onEdit, onDelete, onClose, onSelect }: {
    character: Character | null;
    characters: Character[];
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
    onSelect: (id: string) => void;
  } = $props();

  let dialogEl = $state<HTMLDialogElement | undefined>(undefined);
  let triggerButton: HTMLElement | null = null;
  let toreDown = false;

  let index = $derived(character ? characters.findIndex((c) => c.id === character.id) : -1);
  let hasPrevious = $derived(index > 0);
  let hasNext = $derived(index !== -1 && index < characters.length - 1);

  function showPrevious() {
    if (hasPrevious) onSelect(characters[index - 1].id);
  }

  function showNext() {
    if (hasNext) onSelect(characters[index + 1].id);
  }

  /** Ask the dialog to close. The `close` event performs the actual teardown. */
  function requestClose() {
    if (dialogEl?.open) {
      dialogEl.close();
    } else {
      teardown();
    }
  }

  /**
   * Runs for every close path, including the browser's own Escape handling, so
   * the parent state and the focused element always match the dialog.
   */
  function teardown() {
    if (toreDown) return;
    toreDown = true;

    const trigger = triggerButton;
    triggerButton = null;
    if (trigger?.isConnected) {
      trigger.focus();
    }

    onClose();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      showPrevious();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      showNext();
    }
    // Escape is left to the dialog, which closes and fires `close`.
  }

  function handleDownload() {
    if (!character) return;
    downloadCharacterImage(character).catch((err) => console.error('Download failed:', err));
  }

  function handleEdit() {
    const id = character?.id;
    if (!id) return;
    requestClose();
    onEdit(id);
  }

  function handleDelete() {
    const id = character?.id;
    if (!id) return;
    requestClose();
    onDelete(id);
  }

  // Open the dialog whenever a character is selected and the dialog is closed.
  $effect(() => {
    if (character && dialogEl && !dialogEl.open) {
      toreDown = false;
      triggerButton = document.activeElement as HTMLElement | null;
      dialogEl.showModal();
    }
  });
</script>

{#if character}
  <dialog
    bind:this={dialogEl}
    aria-labelledby="lightbox-title"
    class="fixed inset-0 z-50 m-auto max-h-[90vh] max-w-[90vw] rounded-xl bg-bg-secondary p-6 outline-none backdrop:bg-black/80"
    onclose={teardown}
    onkeydown={handleKeydown}
  >
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between gap-4">
        <h2 id="lightbox-title" class="text-xl font-bold text-accent">{character.name}</h2>
        {#if index !== -1}
          <span class="ml-auto text-sm text-zinc-400">{index + 1} / {characters.length}</span>
        {/if}
        <button
          type="button"
          onclick={requestClose}
          class="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={showPrevious}
          disabled={!hasPrevious}
          aria-label="Previous character"
          class="rounded-lg p-2 text-zinc-300 hover:bg-zinc-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div class="flex-1 overflow-auto">
          <img
            src={character.image}
            alt={character.name}
            width={character.width}
            height={character.height}
            class="mx-auto max-h-[60vh] rounded-lg object-contain"
          />
        </div>

        <button
          type="button"
          onclick={showNext}
          disabled={!hasNext}
          aria-label="Next character"
          class="rounded-lg p-2 text-zinc-300 hover:bg-zinc-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {#if character.description}
        <p class="text-zinc-300">{character.description}</p>
      {/if}

      <div class="flex gap-2">
        <button
          type="button"
          onclick={handleDownload}
          class="rounded-lg bg-border px-4 py-2 text-white hover:bg-purple-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          Download
        </button>
        <button
          type="button"
          onclick={handleEdit}
          class="rounded-lg bg-border px-4 py-2 text-white hover:bg-purple-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          Edit
        </button>
        <button
          type="button"
          onclick={handleDelete}
          class="rounded-lg bg-accent px-4 py-2 text-white hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          Delete
        </button>
      </div>
    </div>
  </dialog>
{/if}
