<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Character } from '../types';
  import {
    failedImageSource,
    IMAGE_UNAVAILABLE_TEXT,
    imageFrameAspectRatio,
    imageFrameSize,
    isImageUnavailable,
    isUsableImageSize,
  } from '../image-frame';

  /** Which displayed image could not be shown: its Character and its source. */
  interface ImageFailure {
    characterId: string;
    source: string;
  }

  let { character, characters, onEdit, onDelete, onClose, onSelect, onDownload, notice }: {
    character: Character | null;
    characters: Character[];
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
    onSelect: (id: string) => void;
    // The page owns the attempt and its notice; the dialog only asks for it.
    onDownload: (character: Character) => void;
    // The page renders the notice inside the dialog while it is open, so the
    // same notice is never outside it as well.
    notice?: Snippet;
  } = $props();

  let dialogEl = $state<HTMLDialogElement | undefined>(undefined);
  let triggerButton: HTMLElement | null = null;
  let toreDown = false;

  // A display failure belongs to the image it happened on: the Character shown
  // and the source string itself. Recording both means navigating to another
  // Character, or replacing a source under the same Character id, starts the
  // next view without the failure.
  let failed: ImageFailure | null = $state(null);

  /** Whether the recorded failure describes the image the dialog shows now. */
  function describesDisplayedImage(
    failure: ImageFailure | null,
    shown: Character | null
  ): boolean {
    return (
      failure !== null &&
      shown !== null &&
      failure.characterId === shown.id &&
      isImageUnavailable(shown.image, failure.source)
    );
  }

  let imageUnavailable = $derived(describesDisplayedImage(failed, character));

  // The displayed image as one identity, so each source gets its own element.
  let imageKey = $derived(`${character?.id ?? ''}\u0000${character?.image ?? ''}`);

  let hasStoredSize = $derived(isUsableImageSize(character));
  let frame = $derived(imageFrameSize(character));
  // The frame carries the reserved shape and takes its size from the viewport,
  // never from the image, so loading or failing cannot reshape it. The bounds
  // keep it inside the dialog's width and a 60vh height, so a tall stored image
  // does not push the actions off screen; the 8rem leaves room for the dialog's
  // padding and the previous/next buttons.
  let frameStyle = $derived(
    `aspect-ratio: ${imageFrameAspectRatio(character)}; ` +
      `width: min(calc(80vw - 8rem), calc(60vh * ${frame.width} / ${frame.height}))`
  );

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

  /**
   * Record the image the failing element shows, exactly as that element still
   * holds it. A late event from an element whose source was replaced names a
   * different source, so it cannot describe what is on screen now.
   */
  function handleImageError(event: Event) {
    const shown = failedImageSource(event);
    if (!character || !shown) return;
    if (!isImageUnavailable(character.image, shown)) return;
    failed = { characterId: character.id, source: shown };
  }

  function handleDownload() {
    if (!character) return;
    onDownload(character);
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
          <span
            class="relative mx-auto block overflow-hidden rounded-lg bg-zinc-800"
            style={frameStyle}
          >
            {#if !imageUnavailable}
              <!-- Keying on the displayed image gives each source its own element,
                   so a late error still names the source it was shown for. -->
              {#key imageKey}
                <img
                  src={character.image}
                  alt={character.name}
                  width={hasStoredSize ? frame.width : undefined}
                  height={hasStoredSize ? frame.height : undefined}
                  onerror={handleImageError}
                  class="block h-full w-full object-contain"
                />
              {/key}
            {/if}
            <!-- Unlike a card, the lightbox shows one image at a time, so the
                 failure is announced here as polite status. It is not a focus
                 target and does not touch the dialog's open state. -->
            <span
              role="status"
              aria-live="polite"
              aria-atomic="true"
              class={imageUnavailable
                ? 'absolute inset-0 flex items-center justify-center p-4 text-center text-sm font-medium text-zinc-300'
                : 'sr-only'}
            >
              {imageUnavailable ? IMAGE_UNAVAILABLE_TEXT : ''}
            </span>
          </span>
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

      <!-- The page's download notice, presented where the user is. It sits in
           the dialog's own content, beside the Download action that raised it,
           and is neither a focus target nor a reason to change the dialog. -->
      {#if notice}
        {@render notice()}
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
