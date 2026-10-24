# Image guide

Replace any file below with your own photo - **keep the same file name**. Missing files show a grey placeholder with the product name, so nothing breaks.

Format: `.jpg` by default. If you use `.png` or `.webp`, change `const EXT='jpg'` at the top of `js/app.js`.

## Hero (homepage banner)
| File | Tip |
|---|---|
| `assets/images/hero.jpg` | Wide photo, about 1600-2000 px wide. Keep the left third calm - the headline sits there. |

## Category tiles (homepage "Shop by Category")
`assets/images/categories/` : `bricks.jpg`, `concrete.jpg`, `steel.jpg`, `wood.jpg`, `tiles.jpg`, `doors.jpg`, `windows.jpg` (4:3 works best)

## Products
File name = product name in lowercase, spaces/brackets turned into dashes. 4:3 photos, about 800x600 px.

| File |
|---|
| `assets/images/products/bricks/reclaimed-bricks.jpg` |
| `assets/images/products/bricks/vintage-red-bricks.jpg` |
| `assets/images/products/bricks/handmade-bricks.jpg` |
| `assets/images/products/bricks/concrete-bricks.jpg` |
| `assets/images/products/bricks/demolition-bricks-cleaned.jpg` |
| `assets/images/products/bricks/clay-bricks-reclaimed.jpg` |
| `assets/images/products/bricks/solid-bricks.jpg` |
| `assets/images/products/bricks/perforated-bricks.jpg` |
| `assets/images/products/concrete/concrete-slab-reused.jpg` |
| `assets/images/products/concrete/concrete-blocks.jpg` |
| `assets/images/products/concrete/precast-lintel.jpg` |
| `assets/images/products/steel/steel-beam-reclaimed.jpg` |
| `assets/images/products/steel/tmt-bars-bundle.jpg` |
| `assets/images/products/steel/steel-angle-frame.jpg` |
| `assets/images/products/wood/wooden-plank-reused.jpg` |
| `assets/images/products/wood/teak-beam.jpg` |
| `assets/images/products/wood/sal-wood-batten.jpg` |
| `assets/images/products/tiles/reclaimed-floor-tiles.jpg` |
| `assets/images/products/tiles/vitrified-tiles-spare-lot.jpg` |
| `assets/images/products/tiles/mosaic-tiles.jpg` |
| `assets/images/products/doors/teak-door-reclaimed.jpg` |
| `assets/images/products/doors/flush-door.jpg` |
| `assets/images/products/doors/panel-door-with-frame.jpg` |
| `assets/images/products/windows/wooden-window-frame.jpg` |
| `assets/images/products/windows/glass-pane-window.jpg` |
| `assets/images/products/windows/aluminium-sliding-window.jpg` |

## Extra gallery photos (product page)
Add `-2`, `-3`, `-4` to any product name to get thumbnails and arrows automatically, e.g. `reclaimed-bricks-2.jpg`, `reclaimed-bricks-3.jpg`, `reclaimed-bricks-4.jpg`.

## Adding a new product
Add a row to the `B` array (bricks) or `O` object (other categories) in `js/app.js`, then add a photo named after it.
