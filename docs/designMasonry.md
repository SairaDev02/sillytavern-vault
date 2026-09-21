# Design: Modern, Performant, Animated Masonry Image Gallery

## 1. Purpose

Design a responsive image gallery for a Svelte application using Tailwind CSS. The gallery should:

- Present images in a true masonry-like layout with variable heights.
- Remain fast with hundreds or thousands of images.
- Animate insertions, removals, filtering, and reordering without janky layout animation.
- Avoid unnecessary JavaScript layout calculations.
- Preserve image aspect ratios and avoid cumulative layout shift (CLS).
- Work well with keyboard navigation, screen readers, touch, and reduced-motion preferences.
- Support an optional lightbox/detail view without coupling it to the gallery layout.

## 2. Design Principles

### 2.1 CSS owns layout

Do not calculate masonry positions in JavaScript for the default gallery. Use CSS multi-column layout (`columns`) with `break-inside: avoid` on each item.

This keeps layout work in the browser's rendering engine and makes the component small and deterministic.

### 2.2 Svelte owns state and interaction

Svelte should manage:

- image collection state
- filters/search/sort state
- selected image/lightbox state
- loading/error state
- pagination or load-more state
- animation configuration

It should not continuously measure every image and assign absolute coordinates.

### 2.3 Animate transforms and opacity

Use Svelte's keyed `animate:flip` for layout changes caused by list mutations, and simple CSS/Tailwind transitions for hover/focus effects.

Avoid animating:

- `top`
- `left`
- `width`
- `height`
- expensive filter effects over large images

Prefer `transform` and `opacity`.

### 2.4 Images must be sized before they load

Every image record should contain its intrinsic dimensions (`width`, `height`) or an aspect ratio. Render those dimensions in the `<img>` element or use an equivalent aspect-ratio wrapper.

This reserves layout space before the image decodes and prevents content from jumping when images arrive.

## 3. Recommended Architecture

```text
Gallery.svelte
├── GalleryToolbar.svelte
│   ├── Filter controls
│   ├── Sort controls
│   └── View/status controls
│
├── MasonryGrid.svelte
│   └── MasonryItem.svelte × N
│       ├── Image frame
│       ├── <img>
│       ├── loading/failed state
│       └── hover/focus metadata
│
├── LoadMore.svelte / InfiniteScrollSentinel.svelte
│
└── Lightbox.svelte (optional)
    ├── Previous
    ├── Current image
    ├── Next
    └── Close
```

### Data model

```ts
export type GalleryImage = {
  id: string;
  src: string;
  srcSet?: string;
  sizes?: string;
  width: number;
  height: number;
  alt: string;
  title?: string;
  href?: string;
  thumbnailSrc?: string;
  blurDataUrl?: string;
};
```

The `id` must be stable. Do not use the array index as the keyed identity.

## 4. Masonry Layout Strategy

### Default: CSS multi-column layout

```svelte
<div
  class="columns-[14rem] gap-4 sm:columns-[16rem] lg:columns-[18rem]"
>
  {#each filteredImages as image (image.id)}
    <MasonryItem {image} />
  {/each}
</div>
```

The item wrapper should prevent an image card from being fragmented between columns:

```svelte
<figure class="mb-4 break-inside-avoid">
  <!-- image content -->
</figure>
```

Use a column-width strategy rather than hard-coding one column count when possible. The browser can then choose the number of columns that fits the available width.

### Why not absolute positioning?

A JavaScript-packed masonry engine must usually:

1. measure every item,
2. calculate column placement,
3. write positions,
4. repeat after image loads/resizes,
5. respond to viewport changes.

This increases implementation complexity and can create layout/reflow work as images decode. CSS multi-column handles the basic masonry flow without that application-level layout loop.

### Trade-off

CSS multi-column flows content from top to bottom within a column before moving to the next column. This means visual order is column-oriented rather than the row-oriented order normally associated with a CSS grid.

For an image gallery, this is acceptable when document order and keyboard traversal remain the primary accessibility concerns. If a strict row-major visual order is a product requirement, use a different layout engine: a CSS-grid row-span implementation based on known aspect ratios, or a dedicated masonry library.

## 5. Responsive Behavior

Use mobile-first Tailwind utilities.

Example target behavior:

