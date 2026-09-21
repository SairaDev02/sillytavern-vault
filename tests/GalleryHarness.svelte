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
</script>

<Gallery
  {characters}
  onEdit={() => {}}
  onDelete={() => {}}
  onDeleteMany={async () => true}
/>
