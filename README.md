# Aerospace Client

A space-themed browser client built on **Eaglercraft 26.3** (zeus/master).

Aerospace Client takes the stock single-file Eaglercraft 26.3 build and turns it into its own client: new boot screen, new title screen and panorama, a restyled interface, client mods, shader looks, a HUD, and extra space-themed content. The game code itself (the three WebAssembly images) is passed through byte-for-byte.

## Play

Open [`docs/index.html`](docs/index.html) in a recent Chrome, Edge or Firefox. It is one self-contained file (about 80 MB) and works offline once downloaded.

### Host it on GitHub Pages

The repository builds and publishes itself. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

After that, every push to `main` runs [`.github/workflows/pages.yml`](.github/workflows/pages.yml), which tests, builds `index.html` from the sources and deploys it to your Pages site. You can also start it by hand from the **Actions** tab ("Build and deploy" → "Run workflow"). Pull requests run the same test and build without deploying.

The workflow downloads the pinned upstream build and checks its SHA-256. If that download ever stops working, set a repository variable named `AEROSPACE_UPSTREAM_URL` (Settings → Secrets and variables → Actions → Variables) to another copy of the same file.

`docs/index.html` is a committed copy of the build for offline use. Pages no longer serves it once the source is set to GitHub Actions, and it is not rebuilt automatically, so run `npm run build` before committing if you want it to match your changes.

| Control | Action |
| --- | --- |
| Tap `Right Shift` | Open the command deck: client mods, shaders, HUD, settings |
| Hold `C` | Optical zoom; scroll to change magnification |
| `F9` | Screenshot to the clipboard (or to a file) |

All three keys can be rebound in the command deck.

### Mods

Eaglercraft 26.3 has its own mod loader for `.zip` and `.lua` mods, and Aerospace keeps it unchanged: on the title screen, **Mods** is the button to the right of **Options**. Those mods run in singleplayer only (the game pauses them on servers). Mods are stored per website, so mods you installed on another Eaglercraft site do not appear in Aerospace until you export them there (Mods → pick a mod → Export .zip) and import them here.

## What is different from stock Eaglercraft 26.3

**Shell**
- Aerospace boot screen with a starfield, progress bar and rotating tips, replacing the stock splash and the red loading screen
- New page title, icon, crash and rotate-device screens

**Client mods** (command deck → Client Mods)
- Optical zoom, with scroll to change strength
- Motion blur, with adjustable strength
- Screenshot key: copies the frame to the clipboard or saves a PNG
- Space radio: calm, endlessly generated ambient music
- Break reminder every 30 to 90 minutes
- Cosmetic helmet visor overlay and cinematic letterbox bars

**Shaders** (command deck → Shaders)
- Seven looks: Stock, Aerospace, Cinematic, Vibrant, Nebula, Retro CRT, Noir
- Fine-tuning: glow, sharpen, vignette, film grain, colour fringe, scanlines, contrast, warmth (any change becomes a Custom look)
- Visor filters (Night Vision, Solar Shield, Deep Space, Thermal, Lunar Mono), brightness that lifts dark caves without washing out the sky, and saturation

The shader engine replaces the one tiny shader the game uses to put each finished frame on screen, so the looks run on the GPU inside the game's own last draw. It only does this when that shader matches the stock one exactly and the replacement compiles on your device; otherwise the game keeps its own shader, and brightness, saturation and visor filters fall back to CSS. With every effect off it is an exact copy, like the original. Stock 26.3's own **Shader Packs...** button (in the pause menu) still works alongside it.

**HUD** (command deck → HUD)
- FPS, CPS, keystrokes, clock, mission timer, memory, frame-time graph, client badge
- Drag-and-drop layout, HUD scale and opacity, six accent colours

Client mods only read your own keyboard and mouse, and shaders only restyle the finished picture. Nothing reads game memory or changes what is sent to servers.

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
| `npm run preview:shell` | Builds a small mock page for working on the boot screen, deck and shaders without the game (its fake game presents frames exactly like 26.3) |
| `npm run check:shell` | Drives that page in headless Chromium and checks the shader engine and command deck (needs Playwright with Chromium) |
| `npm run art` | Regenerates the procedural art (needs Python 3 with Pillow and numpy) |
| `npm run content` | Regenerates advancements, paintings, recipe, splashes and language strings |

## Customising

| Path | Purpose |
| --- | --- |
| `aerospace/overlay/` | Files copied over the game's assets, using the same relative paths (`assets/...`, `data/...`) |
| `aerospace/lang/en_us.json` | Language strings merged into the game's language file |
| `aerospace/patches.json` | JSON merges and tag additions |
| `aerospace/shell/` | Boot screen, stylesheet, shader engine (`shaders.js`) and the client layer (`client.js`) |
| `tools/art/` | Procedural art generator |
| `tools/content/` | Generator for the data-driven content |

To change a texture, run `npm run unpack`, copy the file you want from `.cache/upstream-assets/` to the same path under `aerospace/overlay/`, edit it and rebuild. The build fails with a clear message if a replacement texture has the wrong size, a language string has different placeholders, or an advancement or painting points at something that does not exist.

## Credits and legal

Aerospace Client is an unofficial fan project. It is not affiliated with or endorsed by Mojang or Microsoft.

- Minecraft is © Mojang AB.
- The browser port is the work of the Eaglercraft project (lax1dude, ayunami2000 and the 26.x port contributors). The title screen keeps the Eaglercraft build and port credit, and the in-game credits screen is unchanged.
- The Aerospace shell, client layer, tools, art and added content are original to this project and licensed under [Apache-2.0](LICENSE). That licence covers only those files; it grants no rights to Minecraft or Eaglercraft.

`docs/index.html` contains the compiled game and its assets, which belong to their respective owners. If you fork or host this project, you are responsible for making sure you are allowed to distribute it. See [NOTICE.md](NOTICE.md).
