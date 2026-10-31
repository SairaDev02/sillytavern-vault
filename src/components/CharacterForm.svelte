<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import type { Character } from '../types';
  import type { CharacterDraft } from '../character-library.svelte';
  import { LibraryError } from '../library-error';
  import { SelectedImage } from '../selected-image.svelte';

  let { editingCharacter, onSave, onCancel }: {
    editingCharacter: Character | null;
    onSave: (draft: CharacterDraft) => Promise<void>;
    onCancel: () => void;
  } = $props();

  const SAVE_FAILED = 'Could not save the character. The browser storage may be full.';
  const MISSING_TARGET =
    'Could not save: this Character is no longer in the library. ' +
    'Copy anything you need from this form.';

  // App mounts a new form for each add or edit ({#key}), so the prop values are
  // used as starting values on purpose. untrack marks that intent.
  let name = $state(untrack(() => editingCharacter?.name ?? ''));
  let description = $state(untrack(() => editingCharacter?.description ?? ''));
  let saving = $state(false);
  let saveError = $state<string | null>(null);

  // The form's entry point and its refuge while saving. It is outside the
  // <form>, so it stays focusable while every control inside is disabled.
  let headingEl = $state<HTMLHeadingElement | undefined>(undefined);
  let formEl = $state<HTMLFormElement | undefined>(undefined);

  onMount(() => {
    // The page mounts a new form for each target, so this is the one entry
    // announcement for this task. It moves focus after the heading renders.
    headingEl?.focus();
  });

  // One preparation belongs to this draft. It owns choice ordering, the
  // image/dimension pairing, readiness, discard restoration, and the
  // suppression of results from superseded work.
  const preparation = untrack(() => new SelectedImage(editingCharacter));
  onDestroy(() => preparation.dispose());

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (saving) return;

    const file = input.files?.[0];
    // Clear the native value so choosing the same file again starts a new
    // preparation after a failure or a discard.
    input.value = '';
    saveError = null;
    if (file) preparation.select(file);
  }

  function handleDiscard() {
    if (saving) return;
    saveError = null;
    preparation.discard();
  }

  function handleTextInput() {
    saveError = null;
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();
    if (saving) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      alert('Name is required');
      return;
    }

    const prepared = preparation.snapshot();
    if (!prepared) return;

    const draft: CharacterDraft = {
      id: editingCharacter?.id,
      name: trimmedName,
      description: description.trim(),
      ...prepared,
    };

    // Every control this submit is about to disable sits inside the form, so a
    // focused one needs somewhere to go before the render disables it. The
    // heading is outside the form and is never disabled. A submission that the
    // validation above rejects returns before this point, so it does not look
    // like a save that began.
    if (formEl?.contains(document.activeElement)) headingEl?.focus();

    saving = true;
    saveError = null;
    try {
      await onSave(draft);
    } catch (error) {
      console.error('Failed to save the character:', error);
      // Branch on the kind, so a refused edit does not read as a storage fault.
      saveError =
        error instanceof LibraryError && error.kind === 'missing-target'
          ? MISSING_TARGET
          : SAVE_FAILED;
    } finally {
      saving = false;
    }
  }

  function handleCancel() {
    if (saving) return;
    preparation.dispose();
    onCancel();
  }
</script>

<div class="mx-auto max-w-lg rounded-xl border border-border bg-bg-secondary p-8">
  <!-- Focused on entry and before a save disables the focused control, so it
       needs an indicator that does not depend on how the form was opened.
       tabindex="-1" keeps it out of the Tab order; the next Tab reaches Name. -->
  <h2
    bind:this={headingEl}
    tabindex="-1"
    class="mb-6 rounded text-center text-xl font-bold text-accent focus:outline-none focus:ring-2 focus:ring-focus-ring"
  >
    {editingCharacter ? 'Edit Character' : 'Add New Character'}
  </h2>
  <form bind:this={formEl} onsubmit={handleSubmit}>
    <div class="mb-4">
      <label for="char-name" class="mb-1 block font-medium">Name *</label>
      <input
        type="text"
        id="char-name"
        bind:value={name}
        required
        disabled={saving}
        oninput={handleTextInput}
        placeholder="Character name"
        class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-zinc-200 focus:border-accent focus:outline-none"
      />
    </div>
    <div class="mb-4">
      <label for="char-desc" class="mb-1 block font-medium">Description</label>
      <textarea
        id="char-desc"
        bind:value={description}
        rows="3"
        disabled={saving}
        oninput={handleTextInput}
        placeholder="Brief description..."
        class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-zinc-200 focus:border-accent focus:outline-none"
      ></textarea>
    </div>
    <div class="mb-4">
      <label for="char-image" class="mb-1 block font-medium">
        Image (PNG, JPEG, or WebP){editingCharacter ? '' : ' *'}
      </label>
      <input
        type="file"
        id="char-image"
        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
        onchange={handleFileSelect}
        disabled={saving}
        aria-describedby="char-image-help char-image-status"
        class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-zinc-200 file:mr-4 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-2 file:text-white hover:file:bg-accent-hover"
      />
      <p id="char-image-help" class="mt-1 text-xs text-zinc-500">
        Downloads are converted to PNG. Large files use more browser storage.
      </p>
      <div
        id="char-image-status"
        class="mt-2 space-y-1"
        aria-live="polite"
        aria-atomic="true"
      >
        {#if preparation.status === 'preparing'}
          <p class="text-sm text-zinc-300" role="status">Preparing the selected image…</p>
        {:else if preparation.error}
          <p class="text-sm text-danger" role="alert">{preparation.error}</p>
        {:else if preparation.warning}
          <p class="text-sm text-warning" role="status">{preparation.warning}</p>
        {:else if !preparation.image && !editingCharacter}
          <p class="text-sm text-zinc-400">Choose an image to enable saving.</p>
        {/if}
      </div>
      {#if preparation.hasReplacement}
        <button
          type="button"
          onclick={handleDiscard}
          disabled={saving}
          class="mt-2 rounded-lg border border-border px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50"
        >
          Discard replacement
        </button>
      {/if}
    </div>
    {#if preparation.image}
      <img
        src={preparation.image}
        alt="Preview of the selected character"
        class="mt-3 block max-w-[200px] rounded-lg"
      />
    {/if}
    {#if saveError}
      <p class="mt-3 text-sm text-danger" role="alert">{saveError}</p>
    {/if}
    <div class="mt-6 flex gap-3">
      <button
        type="submit"
        disabled={saving || !preparation.canSubmit}
        class="rounded-lg bg-accent px-4 py-2 text-white hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
      <button
        type="button"
        onclick={handleCancel}
        disabled={saving}
        class="rounded-lg border border-border px-4 py-2 text-zinc-300 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  </form>
</div>
