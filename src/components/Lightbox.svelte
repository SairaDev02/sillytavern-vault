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

  let dialogEl: HTMLDialogElement | undefined;
  let triggerButton: HTMLElement | null = null;

  function close() {
    if (!dialogEl?.open) return;
    dialogEl.close();
    if (triggerButton) {
      triggerButton.focus();
      triggerButton = null;
    }
    onClose();
  }

  function currentIndex(): number {
    if (!character) return -1;
    return characters.findIndex((c) => c.id === character.id);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!character || !dialogEl) return;

    if (e.key === 'Escape') {
      close();
    } else if (e.key === 'ArrowLeft') {
      const idx = currentIndex();
      if (idx > 0) {
        onSelect(characters[idx - 1].id);
      }
    } else if (e.key === 'ArrowRight') {
      const idx = currentIndex();
      if (idx < characters.length - 1) {
        onSelect(characters[idx + 1].id);
      }
    }
  }

  // When character changes, open the dialog (or update if already open)
  $effect(() => {
    if (character && dialogEl && !dialogEl.open) {
      triggerButton = document.activeElement as HTMLElement;
      dialogEl.showModal();
    }
  });
</script>

{#if character}
  <dialog
    bind:this={dialogEl}
    class="fixed inset-0 z-50 m-auto max-h-[90vh] max-w-[90vw] rounded-xl bg-bg-secondary p-6 outline-none backdrop:bg-black/80"
    onclose={close}
    onkeydown={handleKeydown}
  >
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold text-accent">{character.name}</h2>
        <button
          type="button"
          onclick={close}
          class="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="overflow-auto">
        <img
          src={character.image}
          alt={character.name}
          width={character.width}
          height={character.height}
          class="mx-auto max-h-[60vh] rounded-lg object-contain"
        />
      </div>

      {#if character.description}
        <p class="text-zinc-300">{character.description}</p>
      {/if}

      <div class="flex gap-2">
        <button
          type="button"
          onclick={() => downloadCharacterImage(character).catch((err) => console.error('Download failed:', err))}
          class="rounded-lg bg-border px-4 py-2 text-white hover:bg-purple-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          Download
        </button>
        <button
          type="button"
          onclick={() => { const id = character.id; close(); onEdit(id); }}
          class="rounded-lg bg-border px-4 py-2 text-white hover:bg-purple-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          Edit
        </button>
        <button
          type="button"
          onclick={() => { const id = character.id; close(); onDelete(id); }}
          class="rounded-lg bg-accent px-4 py-2 text-white hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          Delete
        </button>
      </div>
    </div>
  </dialog>
{/if}
