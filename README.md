# Aerospace Client

A space-themed browser client built on **Eaglercraft 26.3** (zeus/master).

Aerospace Client takes the stock single-file Eaglercraft 26.3 build and turns it into its own client: new boot screen, new title screen and panorama, a restyled interface, client mods, shader looks, a HUD, a crash log, a launcher, and the **Space Expansion** Lua mod: placeable 3D rockets, landing pads, fuel, five new worlds with their own gravity, and dungeons with bosses. The game code itself (the three WebAssembly images) is passed through byte-for-byte.

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

## Launcher

Opening the page shows the Aerospace launcher straight away, while the browser is still reading the ~77 MB game file. The game decodes and compiles itself in the background, so by the time you press **LAUNCH** it is usually ready ("GAME DATA: prepared · launches instantly") and starts within seconds.

- **LAUNCH**: the launch switch, your call sign (it becomes your in-game username) and a systems check with values read from your device: WebGL, memory hint, screen, CPU threads, connection, storage and how far the game data has got
- **SERVERS**: keep server addresses and copy them for Multiplayer Fleet
- **SETTINGS**: launcher sounds, ambient drone, starfield density, reduced motion, skip the boot animation, FPS counter
- **ABOUT**: version and credits

The menu works with the keyboard (arrows, Enter, Escape), touch and a mouse, and stacks into a bottom bar on phones. Loading shows the game's real stages, the time taken and, after 20 seconds, a "still working" note; if launching fails it shows the error with Retry and a button to open another copy of the game file. On LAUNCH the menu removes itself completely, and the loading screen goes once the game is on screen.

## Space Expansion

The expansion is the **Aerospace Lua mod**, installed and enabled the first time Aerospace Client starts, together with the game data it uses (worlds, items, recipes, dungeons). It is in the game's Mods screen (title screen → Mods), where you can disable or delete it; a deleted mod is not reinstalled. Lua mods run in singleplayer (and LAN worlds you host).

**Rockets and flights need cheats allowed in the world** (Allow Cheats when you create it, or Open to LAN with cheats on): placing pads, moving fuel, travel and gravity are done with game commands. When you create a world the game warns that it uses experimental settings because of the extra worlds; choose **Yes** (or "I Know What I'm Doing" when reopening it).

| Item | Recipe |
| --- | --- |
| Landing Pad | Yellow concrete, black concrete, yellow concrete; smooth stone, redstone lamp, smooth stone; 3 smooth stone |
| Rocket | Lightning rod on top; iron block, glass, iron block; iron block, blast furnace, iron block |
| Rocket Fuel (×2) | Copper ingot, 2 coal or charcoal, gunpowder, blaze powder (shapeless) |
| Space Helmet, Suit, Leggings, Boots | Iron ingots with tinted glass (helmet) or white wool |

1. **Build a pad**: right click the ground with a Landing Pad.
2. **Place the rocket**: right click the middle of the pad with the Rocket. It stands there as a 3D model.
3. **Fuel and launch**: right click the rocket to open its panel: load Rocket Fuel (up to 8), pick a world, and watch the countdown and liftoff. Trips cost 1 to 4 fuel.
4. **Arrive**: you land on a new pad with your rocket and the fuel that is left, so you can fly on or home. "Pick up the rocket" in the panel gives back the rocket and its fuel.

| World | Gravity | Air | What is there |
| --- | --- | --- | --- |
| Asteroid Belt | 1/10 | no | Floating rock full of ore under a black sky, derelict stations |
| The Moon | 1/6 | no | Grey regolith and basalt seas, Moon Cows, Lunar Outposts |
| Mars | 0.38 | yes | Red deserts and canyons, Mars Pigs, step pyramids |
| Glacio | 3/4 | yes | Ice spikes, frozen seas, Glacio Chickens, Ice Vaults |
| Vulcan | 1.25× | yes | Lava seas and basalt deltas, Magma Forges (bring fire resistance) |

**Gravity** changes how high you jump and how far you can fall safely. **Oxygen**: on the Moon and in the Asteroid Belt you have 30 seconds of air without a Space Helmet (the HUD shows it). Both can be turned off in the mod's settings.

**Dungeons** appear more often than before: each world has ruins with a spawner, loot and a named boss (Outpost Overseer, Martian Warlord, Frost Lich, Magma Tyrant, Station Warden), and crashed rockets on Earth hide fuel and sometimes a Rocket. **Advancements**: 16 in the Aerospace Program tab. Type `/aerospace` in chat for help and status.

**Also bundled**: the Sodium and Lithium Lua ports by UserArham (latest releases, see `aerospace/mods/vendor/`), installed and enabled the same way. Each shows its own performance panel; they can be disabled in the Mods screen.

