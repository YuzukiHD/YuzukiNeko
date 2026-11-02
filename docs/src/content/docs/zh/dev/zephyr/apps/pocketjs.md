---
title: "PocketJS - JavaScript UI 应用"
---

PocketJS 播放器通过 QuickJS-ng 和 Rust UI 核心／渲染器在 F101 上运行打包的 TypeScript／TSX 界面。默认应用是简单的 Solid 界面，同一 host 还可运行上游示例和本地渲染 benchmark。[组件指南](../components/pocketjs.md)介绍模块接入、API、加速与所有权。

## 版本与验证

按[版本指南](../zephyr-4-5.md)选择配套的 4.2.2 或 4.5 内核／组件分支，使用独立环境和构建目录。播放器已在 4.5 构建。此前板上记录为 cards 约 59 ticks/s、motions 约 50，也运行过 hero/gallery；这些是历史 tick 速率，不是本次 4.5 的显示或帧率实测。当前样例已接入触摸与 UART 输入，其在 4.5 上的行为仍需实机验证。

## 准备工作区

完成 [Zephyr 环境配置](../zephyr-setup-env.md)和[源码获取](../zephyr-get-source.md)，激活所选版本的环境，再按[组件指南](../components/pocketjs.md)安装 PocketJS 子模块、Bun 依赖及 Rust 工具。样例启用硬浮点和 RVV，因此需要带 `rust-src` 的 `nightly-2026-07-02`，并将 Cargo 和 Bun 加入 `PATH`。

`zephyr-components/pocketjs/samples/player/` 下的文件如下：

| 路径 | 用途 |
| --- | --- |
| `app/` | 默认 320×240 Solid 应用：`main.tsx`、`app.tsx`、manifest 与 host profile |
| `bench/` | 512×384 确定性 benchmark 及其 profile |
| `pocket.host.480x272.json` | hero 等上游应用使用的 host profile |
| `src/main.c` | 包加载、guest／UI 初始化、tick 循环、RGB565 缓冲与显示 |
| `src/input.c` | 触摸槽位、手势转按键及 UART 控制 |
| `CMakeLists.txt`、`Kconfig`、`prj.conf` | 打包规则、样例选项与固件配置 |

## 构建与运行

在 west 工作区根目录激活所选环境后执行：

```sh
west build -b yuzukineko -d build/pjs zephyr-components/pocketjs/samples/player
```

4.5 使用 `-d build/zephyr-4.5.0/pjs`。成功构建后，所选目录下生成 `zephyr/zephyr.elf` 和 `zephyr/zephyr.bin`。检查真实构建退出状态与镜像布局，再按[编译与运行](../zephyr-build-run.md)启动这一 RAM 镜像样例，无需向 NOR 写入 bootloader。

播放器使用板级 DTS 选择的显示与触摸设备。`yuzukineko` 控制台为 UART1，PB0/PB1，波特率 115200。默认画面是标有 `PocketJS · Zephyr F101` 的蓝色卡片，串口会报告选中的 contract、尺寸和 tick 频率。

### 选择应用

每个应用使用独立构建目录：

```sh
west build -b yuzukineko -d build/pjs-hero zephyr-components/pocketjs/samples/player -- -DPOCKETJS_APP=hero
west build -b yuzukineko -d build/pjs-bench zephyr-components/pocketjs/samples/player -- -DPOCKETJS_LOCAL_APP=bench
```

4.5 分别使用 `build/zephyr-4.5.0/pjs-hero` 和 `build/zephyr-4.5.0/pjs-bench`。应用选择保存在 CMake 缓存中，增量构建时保留原选择，切换应用时使用新目录。

| 选择 | 源码 | 逻辑画布 | Host profile／显示方式 |
| --- | --- | --- | --- |
| 默认 | `samples/player/app/` | 320×240 | `app/pocket.host.json`，`native` |
| `POCKETJS_APP=hero` | `pocketjs/apps/hero/` | 480×272 | `pocket.host.480x272.json`，`integer-fit` |
| `POCKETJS_LOCAL_APP=bench` | `samples/player/bench/` | 512×384 | `bench/pocket.host.json`，`native` |

