---
title: "PocketJS - JavaScript UI applications"
---

The PocketJS player runs a packaged TypeScript/TSX UI on F101 using QuickJS-ng and a Rust UI core/renderer. Its default application is a small Solid interface; the same host can run upstream examples and a local rendering benchmark. The [component guide](../components/pocketjs.md) covers module integration, APIs, acceleration and ownership.

## Versions and verification

Use the matching 4.2.2 or 4.5 kernel/component branches from the [version guide](../zephyr-4-5.md), with separate environments and build directories. The player built on 4.5. Earlier board observations reported about 59 ticks/s for cards and 50 for motions, with hero/gallery also exercised. These are historical tick rates, not fresh 4.5 display or frame-rate measurements. The current sample wires touch and UART input; their behavior on 4.5 still needs target validation.

## Prepare the workspace

Complete the [Zephyr environment setup](../zephyr-setup-env.md) and [source checkout](../zephyr-get-source.md), then activate the environment for the selected version. Install the PocketJS submodules, Bun dependencies and Rust tools as described in [the component guide](../components/pocketjs.md). The sample enables hardware floating point and RVV, so it needs `nightly-2026-07-02` with `rust-src`, as well as Cargo and Bun on `PATH`.

The files under `zephyr-components/pocketjs/samples/player/` are:

| Path | Purpose |
| --- | --- |
| `app/` | Default 320×240 Solid application: `main.tsx`, `app.tsx`, manifest and host profile |
| `bench/` | 512×384 deterministic benchmark and its profile |
| `pocket.host.480x272.json` | Host profile for upstream applications such as hero |
| `src/main.c` | Package loading, guest/UI setup, tick loop, RGB565 buffers and display |
| `src/input.c` | Touch slots, gesture-to-button conversion and UART controls |
| `CMakeLists.txt`, `Kconfig`, `prj.conf` | Packaging rules, sample options and firmware configuration |

## Build and run

From the west workspace root, with the selected environment active:

```sh
west build -b yuzukineko -d build/pjs zephyr-components/pocketjs/samples/player
```

For 4.5 use `-d build/zephyr-4.5.0/pjs`. A successful build produces `zephyr/zephyr.elf` and `zephyr/zephyr.bin` inside the selected build directory. Check the actual build exit status and image layout, then start this RAM-image sample using [Build and run](../zephyr-build-run.md). It does not require writing a bootloader to NOR.

The player uses the chosen display and touch devices in the board DTS. On `yuzukineko`, the console is UART1, PB0/PB1, at 115200 baud. The default screen shows a blue card labelled `PocketJS · Zephyr F101`; the serial log reports the selected contract, dimensions and tick rate.

### Select an application

Use a separate build directory for each application:

```sh
west build -b yuzukineko -d build/pjs-hero zephyr-components/pocketjs/samples/player -- -DPOCKETJS_APP=hero
west build -b yuzukineko -d build/pjs-bench zephyr-components/pocketjs/samples/player -- -DPOCKETJS_LOCAL_APP=bench
```

For 4.5, use `build/zephyr-4.5.0/pjs-hero` and `build/zephyr-4.5.0/pjs-bench` respectively. The selection is a CMake cache setting; use the same selection when rebuilding, or a fresh directory when changing applications.

| Selection | Source | Logical canvas | Host profile / presentation |
| --- | --- | --- | --- |
| Default | `samples/player/app/` | 320×240 | `app/pocket.host.json`, `native` |
| `POCKETJS_APP=hero` | `pocketjs/apps/hero/` | 480×272 | `pocket.host.480x272.json`, `integer-fit` |
| `POCKETJS_LOCAL_APP=bench` | `samples/player/bench/` | 512×384 | `bench/pocket.host.json`, `native` |

Set one selector. `POCKETJS_APP` takes precedence when both are present. Other upstream apps need a matching viewport, capabilities and profile; the current upstream selector always supplies the 480×272 profile.

## Write a UI

The default `app/main.tsx` mounts a Solid component:

```tsx
import { mount } from "@pocketjs/framework/solid";
import App from "./app.tsx";

mount(() => <App />);
```

Its `app/app.tsx` is a minimal card:

```tsx
import { Text, View } from "@pocketjs/framework/solid/components";

export default function App() {
  return (
    <View class="w-full h-full bg-slate-950 items-center justify-center">
      <View class="w-64 h-24 rounded-xl bg-blue-600 items-center justify-center">
        <Text class="text-lg text-white font-bold">PocketJS · Zephyr F101</Text>
      </View>
    </View>
  );
}
```

Edit these files and rebuild with `west build -d build/pjs` (or the chosen 4.5 directory). The CLI tracks source dependencies and embeds the updated package into the firmware. The default card has no input handlers; receiving an input event will not change this static screen. For interaction, follow the benchmark's use of `onButtonPress`, `onFrame` and `BTN` from `@pocketjs/framework/lifecycle` and `@pocketjs/framework/input`.

These components and utility classes belong to PocketJS. Browser DOM, web networking and Node.js APIs are not provided. The current player embeds one package at build time; it does not load `.pocket` files from SD or offer live reload. For HTML/CSS page rendering, see [LiteHTML](html.md).

### Manifest and host profile

`app/pocket.json` selects the entry, framework and viewport. Its application section is:

```json
{
  "app": {
    "entry": "main.tsx",
    "output": "f101-player",
    "framework": "solid",
    "viewport": {
      "logical": [320, 240],
      "presentation": "native"
    }
  }
}
```

This is a fragment of the existing manifest, not a replacement for its required `pocket`, identity/version and engine fields. The default manifest uses `pocket: 2` and requires `input.buttons` and `text.glyphs.baked`.

