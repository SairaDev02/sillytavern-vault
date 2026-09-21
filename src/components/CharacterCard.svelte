<script lang="ts">
  import type { Character } from '../types';

  let { character, onEdit, onDelete }: {
    character: Character;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
  } = $props();
</script>

<div class="card">
  <img src={character.image} alt={character.name} class="card-image" />
  <div class="card-body">
    <h3>{character.name}</h3>
    <p>{character.description || 'No description'}</p>
    <div class="card-actions">
      <button class="btn btn-edit" onclick={() => onEdit(character.id)}>Edit</button>
      <button class="btn btn-delete" onclick={() => onDelete(character.id)}>Delete</button>
    </div>
  </div>
</div>
