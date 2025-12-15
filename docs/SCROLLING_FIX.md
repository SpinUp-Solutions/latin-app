# Scrolling Behavior Fix

## Problem

The word edit page had unwanted page-level scrolling, causing issues like:
- Double scrollbars
- Page scrolling when reaching the end of a panel's content
- Inconsistent scroll behavior across panels

## Solution

Applied `overflow-hidden` to the root `html` and `body` elements, then delegated scrolling to specific inner containers.

### CSS Change (`src/styles/base.css`)

```css
html,
body {
  @apply h-full overflow-hidden;
}
```

### Layout Pattern

```
┌─────────────────────────────────────────────┐
│ html/body: h-full overflow-hidden           │
│ ┌─────────────────────────────────────────┐ │
│ │ Page container: h-screen overflow-hidden│ │
│ │ ┌─────────────────────────────────────┐ │ │
│ │ │ Header: flex-shrink-0 (fixed)       │ │ │
│ │ ├─────────────────────────────────────┤ │ │
│ │ │ Main: flex-1 overflow-hidden        │ │ │
│ │ │ ┌───────────┬─────────────────────┐ │ │ │
│ │ │ │ Panel 1   │ Panel 2             │ │ │ │
│ │ │ │ overflow- │ overflow-y-auto     │ │ │ │
│ │ │ │ y-auto    │ (scrollable)        │ │ │ │
│ │ │ │(scrollable│                     │ │ │ │
│ │ │ └───────────┴─────────────────────┘ │ │ │
│ │ └─────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Required Classes by Level

| Element | Classes | Purpose |
|---------|---------|---------|
| `html`/`body` | `h-full overflow-hidden` | Lock page-level scroll |
| Page container | `h-screen flex flex-col overflow-hidden` | Fill viewport |
| Header | `flex-shrink-0` | Fixed height, won't compress |
| Main | `flex-1 overflow-hidden` | Fill remaining space |
| Scrollable panels | `overflow-y-auto overscroll-contain` | Handle actual scrolling |

### Example Implementation

```tsx
<div className="h-screen flex flex-col overflow-hidden">
  <header className="flex-shrink-0 px-4 py-3">
    {/* Fixed header content */}
  </header>

  <main className="flex-1 grid grid-cols-[35%_65%] overflow-hidden">
    <div className="overflow-y-auto overscroll-contain p-4">
      {/* Left panel - independently scrollable */}
    </div>

    <div className="overflow-y-auto overscroll-contain p-6">
      {/* Right panel - independently scrollable */}
    </div>
  </main>
</div>
```

## Key Points

- `overscroll-contain` prevents scroll chaining (stops parent from scrolling when child reaches bounds)
- Each scrollable area is independent
- Header stays fixed without needing `position: fixed`
- Works with any number of panels/columns

## Commit Reference

- Commit: `7aa00bb9`
- Message: "scrolling hotfix"