| Width | Intended behavior |
|---|---|
| Small phones | 1–2 columns depending on available width |
| Large phones/tablets | 2–3 columns |
| Desktop | 3–5 columns |
| Wide desktop | Cap content width so images do not become excessively narrow |

Prefer adaptive column widths such as:

```html
<div class="mx-auto max-w-screen-2xl columns-[14rem] gap-4 px-4 sm:columns-[16rem] lg:columns-[18rem]">
```

Do not force a large fixed number of columns on narrow screens.

If the design requires exact column counts, Tailwind's responsive `columns-*` utilities can be used instead.

## 6. Image Rendering

### Required image attributes

```svelte
<img
  src={image.src}
  srcset={image.srcSet}
  sizes={image.sizes ?? '(min-width: 1024px) 18rem, 50vw'}
  alt={image.alt}
  width={image.width}
  height={image.height}
  loading={isNearViewport ? 'eager' : 'lazy'}
  decoding="async"
  class="block h-auto w-full"
/>
```

### Image rules

- Generate multiple image widths at the image service/CDN when available.
- Use `srcset` for responsive image selection.
- Use `sizes` that approximately matches the rendered column width.
- Set intrinsic `width` and `height` attributes.
- Use `loading="lazy"` for off-screen gallery images.
- Keep the first visible images eager when they are known to be above the fold.
- Use `decoding="async"` for gallery images so image decoding does not unnecessarily block other rendering work.
- Use modern image formats such as AVIF/WebP when the delivery stack supports content negotiation.
- Avoid serving a 2000–4000 px source to a 250 px rendered thumbnail.

### Placeholder strategy

Prefer this hierarchy:

1. blurred low-quality placeholder (`blurDataUrl`) when available,
2. dominant-color/solid placeholder,
3. neutral skeleton.

The placeholder must have the same aspect ratio as the final image.

Example wrapper:

```svelte
<div
  class="relative overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900"
  style={`aspect-ratio: ${image.width} / ${image.height}`}
>
  <!-- placeholder -->
  <img ... />
</div>
```

The simplest implementation is to rely on the `<img width height>` intrinsic ratio and avoid an extra wrapper when no overlay is needed.

## 7. Gallery Item Design

The item should remain visually quiet until interaction.

```svelte
<figure
  class="group mb-4 break-inside-avoid overflow-hidden rounded-xl"
>
  <button
    type="button"
    class="relative block w-full overflow-hidden rounded-xl outline-none"
    aria-label={image.title ?? image.alt}
    onclick={() => open(image.id)}
  >
    <img
      ...
      class="block h-auto w-full transition-transform duration-300 ease-out
             motion-safe:group-hover:scale-[1.02]
             motion-safe:group-focus-within:scale-[1.02]
             motion-reduce:transition-none"
    />

    <span
      class="pointer-events-none absolute inset-x-0 bottom-0
             bg-gradient-to-t from-black/60 to-transparent
             p-4 pt-12 opacity-0 transition-opacity duration-200
             motion-safe:group-hover:opacity-100
             motion-safe:group-focus-within:opacity-100"
      aria-hidden="true"
    >
      {image.title}
    </span>
  </button>
</figure>
```

Keep hover animation subtle. A masonry gallery can contain many images, so large scale effects, blur, shadows, and continuous motion should be avoided.

## 8. Svelte Animation Model

### 8.1 Key every item

Use stable keys:

```svelte
{#each filteredImages as image (image.id)}
  <MasonryItem {image} animate:flip={{ duration: 260 }} />
{/each}
```

Svelte's `flip` animation is intended for items whose positions change when the list changes. Keep the animation attached to the stable item element rather than an internal `<img>`.

A more explicit structure is:

```svelte
<script lang="ts">
  import { flip } from 'svelte/animate';
</script>

{#each filteredImages as image (image.id)}
  <div animate:flip={{ duration: 260 }}>
    <MasonryItem {image} />
  </div>
{/each}
```

### 8.2 Enter animation

Use a short fade/translate only for newly inserted items.

```svelte
<script lang="ts">
  import { fade } from 'svelte/transition';
</script>

<div
  animate:flip={{ duration: 260 }}
  in:fade={{ duration: 180 }}
>
  ...
</div>
```

