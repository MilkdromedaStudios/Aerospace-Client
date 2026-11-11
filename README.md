# Aerospace Client

A space-themed browser client built on **Eaglercraft 26.3** (zeus/master).

Aerospace Client takes the stock single-file Eaglercraft 26.3 build and turns it into its own client: new boot screen, new title screen and panorama, a restyled interface, a HUD and settings menu, and extra space-themed content. The game code itself (the three WebAssembly images) is passed through byte-for-byte.

## Play

Open [`docs/index.html`](docs/index.html) in a recent Chrome, Edge or Firefox. It is one self-contained file (about 80 MB) and works offline once downloaded.

To host it, enable GitHub Pages for this repository with the source set to the `/docs` folder.

| Control | Action |
| --- | --- |
| Tap `Right Shift` | Open the command deck (Aerospace settings) |
| Hold `C` | Optical zoom; scroll to change magnification |

Both keys can be rebound in the command deck.

## What is different from stock Eaglercraft 26.3

**Shell**
- Aerospace boot screen with a starfield, progress bar and rotating tips, replacing the stock splash and the red loading screen
- New page title, icon, crash and rotate-device screens

**Client layer** (command deck)
- HUD instruments: FPS, CPS, keystrokes, clock, mission timer, memory, frame-time graph, client badge
- Drag-and-drop HUD layout, HUD scale and opacity, six accent colours
- Optical zoom
- Visor: brightness boost, saturation, and colour filters (Night Vision, Solar Shield, Deep Space, Thermal, Lunar Mono)
- Cosmetic helmet visor overlay
- Rebindable keys, settings saved in the browser

The client layer only reads your own keyboard and mouse and restyles the picture. It does not read game memory or change anything sent to servers.

**Game assets**
- "AEROSPACE" title logo, subtitle and loading logo
- Seamless deep-space title panorama (ringed gas giant, blue world, nebulae)
- Interface skin: buttons, sliders, text fields, tabs, checkboxes, scroll bars, hotbar, crosshair, tooltips, menu backgrounds
- Sky: the Moon is a ringed ice world with all eight phases, new Sun, starfield End sky
- 145 space-themed splash texts, reworded menus ("Solo Mission", "Mission Paused", ...)

**Game content**
- New "Aerospace Program" advancement tab with 11 advancements
- Four space paintings (Stellar Nursery, The Ringed Giant, Liftoff, Pale Blue World)
- Craftable Elytra: phantom membranes, a diamond and a Nether Star

## Build it yourself

Requires Node.js 22.2 or newer. There are no npm dependencies.

```bash
npm run build
```

The build downloads the pinned upstream file once into `.cache/` (verified by SHA-256), then writes `docs/index.html`. To build from a file you already have:

```bash
node tools/build.js --upstream path/to/Eaglercraft-26.3.html
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Tests for the archive and single-file formats |
| `npm run unpack` | Extracts the stock assets to `.cache/upstream-assets/` so you can see what can be overridden |
| `npm run preview:shell` | Builds a small mock page for working on the boot screen and HUD without the game |
| `npm run art` | Regenerates the procedural art (needs Python 3 with Pillow and numpy) |
| `npm run content` | Regenerates advancements, paintings, recipe, splashes and language strings |

## Customising

| Path | Purpose |
| --- | --- |
| `aerospace/overlay/` | Files copied over the game's assets, using the same relative paths (`assets/...`, `data/...`) |
| `aerospace/lang/en_us.json` | Language strings merged into the game's language file |
| `aerospace/patches.json` | JSON merges and tag additions |
| `aerospace/shell/` | Boot screen, stylesheet and the client layer (`client.js`) |
| `tools/art/` | Procedural art generator |
| `tools/content/` | Generator for the data-driven content |

To change a texture, run `npm run unpack`, copy the file you want from `.cache/upstream-assets/` to the same path under `aerospace/overlay/`, edit it and rebuild. The build fails with a clear message if a replacement texture has the wrong size, a language string has different placeholders, or an advancement or painting points at something that does not exist.

## Credits and legal

Aerospace Client is an unofficial fan project. It is not affiliated with or endorsed by Mojang or Microsoft.

- Minecraft is © Mojang AB.
- The browser port is the work of the Eaglercraft project (lax1dude, ayunami2000 and the 26.x port contributors). The title screen keeps the Eaglercraft build and port credit, and the in-game credits screen is unchanged.
- The Aerospace shell, client layer, tools, art and added content are original to this project and licensed under [Apache-2.0](LICENSE). That licence covers only those files; it grants no rights to Minecraft or Eaglercraft.

`docs/index.html` contains the compiled game and its assets, which belong to their respective owners. If you fork or host this project, you are responsible for making sure you are allowed to distribute it. See [NOTICE.md](NOTICE.md).
