<script lang="ts">
  import { openDB, dbAdd, dbGetAll, dbDelete, dbDeleteMany } from './db';
  import type { Character } from './types';
  import Gallery from './components/Gallery.svelte';
  import CharacterForm from './components/CharacterForm.svelte';

  let db: IDBDatabase | null = $state(null);
  let characters: Character[] = $state([]);
  let editingCharacter: Character | null = $state(null);
  let showForm = $state(false);
  let loading = $state(true);

  function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  async function measureImage(src: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('Failed to load image for measurement'));
      img.src = src;
    });
  }

  async function backfillDimensions() {
    if (!db) return;
    const needsBackfill = characters.filter((c) => !c.width || !c.height);
    if (needsBackfill.length === 0) return;

    for (const char of needsBackfill) {
      try {
        const { width, height } = await measureImage(char.image);
        const updated = { ...char, width, height };
        await dbAdd(db, updated);
        // Update in-memory array
        const idx = characters.findIndex((c) => c.id === char.id);
        if (idx !== -1) {
          characters[idx] = updated;
        }
      } catch (e) {
        console.warn(`Failed to measure dimensions for ${char.name}:`, e);
      }
    }
  }

  async function loadCharacters() {
    if (!db) return;
    characters = await dbGetAll<Character>(db);
    loading = false;
    // Backfill dimensions for legacy records
    backfillDimensions();
  }

  async function handleSave(data: Omit<Character, 'id' | 'createdAt'> & { id?: string }) {
    if (!db) return;

    const character: Character = {
      id: data.id ?? generateId(),
      name: data.name,
      description: data.description,
      image: data.image,
      width: data.width,
      height: data.height,
      createdAt: Date.now(),
    };

    await dbAdd(db, character);
    showForm = false;
    editingCharacter = null;
    await loadCharacters();
  }

  async function handleDelete(id: string) {
    if (!db) return;
    if (confirm('Delete this character?')) {
      await dbDelete(db, id);
      characters = characters.filter((c) => c.id !== id);
    }
  }

  async function handleDeleteMany(ids: string[]): Promise<boolean> {
    if (!db) return false;
    if (confirm(`Delete ${ids.length} characters?`)) {
      await dbDeleteMany(db, ids);
      characters = characters.filter((c) => !ids.includes(c.id));
      return true;
    }
    return false;
  }

  function startEdit(id: string) {
    const char = characters.find((c) => c.id === id);
    if (char) {
      editingCharacter = char;
      showForm = true;
    }
  }

  async function init() {
    try {
      db = await openDB('character-gallery');
      await loadCharacters();
    } catch (error) {
      console.error('Failed to initialize database:', error);
      alert('Failed to initialize the gallery. Please refresh.');
    }
  }

  init();
</script>

<div class="min-h-screen bg-bg-primary text-zinc-200">
  <header class="border-b-2 border-border bg-bg-secondary px-6 py-5 sm:px-10">
    <div class="flex items-center justify-between">
      <h1 class="text-accent text-2xl font-bold">Character Gallery</h1>
      <button
        type="button"
        class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-transform hover:bg-accent-hover hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        onclick={() => { editingCharacter = null; showForm = true; }}
      >
        + Add Character
      </button>
    </div>
  </header>

  <main class="px-4 py-8 sm:px-6 lg:px-10">
    {#if showForm}
      <CharacterForm
        editingCharacter={editingCharacter}
        onSave={handleSave}
        onCancel={() => { showForm = false; editingCharacter = null; }}
      />
    {:else if loading}
      <p class="text-center text-zinc-400 py-12">Loading...</p>
    {:else}
      <Gallery characters={characters} onEdit={startEdit} onDelete={handleDelete} onDeleteMany={handleDeleteMany} />
    {/if}
  </main>
</div>
