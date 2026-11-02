---
title: "获取 Zephyr 代码"
---

F101 的内核、SoC、板级和驱动位于 [`YuzukiHD/zephyr`](https://github.com/YuzukiHD/zephyr)，应用与扩展模块位于 [`YuzukiHD/zephyr-components`](https://github.com/YuzukiHD/zephyr-components)。**4.2.2 与 4.5.0 并存。** 请按[版本指南](zephyr-4-5.md)选择配套组合；下列命令初始化保留的 4.2.2 工作区。开始前先完成[环境配置](zephyr-setup-env.md)。

## 初始化 4.2.2 工作区

工作区已有 `.venv/`、`toolchains/` 和 `env.sh`，根目录本身不是 Git 仓库。显式指定分支：

```sh
. ~/f101-zephyr/env.sh
west init -m https://github.com/YuzukiHD/zephyr --mr zephyr-v4.2.2-f101 ~/f101-zephyr
cd ~/f101-zephyr
west update --narrow fatfs lvgl mbedtls cherryusb opencore
git clone --branch main https://github.com/YuzukiHD/zephyr-components.git
west packages pip --install
```

`zephyr/west.yml` 是 manifest，`west update` 使用其中固定的版本。指定的子集覆盖常见 F101 应用，无需获取无关 HAL；应用需要其他 manifest 项目时再补充，或用 `west update --narrow` 更新所有启用的分组。中断后可重复执行。仓库数量和磁盘占用取决于所选版本及获取的历史。

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-get-source/init.cast" data-speed="6"></div>

本页录像是历史 4.2.2 会话；当前命令已显式指定分支和所需模块。

:::caution
west 工作区不能嵌套。初始化发现上级 `.west` 时，先确认它所属的工作区，再选择独立目录。保留已有工作区，不要为了初始化而删除其配置。
:::

## 初始化独立的 4.5 工作区

使用并列目录，例如 `~/f101-zephyr-4.5`，配置它自己的环境脚本和 Python 3.12+ 虚拟环境。两个远程分支都可获取后，以 `--mr zephyr-v4.5.0-f101` 初始化，以 `--branch zephyr-v4.5.0-f101` 克隆组件。在该工作区获取：

```sh
west update --narrow fatfs lvgl mbedtls tf-psa-crypto tf-psa-crypto-drivers cherryusb opencore
```

[4.5 指南](zephyr-4-5.md)列出环境要求、接口变化、源码提交、发布状态及切换／回退命令。独立工作区让两版可同时使用，不会改变对方的依赖检出。

## 应用与模块

组件不属于 west manifest，需要在与内核匹配的分支上单独更新。

| 目录 | 内容 |
| --- | --- |
| `nekobox/`、`bilibili-tv/`、`uf2-downloader/` | 应用：媒体／游戏 UI、在线视频客户端、可选 UF2 下载器 |
| `micropython/`、`mgba/`、`gbsp/`、`nes/`、`doom/`、`bochs/` | 语言运行时、游戏与 PC 模拟器 |
| `ncnn/`、`pocketjs/`、`litehtml/` | 推理、JavaScript UI 运行时和 HTML 渲染 |
| `aic8800/` | Wi-Fi／蓝牙驱动、Wi-Fi Direct 控制 |
| `android-screen-mirror/`、`ios-screen-mirror/`、`miracast/` | ADB/scrcpy、AirPlay 与 Android 无线显示接收器 |
| `dlna/` | UPnP 媒体接收协议 |
| `examples/` | 驱动／组件文章使用的独立 API 示例 |

模块带有 `zephyr/module.yml`，应用不一定带有该文件。应用的 `CMakeLists.txt` 通常自行加入所需的相邻模块；自建应用应在 `find_package(Zephyr)` 前把模块目录加入 `ZEPHYR_EXTRA_MODULES`。

只获取所选应用需要的上游子模块，例如：

```sh
git -C zephyr-components submodule update --init micropython/micropython
```

嵌套子模块和主机工具以各应用 README 为准。模块的许可证不同，制作镜像时检查所有链接库的许可证。

## 源码位置

| 路径 | 用途 |
| --- | --- |
| `soc/allwinner/sun252i_f101/` | SoC 启动、缓存、MMU 与中断支持 |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC 设备树 |
| `dts/bindings/` | 外设 binding；4.5 的 F101 GPIO compatible 为 `allwinner,sun252i-f101-gpio` |
| `boards/yuzukihd/yuzukineko/` | YuzukiNeko 板级配置 |
| `boards/yuzukihd/f101_evb/` | 评估板配置 |
| `samples/drivers/`、`samples/subsys/` | 驱动／媒体及子系统示例 |
| west 工作区的 `modules/` | manifest 依赖，包括 LVGL、FatFs、Mbed TLS；4.5 还使用 TF-PSA-Crypto |

## 检查构建

在 4.2.2 工作区：

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west list
west build -b yuzukineko -d build/hello zephyr/samples/hello_world
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-get-source/build.cast"></div>

检查实际退出状态。产物是 `build/hello/zephyr/zephyr.elf` 和 `zephyr.bin`。默认 hello-world 是 RAM 构建，[运行前](zephyr-build-run.md)核对 `.config` 和 ELF 地址；XIP 应用的布局和 loader 流程不同。

## 在所选版本内更新

保存本地改动后，在各自选定的分支上更新两个仓库，再按该版 manifest 更新依赖：

```sh
git -C zephyr pull --ff-only
git -C zephyr-components pull --ff-only
west update --narrow fatfs lvgl mbedtls cherryusb opencore
west packages pip --install
```

4.5 的更新列表另加 `tf-psa-crypto tf-psa-crypto-drivers`，并激活它的环境。不同版本、板级及不兼容配置使用独立输出目录。精确复现历史版本时，使用[版本指南](zephyr-4-5.md)中的提交组合。

## 常见问题

| 现象 | 检查 |
| --- | --- |
| Git connection reset 或 RPC failure | 重试同一获取命令，检查本地代理／网络及仓库可达性 |
| west 不认识 `build` | 进入初始化的 west 工作区并激活对应环境 |
| 找不到编译器 | source 配套的 `env.sh`，检查 `CROSS_COMPILE` |
| 缺少 Python 包 | 在所选虚拟环境中执行 `west packages pip --install` |
| 无法获取 4.5 分支 | 确认两个仓库均已发布；可用前保留配套的 4.2.2 环境 |