只设置一个选择参数；同时存在时 `POCKETJS_APP` 优先。其他上游应用需要匹配的视口、能力及 profile；当前上游选择器始终传入 480×272 profile。

## 编写界面

默认 `app/main.tsx` 挂载一个 Solid 组件：

```tsx
import { mount } from "@pocketjs/framework/solid";
import App from "./app.tsx";

mount(() => <App />);
```

`app/app.tsx` 是最小卡片界面：

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

修改后执行 `west build -d build/pjs`，或所选的 4.5 构建目录。CLI 跟踪源码依赖，并将更新后的包嵌入固件。默认卡片没有输入处理器，收到输入也不会改变静态画面。交互实现可参考 benchmark 对 `@pocketjs/framework/lifecycle`、`@pocketjs/framework/input` 中 `onButtonPress`、`onFrame` 和 `BTN` 的使用。

这些组件及工具类属于 PocketJS，不提供浏览器 DOM、网页网络或 Node.js API。当前播放器在构建时嵌入一个包，不从 SD 加载 `.pocket`，也不提供热更新。HTML／CSS 页面渲染请看 [LiteHTML](html.md)。

### Manifest 与 host profile

`app/pocket.json` 选择入口、框架和视口，其中应用部分如下：

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

这是现有 manifest 的片段，不能代替必需的 `pocket`、标识／版本和 engine 字段。默认 manifest 使用 `pocket: 2`，要求 `input.buttons` 和 `text.glyphs.baked`。

配套的 `pocket.host.json` 描述 host 提供的能力：`tickHz: 60`、320×240 物理视口、接受的逻辑视口、`rasterDensity: 1`，以及 `input.buttons`、`input.touch`、`text.glyphs.baked`。修改应用视口时应同步修改 host profile。其中的 `platform: "esp-idf"`、`form: "takeover"` 和 schema 名称属于现有打包 contract，当前 Zephyr 接入应保留这些字段；它们不会在运行时选择另一个 RTOS。

CMake 先向 PocketJS CLI 传入 manifest／profile，再由 `embed_package.py` 生成固件使用的包数据与 host contract。`.pocket`、依赖计划和生成的 C／头文件／汇编文件位于构建树的 `pocketjs/player/` 目录下。样式、字体和图像资源在 guest 启动前打包准备，文字需要包含应用使用的烘焙字形。

## 触摸与 UART 输入

样例接收 `zephyr,touch` 的多指槽位，并把屏幕坐标映射到居中的逻辑画布。画布放得下时优先整数倍缩放，否则保持宽高比缩小；画布外的触摸不传入。首指滑动还会产生方向键，轻点产生 Cross。

没有触摸屏时可用 UART 控制台按键：

| 输入 | 动作 |
| --- | --- |
| `W` / `S` / `A` / `D` | 上／下／左／右 |
| `J` 或空格 / `K` | Cross / Circle |
| `U` / `I` | Square / Triangle |
| `Q` / `E` | 左／右肩键 |
| Enter / Tab 或小写 `b` | Start / Select |

除小写 `b` 快捷键外，字母均接受大小写。串口终端没有松键事件，样例将每次按键保持为 110 ms 脉冲。按键位或手指数变化时会输出输入日志。应用必须处理对应输入，单有输入日志不能证明屏幕交互正确。

## 显示、内存与时钟配置

主循环采样输入、调用 `pocketjs_ui_turn()`、绘制脏区条带、提交逐缓冲 target 状态并刷新变更范围的 cache。独立 video 线程通过 `display_sunxi_show_rgb()` 显示最新完成的 RGB565 图像。四张动态申请、64 字节对齐的缓冲允许显示持有图像时继续绘制，每张缓冲保留独立脏区历史。

