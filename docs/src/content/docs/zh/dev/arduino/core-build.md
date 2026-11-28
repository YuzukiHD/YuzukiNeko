---
title: "构建核心与发行包"
---

仓库发布的是 Arduino 平台，不是一份固件镜像。发行包在 `prebuilt/` 下携带预编译核心和加载器；新检出的仓库要用 `tools/build-core` 生成它们。用户安装发行包；维护者在 Zephyr 代码、核心源码或某个库发生变化时重建核心。Zephyr 环境见 [Zephyr 编译与运行](../zephyr/zephyr-build-run.md)。

## 构建核心

`tools/build-core` 需要 F101 west 工作区：`zephyr/`、west 模块（`fatfs`、`cherryusb`、`opencore`）和一个 RISC-V 编译器。在工作区里的 `Arduino/` 检出目录中运行。

```sh
cd <workspace root>
. ./env.sh
cd Arduino
tools/build-core --board f101_evb
tools/build-core --board yuzukineko
```

不执行 `. env.sh` 时，把 `CROSS_COMPILE` 设成某个 RISC-V 工具链前缀；CI 使用的 xPack `riscv-none-elf-` 工具链可以正常工作。默认板子是 `f101_evb`，另一份核心用 `--board yuzukineko`。

## build-core 做了什么

| 步骤 | 动作 |
| --- | --- |
| 清理 | 删除 `build/core/<variant>`，避免复用旧 overlay 的配置 |
| 配置 | 运行 `west build -b <board>`，带 `-DARDUINO_LIBRARIES=...`、`-DARDUINO_CORE_ID=...` 和 `-DARDUINO_EXPORTS=` |
| 第一次链接 | 构建包含核心和全部库的 Zephyr 镜像 |
| 符号扫描 | 对应用对象和 C/C++ 库运行 `nm -g --defined-only` |
| 第二次链接 | 用 `-u <symbol>` 响应文件重新链接，让 sketch 能调用核心自己没用的符号 |
| 安装 | 写出 `prebuilt/<variant>-core/{core.elf,core.bin,core.flash}`，复制加载器二进制 |
| 头文件 | 把 sketch 需要的头文件整理到 `prebuilt/include` 和 `prebuilt/<variant>-core/include` |

核心 ID 默认是 `int(time.time()) & 0x7FFFFFFF`，也可以用 `-DARDUINO_CORE_ID` 指定。每次重建都会得到新 ID，所以核心更新后 sketch 必须重新编译。`core.flash` 是 4 KiB 头页加核心镜像，加载器读的就是这个头页。

## 构建安装包

`tools/package` 需要 `prebuilt/` 和 `loader/`。它生成平台 zip、工具压缩包、Boards Manager 索引和 `SHA256SUMS`。

```sh
tools/package --out dist
```

| 选项 | 默认值 | 含义 |
| --- | --- | --- |
| `--out` | 必填 | 输出目录 |
| `--version` | `platform.txt` 里的 `version=` | 平台版本 |
| `--base-url` | 最新 release 的 URL | 文件发布位置 |
| `--targets` | `windows,linux` | 要构建的主机平台包 |

| 安装包文件 | 内容 |
| --- | --- |
| `yuzukihd-f101-<version>.zip` | 平台：`boards.txt`、`platform.txt`、`programmers.txt`、cores、库头文件、variants、预编译核心和加载器、examples |
| `riscv-gcc-<version>-<target>.*` | 裁剪到 rv32imafdc/ilp32d multilib 的 xPack RISC-V GCC |
| `xfel-<version>-<target>.*` | 主机用的 xfel 1.4.0 |
| `package_yuzukihd_index.json` | 指向 `--base-url` 的 Boards Manager 索引 |
| `SHA256SUMS` | 上面这些文件的校验和 |

平台 zip 里只有库的公开头文件；实现已经在核心里。`tools/package` 会把 `tools/upload.sh` 和 `tools/upload.cmd` 复制进平台，供 IDE 调用。

## 发布

GitHub Actions 运行 `.github/workflows/build.yml`。它用 xPack GCC 构建两个核心，打包，用 `arduino-cli` 安装生成的包，编译全部示例；推送的标签为 `v<version>` 且与 `platform.txt` 里的 `version=` 一致时，把文件发布出去。

本地发布走同样的步骤：构建两个核心，运行 `tools/package --out dist`，再用本地索引测试 `arduino-cli core install yuzuki:f101`，确认无误后发布。

## 增加新板

新板需要在 `variants/<name>/` 下提供 `pins_arduino.h`、`<name>.overlay` 和 `<name>.conf`，在 `boards.txt` 里增加一项，写 `build.variant=<name>`、`build.board=<macro>` 和架构参数，并在 `tools/build-core` 的 `BOARDS` 里把 Zephyr 板名映射到变体名。核心构建目录和 sketch 头文件都以这个变体命名。

`CMakeLists.txt` 目前固定用 `variants/evb/` 作为核心配置，外设集合不同的板子还需要在那里改动。`variants/yuzukineko/` 里的文件描述 YuzukiNeko 的引脚名称，但核心构建仍使用共享的 EVB 配置；控制台和屏幕由 Zephyr 板级提供。

## 更新核心

1. 切到想要的 Zephyr 和模块版本。
2. 用 `tools/build-core` 重建两个核心。
3. 在新核心上跑一遍示例；核心 ID 变了，所有 sketch 都要重新编译。
4. 修改 `platform.txt` 里的 `version=`。
5. 打 `v<version>` 标签，让 CI 发布安装包。

`prebuilt/` 除了 `sketch.ld` 之外都在 gitignore 里；二进制放在 release 附件里，不在仓库里。

## 目录结构

| 路径 | 内容 |
| --- | --- |
| `cores/f101/` | Arduino 头文件和 sketch 入口 |
| `src/core/` | 核心实现 |
| `libraries/<name>/src/` | 库的公开头文件 |
| `libsrc/<name>/` | 库的实现，编进核心 |
| `variants/<name>/` | 引脚名称、overlay 和 Kconfig 片段 |
| `prebuilt/` | 核心镜像、加载器和 sketch 头文件 |
| `tools/` | `upload.sh`、`upload.cmd`、`build-core`、`package` |
| `examples/` | 每个示例 sketch 一个目录 |
