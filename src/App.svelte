<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import {
    CharacterLibrary,
    type CharacterDraft,
    type LibraryStatus,
  } from './character-library.svelte';
  import { DownloadAttempts } from './download-attempts.svelte';
  import type { Character } from './types';
  import Gallery from './components/Gallery.svelte';
  import CharacterForm from './components/CharacterForm.svelte';

  const DELETE_FAILED = 'Could not delete the Character. It is still in your library.';
  const BATCH_DELETE_FAILED =
    'Could not delete the selected Characters. Nothing was removed, ' +
    'so your selection is unchanged.';

  // What the page announces for each start-up state. The failure alert carries the
  // detail; this is the short form that follows the transition into and out of it.
  const STATUS_MESSAGE: Record<LibraryStatus, string> = {
    loading: 'Loading your character library...',
    failed: 'Your character library could not be opened.',
    ready: 'Your character library is ready.',
  };

  // One library per page. It is the only writer of Character records and the
  // only owner of the list; this shell renders what the library publishes.
  const library = new CharacterLibrary();

  // One owner of download attempts and their notice per page, beside the
  // library: an attempt still in flight when the Gallery is torn down keeps
  // running, and its failure still reaches the page. It is separate state from
  // `deleteNotice`, so neither notice overwrites the other.
  const downloads = new DownloadAttempts();

  let editingCharacter = $state<Character | null>(null);
  let showForm = $state(false);
  // The identity of the form session that owns the page's form slot. A save is
  // started by one session, and the user can start another while it is pending,
  // so a completion may only close the form of the session that began it.
  let formSession = $state(0);
  // Kept in the page shell so a delete failure survives closing the lightbox.
  let deleteNotice = $state<string | null>(null);
  // Reported by the Gallery, which owns the dialog, so this shell can present
  // the one download notice where the user is looking.
  let lightboxOpen = $state(false);
  // The stable landmark that receives focus when Retry removes itself.
  let heading = $state<HTMLHeadingElement | undefined>(undefined);
  // The persistent page action a finished Add returns to, and the form region
  // that decides whether the user was still inside the form when it closed.
  let addCharacterButton = $state<HTMLButtonElement | undefined>(undefined);
  let formRegion = $state<HTMLDivElement | undefined>(undefined);
  // A one-shot request for the remounted Gallery: the edited Character's card,
  // or Search when that Character is not on the page it renders. The Gallery
  // receives it under this same name, and `pendingReturn` is its unspent copy.
  let returnFocusCharacterId = $state<string | undefined>(undefined);
  // Empty at creation on purpose. An assistive technology only announces a
  // change to a live region that already existed, so the region is rendered
  // empty and its text arrives after the element is in the document.
  let statusMessage = $state('');

  $effect(() => {
    statusMessage = STATUS_MESSAGE[library.status];
  });

  onMount(() => {
    void library.initialize();
  });

  onDestroy(() => library.dispose());

  async function handleSave(session: number, draft: CharacterDraft) {
    // A rejection reaches the form, which keeps the draft and shows its message.
    await library.save(draft);
    deleteNotice = null;
    await closeForm(session, draft.id);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this character?')) return;
    try {
      await library.remove(id);
      deleteNotice = null;
    } catch (error) {
      console.error('Failed to delete the character:', error);
      deleteNotice = DELETE_FAILED;
    }
  }

  async function handleDeleteMany(ids: string[]): Promise<boolean> {
    if (!confirm(`Delete ${ids.length} characters?`)) return false;
    try {
      await library.removeMany(ids);
      deleteNotice = null;
      return true;
    } catch (error) {
      console.error('Failed to delete the selected characters:', error);
      deleteNotice = BATCH_DELETE_FAILED;
      return false;
    }
  }

  function startAdd() {
    if (library.status !== 'ready') return;
    // Add already owns the form slot: that open draft is this task, not a new one.
    if (showForm && editingCharacter === null) return;
    editingCharacter = null;
    beginFormSession();
  }

  function startEdit(id: string) {
    const character = library.characters.find((candidate) => candidate.id === id);
    if (!character) return;
    editingCharacter = character;
    beginFormSession();
  }

  /** One Add or Edit task for the page's form slot. A newer session replaces it. */
  function beginFormSession() {
    formSession += 1;
    showForm = true;
  }

  function cancelForm(session: number) {
    void closeForm(session);
  }

  /** Whether a form session still owns the page's form slot. */
  function ownsForm(session: number): boolean {
    return session === formSession;
  }

  /**
   * The Character this close returns focus to, by identity. `undefined` means
   * the form was an Add, whose return target is the persistent Add action. A
   * draft that carries an identity is an edit of that record; a Cancel has no
   * draft, so the open edit target supplies it. A name is never the target,
   * because two Characters can share one.
   */
  function closingCharacterId(draftId?: string): string | undefined {
    return draftId ?? editingCharacter?.id;
  }

  /**
   * Whether a control outside the form should keep the focus it has. That is
   * the user's own choice made while the save was pending. A heading or a field
   * inside the closing form is not, because it is about to disappear. Neither
   * is the body: it is what is left when nothing is focused, not a choice.
   */
  function outsideControlHoldsFocus(): boolean {
    const active = document.activeElement;
    if (active === null || active === document.body) return false;
    return !(formRegion?.contains(active) ?? false);
  }

  async function closeForm(session: number, draftId?: string) {
    // A superseded session was replaced by the user's next task. Its completion
    // may neither close that task's form nor move that task's focus.
    if (!ownsForm(session)) return;

    const characterId = closingCharacterId(draftId);
    const outsideControlKeepsFocus = outsideControlHoldsFocus();

    editingCharacter = null;
    showForm = false;

    // Only this close may ask for a destination, so a stale request can never
    // outlive the form that made it. The decision is made once, here: a close
    // that leaves an outside control alone asks the remounted Gallery for
    // nothing.
    returnFocusCharacterId = outsideControlKeepsFocus ? undefined : characterId;

    if (outsideControlKeepsFocus) return;
    // An edit handover is the Gallery's: only an Add returns here.
    if (characterId !== undefined) return;

    await tick();
    if (!ownsForm(session)) return;
    addCharacterButton?.focus();
  }

  function retry() {
    // The Retry control is gone as soon as loading starts, so move focus to the
    // page heading first. Nothing focuses again when the retry completes.
    heading?.focus();
    void library.initialize();
  }