The paired `pocket.host.json` describes what the host offers: `tickHz: 60`, physical viewport 320×240, the accepted logical viewport, `rasterDensity: 1`, and `input.buttons`, `input.touch`, `text.glyphs.baked` capabilities. Change the application viewport and host profile together. Its `platform: "esp-idf"`, `form: "takeover"` and schema name are fields of the existing packaging contract; keep them for this Zephyr integration. They do not select another RTOS at runtime.

CMake runs the PocketJS CLI with the manifest/profile, then `embed_package.py` generates the package bytes and host contract for the firmware. The `.pocket` file, dependency plan and generated C/header/assembly files are under the build tree's `pocketjs/player/` directory. Packaging prepares styles, fonts and image resources before the guest starts; text requires the baked glyphs used by the application.

## Touch and UART input

The sample accepts multiple touch slots from `zephyr,touch` and maps screen coordinates to the centered logical canvas. It prefers integer scaling when the canvas fits, otherwise scales down while preserving aspect ratio. Touches outside that canvas are excluded. First-finger swipes also produce direction buttons, and a tap produces Cross.

UART console keys work without a touch panel:

| Input | Action |
| --- | --- |
| `W` / `S` / `A` / `D` | Up / down / left / right |
| `J` or Space / `K` | Cross / Circle |
| `U` / `I` | Square / Triangle |
| `Q` / `E` | Left / right trigger |
| Enter / Tab or lowercase `b` | Start / Select |

Letters accept either case except the lowercase `b` shortcut. A serial terminal sends no key-release event, so the sample holds each button for a 110 ms pulse. The input log reports button bits and finger counts as they change. Applications must handle the corresponding input; input logging alone does not prove correct on-screen interaction.

## Display, memory and clock settings

The owner loop samples input, calls `pocketjs_ui_turn()`, renders damaged strips, commits each buffer's target state and flushes changed cache ranges. A separate video thread presents the newest completed RGB565 picture through `display_sunxi_show_rgb()`. Four dynamically allocated, 64-byte-aligned buffers allow rendering while the display holds a picture; each buffer has its own damage history.

At raster density 1, the four buffers use 614,400 bytes for the default app or 1,572,864 bytes for bench, before alignment. Add the QuickJS heap, Rust UI objects, raster/staging caches and stacks when estimating memory needs. The 4 MiB guest limit is not the application's total memory limit.

| Setting | Sample default | Meaning |
| --- | --- | --- |
| `CONFIG_POCKETJS_GUEST_HEAP_LIMIT` | `4194304` | QuickJS heap limit in bytes |
| `CONFIG_MAIN_STACK_SIZE` | `98304` | 96 KiB main stack; the player caps JavaScript at 64 KiB |
| `CONFIG_HEAP_MEM_POOL_SIZE` | `262144` | Zephyr kernel heap pool, separate from the libc arena |
| `CONFIG_COMMON_LIBC_MALLOC_ARENA_SIZE` | `-1` | libc arena uses available remaining memory |
| `CONFIG_SAMPLE_POCKETJS_CPU_MHZ` | `960` | Requested CPU clock; `0` keeps the loader's clock |
| `CONFIG_POCKETJS_TURN_STATS` | `y` | Script/tick/draw and script instruction statistics |
| `CONFIG_SAMPLE_POCKETJS_PROFILE` | Off | Optional main-thread program-counter sampling |

The sample raises CPU frequency in 72 MHz steps with a small checksum workload. This is not a full PSRAM stability test. Set `CONFIG_SAMPLE_POCKETJS_CPU_MHZ=0` when measuring at the loader's clock; record clock, app, viewport and acceleration settings with performance results. See [the component configuration](../components/pocketjs.md) for G2D/RVV options.

## Benchmark and statistics

`POCKETJS_LOCAL_APP=bench` runs 17 scenes in this order:

```text
idle fill round alpha text rotate image mixed spin calls objs scroll stretch zoom move kf still
```

Each scene lasts 360 ticks, with motion determined by the tick count. The automatic sequence ends at `still`. Press `D` for the next scene or `A` for the previous one; this stops automatic selection. Press `J` to toggle automatic selection. Set `LOOK` in `bench/app.tsx` to a scene name to hold that workload. Scene changes emit `BENCH` markers.

Every approximately five seconds, the player reports tick and picture counts, average/maximum busy time, turn/render/cache-flush time, G2D/software operation counts and damage pixels. With turn statistics enabled it also reports script/tick/draw time and script cycles/instructions/IPC. `ticks` count UI turns; `pictures` count submitted updates with damage. The video thread may skip superseded pictures, so neither counter is a direct displayed-FPS measurement. A 60 Hz contract is a scheduling target, not a performance guarantee.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Missing PocketJS/QuickJS files or Bun packages | Initialize both pinned submodules and install the CLI dependencies |
| Cargo target, `rust-src` or ABI errors | Check the pinned nightly, FPU/RVV target selection and C/Rust ABI; use a fresh build directory after changing versions |
| Package selection or asset-feed failure | Check manifest/profile agreement and regenerate package bytes and contract together |
| `display not ready` or `show_rgb failed` | Check the board DTS, selected display and RAM-image startup path |
| Input log changes but the card stays still | The default card is static; select an interactive app or add handlers |
| Touch position is offset | Check physical panel dimensions, logical canvas, centering/scaling and the touch driver's coordinates |
| Allocation failure, stack error or reset | Account for native/buffer memory, the actual RAM region and the owner-thread stack; reduce workload and check clock stability |
| Low tick rate or zero G2D counts | Compare script versus render cost and damage area; small operations and some blends stay on the CPU |

For API lifetime rules and host raster checks, return to [PocketJS component integration](../components/pocketjs.md).
