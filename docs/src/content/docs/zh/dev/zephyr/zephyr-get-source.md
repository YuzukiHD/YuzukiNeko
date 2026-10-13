---
title: "获取 Zephyr 代码"
---

这一页把 F101 版 Zephyr 的源码和它依赖的全部模块拉到本地，装好 Python 依赖，并编译一个 `hello_world` 确认环境没问题。开始前请先完成 [配置开发环境](zephyr-setup-env.md)。

## 代码在哪里

F101 的 Zephyr 支持不在 YuzukiNeko 硬件仓库里，而是一个 Zephyr 上游的 fork：

| 项 | 值 |
| --- | --- |
| 仓库 | <https://github.com/YuzukiHD/zephyr> |
| 默认分支 | `zephyr-v4.2.2-f101`（基于 Zephyr v4.2.2） |
| SoC | `soc/allwinner/sun252i_f101` |
| 设备树 | `dts/riscv/allwinner/sun252i_f101.dtsi` |
| 板级 | `boards/yuzukihd/yuzukineko`、`boards/yuzukihd/f101_evb` |

这个仓库本身就是 west 的 manifest 仓库：根目录的 `west.yml` 沿用上游 Zephyr 的写法，列出了 HAL、CherryUSB、mbedTLS 等所有依赖模块。所以不需要另外找一个 manifest，直接用它初始化工作区。

## 初始化工作区

先进入环境，再 `west init`。`~/f101-zephyr` 里已经有 `.venv/`、`toolchains/` 和 `env.sh`，west 可以直接在这个非空目录里初始化：

```sh
. ~/f101-zephyr/env.sh
west init -m https://github.com/YuzukiHD/zephyr ~/f101-zephyr
```

成功后会看到：

```text
=== Initialized. Now run "west update" inside /home/<你>/f101-zephyr.
```

这一步只克隆了 `zephyr/` 这一个仓库，并生成 `.west/config`：

```ini
[manifest]
path = zephyr
file = west.yml
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-get-source/init.cast" data-speed="6"></div>

:::tip
想用别的分支或标签，初始化时加 `--mr <分支或标签>`，例如 `west init -m https://github.com/YuzukiHD/zephyr --mr main ~/f101-zephyr`。已经初始化过的，进入 `zephyr/` 用 `git checkout` 切换，再回到工作区跑一遍 `west update`。
:::

:::caution
如果 `west init` 报 `already initialized in ...`，说明上级目录（比如你的 `$HOME`）里有一个遗留的 `.west`。west 不允许嵌套工作区，需要先确认那个目录没用，再删掉它。
:::

## 拉取模块

```sh
cd ~/f101-zephyr
west update --narrow -o=--depth=1
```

| 参数 | 作用 |
| --- | --- |
| `--narrow` | 只拉 manifest 里固定的那个提交，不拉分支历史 |
| `-o=--depth=1` | 把 `--depth=1` 传给 `git fetch`，只取一层历史，省流量和磁盘 |

这一步要拉约 60 个仓库，耗时取决于网络。完成后工作区大约占 <strong>6.4 GB</strong>（`zephyr/` 本身保留了完整历史）。过程中断了不要紧，重新执行同一条命令即可继续。

确认模块都到位：