</script>

<!--
  The page's one download notice. It is presented in page content or inside the
  open lightbox, never both, so a screen reader can only reach it once. It is
  polite status: nothing focuses it and nothing announces on its behalf.
-->
{#snippet downloadNotice()}
  <div
    role="status"
    aria-live="polite"
    aria-atomic="true"
    class="flex items-start justify-between gap-4 rounded-xl border border-border bg-bg-secondary px-4 py-3"
  >
    <p class="text-sm text-zinc-300">{downloads.message}</p>
    <button
      type="button"
      onclick={() => downloads.dismiss()}
      aria-label="Dismiss download notice"
      class="rounded-lg border border-border px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      Dismiss
    </button>
  </div>
{/snippet}

<div class="min-h-screen bg-bg-primary text-zinc-200">
  <header class="border-b-2 border-border bg-bg-secondary px-6 py-5 sm:px-10">
    <div class="flex items-center justify-between">
      <h1
        bind:this={heading}
        tabindex="-1"
        class="text-accent rounded text-2xl font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        Character Gallery
      </h1>
      <button
        type="button"
        bind:this={addCharacterButton}
        disabled={library.status !== 'ready'}
        class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-transform motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-accent"
        onclick={startAdd}
      >
        + Add Character
      </button>
    </div>
  </header>

  <main class="px-4 py-8 sm:px-6 lg:px-10">
    {#if deleteNotice}
      <div
        role="status"
        aria-live="polite"
        class="mb-6 flex items-start justify-between gap-4 rounded-xl border border-danger/50 bg-bg-secondary px-4 py-3"
      >
        <p class="text-sm text-danger">{deleteNotice}</p>
        <button
          type="button"
          onclick={() => (deleteNotice = null)}
          class="rounded-lg border border-border px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          Dismiss
        </button>
      </div>
    {/if}

    <!-- Page content, above the form branch, so a download that fails while the
         Gallery is gone is still reported. It never moves focus or reopens a
         dialog. While a lightbox is open the same notice moves inside that
         dialog instead of being hidden behind it. -->
    {#if downloads.notice !== null && !lightboxOpen}
      <div class="mb-6">{@render downloadNotice()}</div>
    {/if}

    <!-- The library state, so a screen reader can follow loading and recovery.
         It is the page's whole content while loading; otherwise it repeats in
         words what the page already shows. -->
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
      class={library.status === 'loading'
        ? 'py-12 text-center text-zinc-400'
        : 'sr-only'}
    >
      {statusMessage}
    </p>

    {#if showForm}
      <div bind:this={formRegion}>
        <!-- The form belongs to one session: a newer form replaces it, and a
             save from a replaced form cannot close it. -->
        {#key formSession}
          {@const session = formSession}
          <CharacterForm
            editingCharacter={editingCharacter}
            onSave={(draft) => handleSave(session, draft)}
            onCancel={() => cancelForm(session)}
          />
        {/key}
      </div>
    {:else if library.status === 'failed'}
      <div
        role="alert"
        class="mx-auto max-w-lg rounded-xl border border-danger/50 bg-bg-secondary p-6 text-center"
      >
        <h2 class="mb-2 text-lg font-bold text-danger">Could not open your character library</h2>
        <p class="mb-1 text-zinc-300">
          Loading failed, so your Characters could not be shown. Retry will not delete or replace
          stored Characters.
        </p>
        {#if library.failureMessage}
          <p class="mb-4 break-words text-sm text-zinc-400">{library.failureMessage}</p>
        {/if}
        <button
          type="button"
          onclick={retry}
          class="rounded-lg bg-accent px-4 py-2 text-white hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          Retry
        </button>
      </div>
    {:else if library.status === 'ready'}
      {#if library.repairWarning}
        <p class="mb-6 text-center text-sm text-warning" role="status">{library.repairWarning}</p>
      {/if}
      <Gallery
        characters={library.characters}
        onEdit={startEdit}
        onDelete={handleDelete}
        onDeleteMany={handleDeleteMany}
        onDownload={(character) => downloads.start(character)}
        notice={downloads.notice !== null && lightboxOpen ? downloadNotice : undefined}
        onLightboxChange={(open) => (lightboxOpen = open)}
        returnFocusCharacterId={returnFocusCharacterId}
      />
    {/if}
  </main>
</div>