## What is different from stock Eaglercraft 26.3

**Shell**
- The launcher (see above), shown while the game data loads, with the game prepared in the background
- Aerospace boot screen with a starfield, progress bar and rotating tips, replacing the stock splash and the red loading screen
- New page title, icon, crash and rotate-device screens

**Crash log** (command deck → Crash Log)
- Records what the game prints to the browser console from the moment the page opens, including the game's background workers
- When the game fails it shows a panel with the cause and **Copy** / **Download** buttons; the last crash report is kept after a reload
- Nothing is uploaded anywhere

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
- The Space Expansion (see above): Rocket, Rocket Fuel, Space Suit and Flight Manual; Mission Control; five new worlds (Asteroid Belt, Moon, Mars, Glacio, Vulcan) with their own terrain, sky, fog and music; Moon Cows, Mars Pigs and Glacio Chickens; six dungeons with guards, bosses and loot
- New "Aerospace Program" advancement tab with 27 advancements
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
| `npm test` | Tests for the archive and single-file formats, and for the data validator (it must pass the shipped files and catch 21 deliberate mistakes, including any function file; skipped until the build has downloaded the upstream file) |
| `npm run unpack` | Extracts the stock assets to `.cache/upstream-assets/` so you can see what can be overridden |
| `npm run preview:shell` | Builds a small mock page for working on the boot screen, deck and shaders without the game (its fake game presents frames exactly like 26.3) |
| `npm run check:shell` | Drives that page in headless Chromium and checks the shader engine, command deck and crash log (needs Playwright with Chromium) |
| `npm run art` | Regenerates the procedural art (needs Python 3 with Pillow and numpy) |
| `npm run content` | Regenerates advancements, paintings, recipe, splashes and language strings |
| `npm run expansion` | Regenerates the Space Expansion: items, recipes, worlds, terrain, dungeons, Mission Control, advancements, textures and strings (needs Python 3 and `npm run unpack` first) |

## Customising

| Path | Purpose |
| --- | --- |
| `aerospace/overlay/` | Files copied over the game's assets, using the same relative paths (`assets/...`, `data/...`) |
| `aerospace/lang/en_us*.json` | Language strings merged into the game's language file (`en_us.expansion.json` is generated by `tools/expansion/`) |
| `aerospace/patches*.json` | JSON merges and tag additions |
| `aerospace/shell/` | Launcher (`launcher.*`), bundled mod installer (`modseed.js`), crash log (`crashlog.js`), shader engine (`shaders.js`), client layer (`client.js`) and stylesheet |
| `aerospace/mods/aerospace/` | The Aerospace Lua mod (`main.lua`; `items.lua` is generated) |
| `aerospace/mods/vendor/` | Bundled third-party Lua mods with their licences |
| `tools/art/` | Procedural art generator |
| `tools/content/` | Generator for the data-driven content |
| `tools/expansion/` | Generator for the Space Expansion. It starts every world-generation file from the matching stock 26.3 file, so the formats match the game |
| `tools/lib/validate.js` | Static checks the build runs on every data and resource pack file it adds |

To change a texture, run `npm run unpack`, copy the file you want from `.cache/upstream-assets/` to the same path under `aerospace/overlay/`, edit it and rebuild. The build fails with a clear message if a replacement texture has the wrong size, a language string has different placeholders, or an advancement or painting points at something that does not exist.

Everything Aerospace adds to the game's data pack goes through a static validator before the build packs it, because one bad entry in the built-in data pack would stop every world from loading. It compares each file's keys and value types with the stock 26.3 files of the same kind, resolves every ID (items, blocks and block states, entities, sounds, particles, effects, attributes, world-generation entries, loot tables, advancements, dialogs, models, textures and translations), lints the commands behind dialog buttons, rejects data-pack functions (which this Eaglercraft build cannot load) and checks the structure templates. It cannot run the game, so a world can still behave differently from what the files intend.

## Credits and legal

Aerospace Client is an unofficial fan project. It is not affiliated with or endorsed by Mojang or Microsoft.

- Minecraft is © Mojang AB.
- The browser port is the work of the Eaglercraft project (lax1dude, ayunami2000 and the 26.x port contributors). The title screen keeps the Eaglercraft build and port credit, and the in-game credits screen is unchanged.
- The Aerospace shell, client layer, tools, art and added content are original to this project and licensed under [Apache-2.0](LICENSE). That licence covers only those files; it grants no rights to Minecraft or Eaglercraft.

`docs/index.html` contains the compiled game and its assets, which belong to their respective owners. If you fork or host this project, you are responsible for making sure you are allowed to distribute it. See [NOTICE.md](NOTICE.md).