Do not use a large `fly` distance. New cards should appear to settle into the layout instead of flying across the screen.

### 8.3 Removal animation

A short opacity fade is preferable to moving a large image out of the viewport.

```svelte
<div out:fade={{ duration: 140 }}>
```

The remaining items then use FLIP to move into their new positions.

### 8.4 Filtering and sorting

Filtering should update the array once. Avoid manually moving each item.

```ts
let activeTag = $state('all');

let filteredImages = $derived(
  activeTag === 'all'
    ? images
    : images.filter((image) => image.tags?.includes(activeTag))
);
```

When the keyed collection changes, Svelte can animate the surviving items into their new positions.

### 8.5 Do not animate on initial page load by default

The initial page should render immediately. Entrance animation on hundreds of items creates unnecessary work and delays visual completion.

A useful rule:

- initial render: no list animation,
- user-triggered insertion: short entrance animation,
- filter/sort: FLIP,
- removal: short fade + FLIP for survivors,
- hover/focus: CSS transition.

## 9. Reduced Motion

Respect the user's `prefers-reduced-motion` setting.

Tailwind provides `motion-safe` and `motion-reduce` variants. Use them for non-essential movement and disable or reduce list transitions when reduced motion is requested.

Example:

```html
class="transition duration-300 motion-reduce:transition-none"
```

For more significant list animations, use a Svelte-level guard if necessary so that FLIP and enter/exit transitions are not started at all.

Conceptually:

```ts
const reduceMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;
```

Read this once and subscribe to changes if the application needs to react while it is running. Keep the motion preference in a small reusable store/helper rather than duplicating it across gallery components.

## 10. Performance Budget

Define an explicit performance budget for the gallery.

### Initial render

Target:

- only the images likely to be visible should be fetched eagerly,
- no JavaScript masonry measurement loop,
- no image decoding work on unrelated off-screen items,
- no layout shift when images load.

### Scrolling

Target:

- scrolling should remain compositor-friendly,
- no per-scroll React-style/Svelte state updates for every pixel,
- no synchronous `getBoundingClientRect()` loop for all gallery items.

### DOM size

For very large collections, pagination, incremental loading, or virtualization should be introduced. Do not render tens of thousands of `<figure>` elements merely because the API returns them.

A practical architecture is:

```text
API page 1 -> render
        ↓
load-more sentinel enters viewport
        ↓
API page 2 -> append
        ↓
repeat
```

Use an `IntersectionObserver` for the load-more sentinel rather than listening to `scroll` on every event.

## 11. Optional Off-screen Rendering Optimization

For very large galleries, consider `content-visibility: auto` on an item-group/section or another carefully chosen container boundary.

Example:

```css
.gallery-section {
  content-visibility: auto;
  contain-intrinsic-size: auto 800px;
}
```

Use this only after measuring. Masonry's height is content-dependent, so an inaccurate intrinsic size can cause visible corrections when skipped content is rendered.

Avoid blindly applying `content-visibility` to every image item; choose boundaries that preserve predictable layout.

## 12. Loading States and Errors

Each image needs three states:

```text
pending -> loaded
pending -> error
```

The wrapper should keep the reserved aspect ratio in all states.

Recommended error UI:

- small neutral icon/label,
- retain the card dimensions,
- provide a retry action when the failure is recoverable.

Do not replace a failed image with a dynamically sized error element because that can cause masonry columns to reflow unexpectedly.

## 13. Lightbox / Detail View

Treat the lightbox as a separate component and state machine.

```text
closed
  ↓ open(id)
open
  ├── previous()
  ├── next()
  ├── escape -> closed
  └── background click -> closed
```

### Requirements

- move focus into the dialog on open,
- restore focus to the triggering gallery button on close,
- use an actual dialog pattern,
- trap focus while open if the implementation requires it,
- support Escape,
- support previous/next buttons,
- preload adjacent images when useful,
- prevent background interaction while the modal is open.

The lightbox should not change the masonry layout.

## 14. Accessibility

### Image semantics

- Informative images: meaningful `alt` text.
- Decorative images: `alt=""`.
- Do not duplicate long captions in both `alt` and visible text.

### Keyboard interaction

Gallery items that open a detail view should be actual `<button>` or `<a>` elements, not clickable `<div>` elements.

Required behavior:

