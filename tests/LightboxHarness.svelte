<script lang="ts">
  import { untrack } from 'svelte';
  import Lightbox from '../src/components/Lightbox.svelte';
  import type { Character } from '../src/types';

  let { initial, selectedId = null }: {
    initial: Character[];
    selectedId?: string | null;
  } = $props();

  let characters = $state(untrack(() => initial));
  let shownId = $state<string | null>(untrack(() => selectedId));

  /**
   * Resolve the displayed Character from the list on every update, so replacing
   * a Character under the same id reaches the dialog the way the page's
   * canonical list would.
   */
  let character = $derived(
    characters.find((candidate) => candidate.id === shownId) ?? null
  );

  const edited: string[] = [];
  const deleted: string[] = [];

  /** Test hook: replace the character list the way the page does after a save. */
  export function setCharacters(next: Character[]) {
    characters = next;
  }

  /** Test hook: navigate the way Previous/Next does. */
  export function show(id: string) {
    shownId = id;
  }

  /** Test hook: the ids the dialog asked the page to edit or delete. */
  export function editedIds() {
    return edited;
  }

  export function deletedIds() {
    return deleted;
  }

  /** Test hook: whether the dialog is still showing a Character. */
  export function isOpen() {
    return character !== null;
  }
</script>

<Lightbox
  {character}
  {characters}
  onEdit={(id) => {
    edited.push(id);
    shownId = null;
  }}
  onDelete={(id) => {
    deleted.push(id);
    shownId = null;
  }}
  onClose={() => (shownId = null)}
  onSelect={show}
  onDownload={() => {}}
/>