```sh
west list
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-get-source/update.cast" data-speed="8"></div>

输出的第一行是 `manifest  zephyr  HEAD`，其后是 `modules/` 下各个项目，一共 60 行。

:::tip
`west update` 默认已经跳过 `babblesim` 和 `optional` 两个分组，不会去拉仿真器之类用不上的东西。F101 需要的 `cherryusb`（USB 协议栈）和 `opencore`（AAC 解码）都在默认分组里。
:::

## 获取 zephyr-components

`zephyr` 这个仓库只含内核、SoC、板级和驱动。基于这套移植的<strong>应用和扩展模块</strong>放在另一个仓库 [`YuzukiHD/zephyr-components`](https://github.com/YuzukiHD/zephyr-components)，它不在 west manifest 里，需要单独克隆。

| 目录 | 内容 |
| --- | --- |
| `uf2-downloader/` | 一个应用，不是模块：让板子显示为 `F101BOOT` 盘，写入拖进来的 `.uf2`；自带 `tools/mkuf2.py`。[编译与运行](zephyr-build-run.md) 的 UF2 下载方式要用 |
| `micropython/`、`mgba/`、`nes/`、`doom/` | MicroPython、模拟器、Doom 的移植 |
| `ncnn/`、`pocketjs/`、`litehtml/` | 神经网络推理、JS 运行时、HTML 渲染 |
| `aic8800/`、`android-screen-mirror/`、`ios-screen-mirror/` | WiFi 驱动和手机投屏 |
| `bochs/` | x86 PC 模拟器 |

除 `uf2-downloader/` 外，每个目录都是一个独立的 Zephyr 模块（带 `zephyr/module.yml`），用法以各目录的 README 为准。

克隆（默认用最新的 `main`；被注释掉的 `checkout` 行可固定到本文最初验证时的旧提交）：

```sh
cd ~/f101-zephyr
git clone https://github.com/YuzukiHD/zephyr-components.git
# 默认使用最新的 main。下面这行会固定到本文最初验证时的旧提交（2026-10-10），
# 它早于 gbsp/ 和 nekobox/，除非确实需要那个版本，否则保持注释掉。
# git -C zephyr-components checkout 282361ce5883bd65c228da584758e4796bf439e7
```

只用 `uf2-downloader/` 时到此为止。要用其他模块，还需要拉它们的上游子模块，例如 MicroPython：

```sh
git -C zephyr-components submodule update --init micropython/micropython
```

使用时把模块目录加进 `ZEPHYR_EXTRA_MODULES`（在命令行用 `-DZEPHYR_EXTRA_MODULES=/path/to/module`，或写在应用的 `CMakeLists.txt` 里 `find_package(Zephyr)` 之前）。

:::tip
各模块的上游许可证不同，`doom/`、`nes/` 是 GPL-2.0，链接了它们的镜像也是 GPL-2.0。
:::

## 目录结构

拉取完成后，工作区变成这样：

```text
~/f101-zephyr/
├── .venv/              Python 虚拟环境
├── .west/              west 工作区标记
├── toolchains/         玄铁工具链
├── env.sh
├── zephyr/             F101 版 Zephyr 内核（west manifest 仓库）
├── zephyr-components/  应用和扩展模块（单独克隆，不在 west 里）
├── modules/
│   ├── hal/            各厂商 HAL（F101 不用，但 west.yml 里有）、CMSIS
│   ├── lib/            cherryusb、opencore、picolibc、gui/lvgl 等
│   ├── crypto/         mbedtls、tinycrypt
│   ├── fs/             fatfs、littlefs
│   ├── debug/          segger、percepio 等
│   └── tee/            trusted-firmware 系列
└── tools/              edtt、net-tools
```

在 `zephyr/` 里和 F101 相关的位置：

| 路径 | 内容 |
| --- | --- |
| `soc/allwinner/sun252i_f101/` | SoC 初始化（`soc.c`）、中断入口、缓存、MMU 区域、pinctrl 头文件 |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC 设备树 |
| `dts/bindings/*/allwinner,sunxi-*.yaml` | 外设的设备树 binding |
| `boards/yuzukihd/yuzukineko/` | YuzukiNeko 板级：`yuzukineko.dts`、`yuzukineko_defconfig` |
| `boards/yuzukihd/f101_evb/` | F101 评估板板级 |
| `drivers/` | 时钟/复位、pinctrl、GPIO、I2C、SPI、PWM、ADC、DMA、显示、G2D、`vdec` 等驱动 |
| `samples/drivers/`、`samples/subsys/` | 针对这套硬件的示例 |

## 安装 Python 依赖

代码到手之后，才能装 Zephyr 的 Python 依赖。让 west 读取工作区里所有项目的 `requirements.txt` 一并安装：

```sh
. ~/f101-zephyr/env.sh
west packages pip --install
```

这会安装 `pyelftools`、`PyYAML`、`pykwalify` 等编译需要的包，也包括测试和合规检查用的包，数量较多，装一次即可。

装完后重新 source 一次，这回 `ZEPHYR_BASE` 会被设上：

```sh
. ~/f101-zephyr/env.sh
echo $ZEPHYR_BASE
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-get-source/pip.cast" data-speed="3"></div>

应输出 `/home/<你>/f101-zephyr/zephyr`。

## 验证：编译 hello_world

```sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/hello zephyr/samples/hello_world
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-get-source/build.cast"></div>

成功时结尾类似：

```text
Memory region         Used Size  Region Size  %age Used
             RAM:     2092112 B     16320 KB     12.52%
        IDT_LIST:           0 B         4 KB      0.00%
Generating files from .../build/hello/zephyr/zephyr.elf for board: yuzukineko
```

产物在 `build/hello/zephyr/` 下，`zephyr.bin` 就是之后要载入板子的镜像，链接地址是 `0x40000000`。怎样下载到板子并看到控制台输出，见 [编译与运行](zephyr-build-run.md)。

## 更新代码

以后要同步最新的 F101 改动：

```sh
cd ~/f101-zephyr/zephyr
git pull
cd ..
west update --narrow -o=--depth=1
```

先更新 `zephyr/`，因为模块的版本是由它的 `west.yml` 决定的；然后 `west update` 把模块对齐到新的提交。如果 `west.yml` 里 Python 依赖有变化，再跑一次 `west packages pip --install`。

## 常见问题

<strong>`west update` 卡在某个仓库，或报 `Connection reset` / `RPC failed`</strong>：GitHub 访问不稳定导致。重新执行同一条命令会接着拉。反复失败时可以给 git 配代理，或加大缓冲：`git config --global http.postBuffer 524288000`。

<strong>`west: unknown command "build"`</strong>：当前目录不在工作区里，或者没有进入虚拟环境。先 `. ~/f101-zephyr/env.sh`，再 `cd` 到 `~/f101-zephyr`。

<strong>编译报 `riscv64-unknown-elf-gcc: command not found`</strong>：没有 source `env.sh`，或者 `env.sh` 里工具链的路径写错。参照 [配置开发环境](zephyr-setup-env.md) 的检查清单排查。

<strong>`No module named 'yaml'` / `pyelftools`</strong>：Python 依赖没装，或者装在了系统 Python 里。确认提示符前有 `(.venv)`，再运行 `west packages pip --install`。
