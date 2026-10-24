# ReBuild Vision

Static front end, no build step. Open `index.html` or run `python3 -m http.server`.

Pages (hash routes): #home, #bricks / #concrete / #steel / #wood / #tiles / #doors / #windows, #p-bricks-0 (product), #cart, #profile, #sell.

Images: see `assets/images/README.md` for every file name. Products are defined at the top of `js/app.js`.

Cart, orders and profile are kept in memory only; connect a backend to persist them.

## View in Your Space (AR)

`ar/` is the WebAR viewer (your REbuild Lens project). The product page button opens
`ar/index.html?model=<id>&product=<name>&back=<hash>`, which preselects the matching 3D model.

| Marketplace category | AR model |
|---|---|
| Bricks | Red Brick |
| Concrete | Concrete Slab |
| Steel | Beam |
| Wood | Wood (plank) |
| Doors | Salvaged Door |
| Windows | Window |

Tiles have no 3D model yet, so the AR block is hidden on tile products. To add one: put a .glb in `ar/assets/models/`, add it to `ar/js/config.js`, and add the category to `AR_MAP` in `js/app.js`.

WebXR AR needs HTTPS (or localhost) and Android Chrome; elsewhere the viewer offers 3D Preview. Deploy the whole folder to Netlify / GitHub Pages / Vercel and open the HTTPS link on the phone.
