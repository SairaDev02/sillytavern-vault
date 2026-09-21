<script lang="ts">
  import { untrack } from 'svelte';
  import type { Character } from '../types';
  import { measureImage } from '../image';

  let { editingCharacter, onSave, onCancel }: {
    editingCharacter: Character | null;
    onSave: (character: Omit<Character, 'id' | 'createdAt'> & { id?: string }) => Promise<void>;
    onCancel: () => void;
  } = $props();

  // App mounts a new form for each add or edit ({#key}), so the prop values are
  // used as starting values on purpose. untrack marks that intent.
  let name = $state(untrack(() => editingCharacter?.name ?? ''));
  let description = $state(untrack(() => editingCharacter?.description ?? ''));
  let imagePreview = $state(untrack(() => editingCharacter?.image ?? ''));
  let saving = $state(false);

  // Intrinsic size of `imagePreview`, together with the data URL it was measured
  // from. The record must never store dimensions that belong to another image.
  let measured = $state<{ src: string; width: number; height: number } | null>(
    untrack(() =>
      editingCharacter?.width && editingCharacter?.height
        ? {
            src: editingCharacter.image,
            width: editingCharacter.width,
            height: editingCharacter.height,
          }
        : null
    )
  );

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
      reader.readAsDataURL(file);
    });
  }

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      imagePreview = dataUrl;
      measured = null;

      try {
        const size = await measureImage(dataUrl);
        // Another file can be picked while this one decodes.
        if (imagePreview === dataUrl) {
          measured = { src: dataUrl, ...size };
        }
      } catch {
        // The form still saves. App backfills missing dimensions later.
      }
    } catch (error) {
      console.error('Failed to read the selected file:', error);
      alert('Could not read the selected image.');
    }
  }

  /** Dimensions to store for `image`, measuring it if that has not happened yet. */
  async function resolveDimensions(image: string) {
    if (measured?.src === image) {
      return { width: measured.width, height: measured.height };
    }

    try {
      const size = await measureImage(image);
      return { width: size.width, height: size.height };
    } catch {
      return { width: undefined, height: undefined };
    }
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();
    if (saving) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      alert('Name is required');
      return;
    }

    // A new character needs an image. An existing one keeps the stored image
    // when the user does not pick a replacement.
    const image = imagePreview;
    if (!image) {
      alert('Image is required for new characters');
      return;
    }

    saving = true;
    try {
      const { width, height } = await resolveDimensions(image);
      await onSave({
        id: editingCharacter?.id,
        name: trimmedName,
        description: description.trim(),
        image,
        width,
        height,
      });
    } catch (error) {
      console.error('Failed to save the character:', error);
      alert('Could not save the character. The browser storage may be full.');
    } finally {
      saving = false;
    }
  }
</script>

<div class="mx-auto max-w-lg rounded-xl border border-border bg-bg-secondary p-8">
  <h2 class="mb-6 text-center text-xl font-bold text-accent">
    {editingCharacter ? 'Edit Character' : 'Add New Character'}
  </h2>
  <form onsubmit={handleSubmit}>
    <div class="mb-4">
      <label for="char-name" class="mb-1 block font-medium">Name *</label>
      <input
        type="text"
        id="char-name"
        bind:value={name}
        required
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
        class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-zinc-200 file:mr-4 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-2 file:text-white hover:file:bg-accent-hover"
      />
      <p class="mt-1 text-xs text-zinc-500">
        Downloads are converted to PNG. Large files use more browser storage.
      </p>
    </div>
    {#if imagePreview}
      <img
        src={imagePreview}
        alt="Preview of the selected character"
        class="mt-3 block max-w-[200px] rounded-lg"
      />
    {/if}
    <div class="mt-6 flex gap-3">
      <button
        type="submit"
        disabled={saving}
        class="rounded-lg bg-accent px-4 py-2 text-white hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
      <button
        type="button"
        onclick={onCancel}
        class="rounded-lg border border-border px-4 py-2 text-zinc-300 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        Cancel
      </button>
    </div>
  </form>
</div>