```text
Tab -> item 1 -> item 2 -> item 3 -> ...
Enter/Space -> open selected item
Escape -> close lightbox
```

### Focus styling

Do not remove the browser focus indicator without providing a stronger replacement.

Example:

```html
class="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-current/50"
```

### Reading order

Keep the DOM order semantically meaningful and stable. Visual masonry is secondary to logical document navigation.

## 15. Tailwind CSS Conventions

Use Tailwind utilities for component styling and keep custom CSS limited to browser features that are awkward or unclear as utilities.

Typical classes:

```text
layout:
  columns-[14rem]
  gap-4
  max-w-screen-2xl
  mx-auto

item:
  break-inside-avoid
  mb-4
  overflow-hidden
  rounded-xl

a11y:
  focus-visible:ring-2
  focus-visible:ring-offset-2

motion:
  transition-transform
  transition-opacity
  duration-200
  duration-300
  ease-out
  motion-safe:...
  motion-reduce:...
```

Avoid `transition-all` on image cards. Declare only the properties that should animate.

## 16. Component Responsibilities

### `Gallery.svelte`

Owns page-level gallery state:

- source images
- active filters
- sorting
- selected image
- pagination/load-more

It should not contain low-level image rendering details.

### `MasonryGrid.svelte`

Owns:

- column layout
- keyed iteration
- list animation configuration
- empty state

It should receive images and callbacks as props.

### `MasonryItem.svelte`

Owns:

- image rendering
- placeholder
- load/error state
- hover/focus treatment
- click/open behavior

### `Lightbox.svelte`

Owns:

- dialog lifecycle
- focus management
- keyboard navigation
- current image rendering
- adjacent-image preloading

## 17. Suggested API

```ts
export type MasonryGridProps = {
  images: GalleryImage[];
  gap?: 'sm' | 'md' | 'lg';
  columnWidth?: string;
  animate?: boolean;
  onOpen?: (id: string) => void;
};
```

Keep the component API small. Do not expose internal layout calculations or DOM references unless they are required by a real consumer.

## 18. Reference Implementation Skeleton

```svelte
<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fade } from 'svelte/transition';

  type GalleryImage = {
    id: string;
    src: string;
    srcSet?: string;
    sizes?: string;
    width: number;
    height: number;
    alt: string;
    title?: string;
    tags?: string[];
  };

  let images = $state<GalleryImage[]>([]);
  let activeTag = $state('all');
  let selectedId = $state<string | null>(null);

  let filteredImages = $derived(
    activeTag === 'all'
      ? images
      : images.filter((image) => image.tags?.includes(activeTag))
  );

  function open(id: string) {
    selectedId = id;
  }
</script>

<section aria-label="Image gallery">
  <div
    class="mx-auto max-w-screen-2xl columns-[14rem] gap-4 px-4 sm:columns-[16rem] lg:columns-[18rem]"
  >
    {#each filteredImages as image (image.id)}
      <div
        animate:flip={{ duration: 260 }}
        in:fade={{ duration: 160 }}
        out:fade={{ duration: 140 }}
        class="mb-4 break-inside-avoid"
      >
        <figure class="group overflow-hidden rounded-xl">
          <button
            type="button"
            class="relative block w-full overflow-hidden rounded-xl outline-none
                   focus-visible:ring-2 focus-visible:ring-current/50"
            onclick={() => open(image.id)}
            aria-label={image.title ?? image.alt}
          >
            <img
              src={image.src}
              srcset={image.srcSet}
              sizes={image.sizes ?? '(min-width: 1024px) 18rem, 50vw'}
              alt={image.alt}
              width={image.width}
              height={image.height}
              loading="lazy"
              decoding="async"
              class="block h-auto w-full transition-transform duration-300 ease-out
                     motion-safe:group-hover:scale-[1.02]
                     motion-safe:group-focus-within:scale-[1.02]
                     motion-reduce:transition-none"
            />
          </button>

          {#if image.title}
            <figcaption class="sr-only">{image.title}</figcaption>
          {/if}
        </figure>
      </div>
    {/each}
  </div>
</section>
```

The skeleton is intentionally small. Production code should add image loading/error state, pagination, motion preference handling, and lightbox state only when those features are needed.

## 19. Testing Strategy

