<script lang="ts">
  import type { Character } from '../types';

  let { editingCharacter, onSave, onCancel }: {
    editingCharacter: Character | null;
    onSave: (character: Omit<Character, 'id' | 'createdAt'> & { id?: string }) => void;
    onCancel: () => void;
  } = $props();

  let name = $state(editingCharacter?.name ?? '');
  let description = $state(editingCharacter?.description ?? '');
  let imagePreview = $state(editingCharacter?.image ?? '');
  let selectedFile: File | null = $state(null);
  let imageWidth = $state<number | undefined>(editingCharacter?.width);
  let imageHeight = $state<number | undefined>(editingCharacter?.height);

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      selectedFile = input.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        imagePreview = reader.result as string;
        // Capture intrinsic dimensions
        const img = new Image();
        img.onload = () => {
          imageWidth = img.naturalWidth;
          imageHeight = img.naturalHeight;
        };
        img.src = imagePreview;
      };
      reader.readAsDataURL(selectedFile);
    }
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();

    if (!name.trim()) {
      alert('Name is required');
      return;
    }

    let image = imagePreview;
    if (selectedFile !== null) {
      try {
        const reader = new FileReader();
        const result = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(selectedFile!);
        });
        image = result;
      } catch (error) {
        alert('Error reading image file');
        return;
      }
    } else if (!editingCharacter) {
      alert('Image is required for new characters');
      return;
    }

    onSave({
      id: editingCharacter?.id,
      name: name.trim(),
      description: description.trim(),
      image,
      width: imageWidth,
      height: imageHeight,
    });
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
      <label for="char-image" class="mb-1 block font-medium">Image (PNG) *</label>
      <input
        type="file"
        id="char-image"
        accept=".png,.jpg,.jpeg,.webp"
        onchange={handleFileSelect}
        class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-zinc-200 file:mr-4 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-2 file:text-white hover:file:bg-accent-hover"
      />
    </div>
    {#if imagePreview}
      <img src={imagePreview} alt="Image preview" class="mt-3 block max-w-[200px] rounded-lg" />
    {/if}
    <div class="mt-6 flex gap-3">
      <button
        type="submit"
        class="rounded-lg bg-accent px-4 py-2 text-white hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        Save
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
