<script lang="ts">
  import { untrack } from 'svelte';
  import Gallery from '../src/components/Gallery.svelte';
  import type { Character } from '../src/types';

  let { initial }: { initial: Character[] } = $props();

  let characters = $state(untrack(() => initial));

  /** Test hook: replace the character list the way App.svelte does after a save. */
  export function setCharacters(next: Character[]) {
    characters = next;
  }

  const edited: string[] = [];

  /** Test hook: the ids the Gallery asked the page to edit. */
  export function editedIds() {
    return edited;
  }
</script>

<Gallery
  {characters}
  onEdit={(id) => {
    edited.push(id);
  }}
  onDelete={() => {}}
  onDeleteMany={async () => true}
/>