### Functional tests

- renders images in stable order,
- filters correctly,
- sorting correctly updates the collection,
- opens the selected image,
- closes the lightbox,
- previous/next navigation works,
- load-more appends without duplicating IDs,
- image errors preserve layout dimensions.

### Accessibility tests

- every meaningful image has useful `alt` text,
- decorative images have empty alt text,
- interactive cards are keyboard accessible,
- visible focus styles exist,
- modal focus is managed correctly,
- Escape closes the lightbox,
- reduced-motion mode removes or minimizes non-essential movement.

### Performance tests

Test at representative sizes:

- 50 images,
- 250 images,
- 1,000+ images with incremental loading.

Measure:

- LCP,
- CLS,
- INP,
- total image bytes,
- number of eagerly fetched images,
- scripting time during filtering/sorting,
- layout/recalculate-style activity while scrolling.

Use browser performance tooling rather than assuming that an animation is cheap.

## 20. Acceptance Criteria

The implementation is complete when:

- [ ] The gallery works from mobile through wide desktop widths.
- [ ] Variable image heights form a masonry-style layout without JS position calculations.
- [ ] Each image reserves its intrinsic aspect ratio before loading.
- [ ] Off-screen images use native lazy loading.
- [ ] Responsive `srcset`/`sizes` prevents unnecessary image downloads when supported by the image source.
- [ ] Filtering and sorting animate surviving items with keyed FLIP.
- [ ] Initial rendering does not animate hundreds of items.
- [ ] Hover/focus motion only changes transform/opacity.
- [ ] `prefers-reduced-motion` is respected.
- [ ] Keyboard navigation works without a mouse.
- [ ] Focus is visible.
- [ ] Image failures do not collapse cards or produce layout jumps.
- [ ] Large galleries load incrementally rather than rendering an unbounded collection.
- [ ] The lightbox is independent of masonry layout.
- [ ] Performance is measured with representative image counts and real image payloads.

## 21. Design Decisions Summary

| Concern | Decision |
|---|---|
| Masonry engine | CSS multi-column layout by default |
| Item fragmentation | `break-inside: avoid` |
| State | Svelte 5 runes / normal Svelte component state as appropriate |
| List identity | Stable image IDs |
| Layout animation | Svelte `animate:flip` |
| Enter/exit | Short fade |
| Hover motion | `transform` only, subtle scale |
| Image loading | Native lazy loading + responsive sources |
| Layout stability | Intrinsic width/height + aspect ratio |
| Infinite loading | IntersectionObserver on a sentinel |
| Very large collections | Incremental loading; consider virtualization only when justified by measurement |
| Reduced motion | `prefers-reduced-motion` + Tailwind motion variants |
| Styling | Tailwind CSS utilities with small custom CSS surface |
| Lightbox | Separate component/state machine |
| Accessibility | Semantic buttons/links, meaningful alt text, focus management |

## 22. References

- Svelte animation examples and `animate:flip`: https://svelte.dev/playground/52a1d8564bfa4c9da6dc9c3a570109ed
- Svelte transitions: https://svelte.dev/playground/transition
- Tailwind CSS columns: https://tailwindcss.com/docs/columns
- Tailwind CSS responsive design: https://tailwindcss.com/docs/responsive-design
- Tailwind CSS transition properties: https://tailwindcss.com/docs/transition-property
- Tailwind CSS transition duration and reduced-motion variants: https://tailwindcss.com/docs/transition-duration
- MDN `<img>` loading, dimensions, `srcset`, and `decoding`: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/img
- MDN CSS multi-column layout: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Multicol_layout
- MDN multi-column content breaking and `break-inside`: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Multicol_layout/Handling_content_breaks
- MDN `content-visibility`: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility
- MDN `contain-intrinsic-size`: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/contain-intrinsic-size
- MDN `prefers-reduced-motion`: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion

## 23. Implementation Rule of Thumb

Start with the smallest architecture that satisfies the product:

```text
CSS columns
    +
Svelte keyed list
    +
FLIP for user-driven reflow
    +
native responsive images
    +
incremental loading
    +
accessible lightbox
```

Only introduce JavaScript masonry measurement, virtualization, or advanced animation orchestration after profiling shows that the simple architecture cannot meet the required behavior or performance target.