栅格密度为 1 时，四张缓冲在默认应用占用 614,400 字节，bench 占用 1,572,864 字节，尚未计入对齐。估算内存时还需加上 QuickJS 堆、Rust UI 对象、栅格／暂存缓存及线程栈。4 MiB guest 上限并非应用总内存上限。

| 配置 | 样例默认值 | 含义 |
| --- | --- | --- |
| `CONFIG_POCKETJS_GUEST_HEAP_LIMIT` | `4194304` | QuickJS 堆上限，字节 |
| `CONFIG_MAIN_STACK_SIZE` | `98304` | 96 KiB 主栈，播放器将 JavaScript 限制为 64 KiB |
| `CONFIG_HEAP_MEM_POOL_SIZE` | `262144` | Zephyr 内核堆池，与 libc arena 分开 |
| `CONFIG_COMMON_LIBC_MALLOC_ARENA_SIZE` | `-1` | libc arena 使用剩余可用内存 |
| `CONFIG_SAMPLE_POCKETJS_CPU_MHZ` | `960` | 请求的 CPU 时钟，`0` 保持 loader 设置 |
| `CONFIG_POCKETJS_TURN_STATS` | `y` | script／tick／draw 与脚本指令统计 |
| `CONFIG_SAMPLE_POCKETJS_PROFILE` | 关闭 | 可选主线程程序计数器采样 |

样例按 72 MHz 步进提高 CPU 频率，并执行小块校验负载，不能替代完整 PSRAM 稳定性测试。需按 loader 时钟测量时设置 `CONFIG_SAMPLE_POCKETJS_CPU_MHZ=0`；记录性能结果时应注明时钟、应用、视口和加速配置。G2D／RVV 选项见[组件配置](../components/pocketjs.md)。

## Benchmark 与统计

`POCKETJS_LOCAL_APP=bench` 按以下顺序运行 17 个场景：

```text
idle fill round alpha text rotate image mixed spin calls objs scroll stretch zoom move kf still
```

每个场景持续 360 ticks，运动由 tick 数决定，自动序列最终停在 `still`。按 `D` 切到下一场景，`A` 切到上一场景，同时停止自动选择；按 `J` 切换自动选择。在 `bench/app.tsx` 中把 `LOOK` 设为场景名，可固定该负载。切换场景会输出 `BENCH` 标记。

播放器约每五秒报告 tick／picture 数、平均／最大 busy 耗时、turn／render／cache flush 耗时、G2D／软件操作数及脏区像素。启用 turn 统计后，还会报告 script／tick／draw 耗时和脚本 cycles／instructions／IPC。`ticks` 统计 UI turn，`pictures` 统计有脏区且已提交的更新；video 线程可能跳过被替代的图像，两者均不能直接视为实际显示 FPS。60 Hz contract 是调度目标，不是性能保证。

## 常见问题

| 现象 | 检查项 |
| --- | --- |
| 缺 PocketJS／QuickJS 文件或 Bun 包 | 初始化两个固定版本子模块，安装 CLI 依赖 |
| Cargo target、`rust-src` 或 ABI 错误 | 检查固定 nightly、FPU／RVV target 选择和 C／Rust ABI；切换版本后使用新构建目录 |
| 包选择或资源装载失败 | 核对 manifest／profile，一起重新生成包数据和 contract |
| `display not ready` 或 `show_rgb failed` | 检查板级 DTS、所选显示和 RAM 镜像启动路径 |
| 输入日志变化但卡片不动 | 默认卡片是静态界面，选择交互应用或添加处理器 |
| 触摸位置偏移 | 核对物理屏尺寸、逻辑画布、居中／缩放和触摸驱动坐标 |
| 分配失败、栈错误或复位 | 计入原生对象／缓冲内存、实际 RAM 区域和所属线程栈，降低负载并检查时钟稳定性 |
| tick 速率低或 G2D 计数为零 | 对比脚本与渲染耗时及脏区面积，小操作和部分混合由 CPU 处理 |

API 有效期规则与主机栅格检查见 [PocketJS 组件接入](../components/pocketjs.md)。
