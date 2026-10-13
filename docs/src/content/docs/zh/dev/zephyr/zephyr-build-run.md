---
title: "编译与运行"
---

这一页说明怎样编译 Zephyr 程序，并用三种方式把它放到 YuzukiNeko 上运行：

| 方式 | 程序放在哪 | 断电后 | 需要 | 适合 |
| --- | --- | --- | --- | --- |
| [方式一：下载到 RAM 运行](#方式一下载到-ram-运行) | PSRAM | 丢失 | FEL + xfel | 开发调试，改一次跑一次 |
| [方式二：xfel 直接写 NOR](#方式二xfel-直接写-nor) | SPI NOR | 保留，上电自动运行 | NOR 里有加载器；每次进 FEL + xfel | 固定一个程序，不想装 UF2 下载器 |
| [方式三：UF2 拖放下载](#方式三uf2-拖放下载) | SPI NOR | 保留，上电自动运行 | NOR 里有加载器和 UF2 下载器；只需要 USB 线 | 日常下载的通用方式 |

三种方式用的是<strong>同一个</strong> `zephyr.bin`，不需要分别编译。方式二和方式三都要先在 NOR 里装好加载器，见 [NOR 启动的共同基础](#nor-启动的共同基础)。

开始前请先完成 [配置开发环境](zephyr-setup-env.md) 和 [获取 Zephyr 代码](zephyr-get-source.md)，并安装好 xfel（见 [FEL 下载模式与工具](../../boot/fel.md)）。

## 编译

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/hello zephyr/samples/hello_world
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-build-run/build.cast"></div>

| 参数 | 含义 |
| --- | --- |
| `-b yuzukineko` | 板级。评估板用 `f101_evb` |
| `-d build/hello` | 构建目录，不同程序用不同目录，互不覆盖 |
| `zephyr/samples/hello_world` | 要编译的应用，换成别的示例路径即可 |

产物在 `build/hello/zephyr/` 下：

| 文件 | 说明 |
| --- | --- |
| `zephyr.bin` | 裸二进制，下载到板子的就是它 |
| `zephyr.elf` | 带符号的 ELF，调试和看内存布局用 |

镜像的链接地址和入口都是 `0x40000000`（PSRAM 的起点附近）。工具链是玄铁 900 的 newlib GCC，通过 `ZEPHYR_TOOLCHAIN_VARIANT=cross-compile` 接入，由 `env.sh` 设置。

重新编译同一个目录用 `west build -d build/hello`；换了板级或想从头来，加 `-p always`。

## 控制台

`yuzukineko` 的控制台是 <strong>UART1，PB00（TX）/ PB01（RX），115200 8N1</strong>。把 USB 转串口的 RX 接 PB00、TX 接 PB01，并共地，然后用任意串口终端打开，例如：

```sh
picocom -b 115200 /dev/ttyUSB0
```

没有输出时，先判断是哪一环出了问题：接线和终端参数、程序有没有真正执行、还是 Zephyr 自身。一个有效的办法是先载入一个裸机小程序（链接在 `0x40000000`，轮询 UART 并写发送寄存器）证明这条路径是通的。

## 方式一：下载到 RAM 运行

主机通过 USB 把 `zephyr.bin` 写进 PSRAM 再跳转过去运行，不动 Flash。

1. 让板子进入 FEL：按住 FEL 键，接上 USB 数据线，松开（详见 [FEL 下载模式与工具](../../boot/fel.md#进入-fel)）。
2. 确认连接：

   ```sh
   xfel version
   ```

   输出里应有 `AWUSBFEX ID=0x00193700(F101)`。

3. 初始化内存、载入、运行：

   ```sh
   xfel ddr f101-s3
   xfel write 0x40000000 build/hello/zephyr/zephyr.bin
   xfel exec 0x40000000
   ```

此时控制台应开始输出。`hello_world` 会打印 `Hello World! yuzukineko/sun252i_f101`。

| 命令 | 作用 |
| --- | --- |
| `xfel ddr f101-s3` | 初始化 PSRAM。这个辅助程序同时配好 UART 时钟和引脚复用，缺了它控制台没有输出 |
| `xfel write 0x40000000 …` | 把镜像写到链接地址 |
| `xfel exec 0x40000000` | 跳到入口开始运行 |

要点：

- <strong>每次下载都要重新上电进入 FEL。</strong>`exec` 之后 CPU 已离开 BROM，FEL 不再可用。
- 这条路径跳过了 boot0 和 u-boot，SoC 早期初始化（CPU CSR、控制台时钟）由 Zephyr 自己负责。
- `exec` 之后不要再用 `xfel read32`、`hexdump` 查看状态，USB 链路已断。要查状态只能在 `exec` 之前。
- `exec` 之后看到 `usb bulk send/recv error`，说明 CPU 已经在跑你的代码，属正常现象，但<strong>不代表 Zephyr 本身运行正常</strong>，以控制台输出为准。

## NOR 启动的共同基础

方式二和方式三都把程序写进板载的 16 MiB SPI NOR，由 Flash 里的加载器在上电时取出来运行。这一节说明它是怎么工作的，以及怎样装加载器。

### 工作原理

| 内容 | NOR 偏移 | 说明 |
| --- | --- | --- |
| 加载器（三份） | `0x000000` / `0x010000` / `0x020000` | SyterKit `flash-boot` |
| 已保存的 Flash 采样点 | `0x02f000` | 加载器自己维护，<strong>不要覆盖</strong> |
| UF2 下载器（系统程序） | `0x030000` | 头页 + 镜像，最大 `0x1CF000` 字节；只有方式三需要 |
| 应用（你的 Zephyr 程序） | `0x200000` | 头页 + 镜像，最大 `0x9F0000` 字节 |

上电后 BROM 把加载器读进 SRAM，加载器初始化 PSRAM 和 Flash 控制器，然后二选一：

- <strong>PD5 上的按键没有按住，且应用头页有效</strong>：把应用复制到 PSRAM 并运行。
- 否则：运行 UF2 下载器，板子在 USB 口上显示为盘 `F101BOOT`，等待拖入 `.uf2`。

应用和方式一一样<strong>在 PSRAM 里运行</strong>，不是在 Flash 里就地执行，所以用的是同一个 `zephyr.bin`。每个程序前有一个 4 KiB 的<strong>头页</strong>，记录镜像载入的 PSRAM 地址（默认 `0x40000000`）和大小。头页由 `mkuf2.py` 自动加上，不需要手写。

:::caution
这个布局与 [Linux + Buildroot](../linux/linux-prebuilt.md)、RustSBI + Asterinas 镜像的布局<strong>互不兼容</strong>，不能混着写。从那些镜像换过来，需要重新装一遍加载器。动手前先按 [SPI NOR 布局与备份](../../boot/flash-layout.md) 备份整片 Flash。
:::

:::caution
一旦 NOR 里有了有效的加载器，板子上电就直接从 Flash 启动，<strong>不会再自己进入 FEL</strong>。之后每次要用 xfel，都必须按住 FEL 键上电，见 [FEL 下载模式与工具](../../boot/fel.md#进入-fel)。
:::

### 准备工具

`mkuf2.py` 在 `zephyr-components` 仓库里，是只依赖标准库的 Python 脚本，不用装额外的包。仓库的作用见 [获取 zephyr-components](zephyr-get-source.md#获取-zephyr-components)；已经克隆过的，跳过下面的 `git clone`：

```sh
cd ~/f101-zephyr
git clone https://github.com/YuzukiHD/zephyr-components.git
# 默认使用最新的 main。下面这行会固定到本文最初验证时的旧提交（2026-10-10），
# 它早于 gbsp/ 和 nekobox/，除非确实需要那个版本，否则保持注释掉。
# git -C zephyr-components checkout 282361ce5883bd65c228da584758e4796bf439e7
mkdir -p out
```

:::tip
这个仓库的其他目录是 MicroPython、mGBA 等应用，各自带 git 子模块。这里只用 `uf2-downloader/`，不需要执行 `git submodule update`。
:::

### 编译加载器

```sh
cd ~/f101-zephyr
git clone https://github.com/YuzukiHD/SyterKit.git
cd SyterKit
git checkout 6ef3f27abd547439cb2de4e455e40a2cbfbebff8
export CROSS=$HOME/f101-zephyr/toolchains/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin/riscv64-unknown-elf-
make O=../out/syterkit CROSS_COMPILE=$CROSS yuzukineko_rv32_sram_defconfig
make O=../out/syterkit CROSS_COMPILE=$CROSS olddefconfig
make -j8 O=../out/syterkit CROSS_COMPILE=$CROSS flash-boot
cd ..
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-build-run/loader.cast" data-speed="3"></div>

产物是 `out/syterkit/build/yuzukineko/app_sram/flash-boot/flash-boot_spi.bin`（32 KiB）。

### 写入加载器

进入 FEL，先备份整片 Flash，再把加载器写三份：

```sh
xfel version
xfel spinor read 0x0 0x1000000 neko-backup.bin

L=out/syterkit/build/yuzukineko/app_sram/flash-boot/flash-boot_spi.bin
xfel spinor write 0x000000 $L
xfel spinor write 0x010000 $L
xfel spinor write 0x020000 $L
```

`xfel spinor write` 会自动擦除需要的扇区。写 Flash 不需要执行 `xfel ddr`。

接着按你用的方式继续：方式二写入应用，方式三写入 UF2 下载器。

### 生成带头页的镜像

`mkuf2.py` 把 `zephyr.bin` 加上头页。`--raw` 输出 Flash 原始镜像，供 `xfel spinor write` 用；不加 `--raw` 输出 `.uf2` 文件。

```sh
python3 zephyr-components/uf2-downloader/tools/mkuf2.py app build/hello/zephyr/zephyr.bin --raw -o out/app.img
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-build-run/mkuf2.cast"></div>

输出类似 `out/app.img: 2096208 bytes at 0x200000`。镜像大于应用区（`0x9F0000` 字节）时脚本会报错退出。默认载入地址是 `0x40000000`，和 Zephyr 的链接地址一致；镜像链接在别处时用 `--load` 指定。

## 方式二：xfel 直接写 NOR

不装 UF2 下载器，每次都用 xfel 把应用写到 NOR 的 `0x200000`。适合只想固定跑一个程序的场景。

**前提**：已按上面的 [NOR 启动的共同基础](#nor-启动的共同基础) 把加载器写进 NOR。

**1. 生成应用镜像**

```sh
python3 zephyr-components/uf2-downloader/tools/mkuf2.py app build/hello/zephyr/zephyr.bin --raw -o out/app.img
```

**2. 进入 FEL 并写入**

按住 FEL 键上电，然后：

```sh
xfel version
xfel spinor write 0x200000 out/app.img
xfel reset
```

**3. 观察控制台**

加载器会先打印自己的日志，再运行你的程序：

```text
PSRAM: … MiB initialized
SPI NOR: flash id 0x…, … KiB
SPI NOR: image  0x00201000 -> 0x40000000 (… KiB)
starting at 0x40000000 (id 0)
```

之后每次改代码：重新编译 → `mkuf2.py app … --raw` → 按住 FEL 键上电 → `xfel spinor write 0x200000` → `xfel reset`。

:::caution
这种方式 Flash 里没有 UF2 下载器。如果应用写坏、头页无效，加载器找不到可运行的程序，会报 `flash: no valid system program`，不再往下启动，板子没有程序输出。这时只能再进 FEL 重写应用。
:::

## 方式三：UF2 拖放下载

这是<strong>通用的日常下载方式</strong>。xfel 只在最开始用一次，把 UF2 下载器装进 NOR；以后把应用做成 `.uf2` 文件，拖进板子显示的 USB 盘即可，不再需要 FEL 和 xfel。

### 第一步：安装 UF2 下载器（只做一次）

**前提**：已按 [NOR 启动的共同基础](#nor-启动的共同基础) 把加载器写进 NOR。

**1. 编译 UF2 下载器并加头页**

```sh
west build -b yuzukineko -d build/uf2 zephyr-components/uf2-downloader
python3 zephyr-components/uf2-downloader/tools/mkuf2.py system build/uf2/zephyr/zephyr.bin --raw -o out/sys.img
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-build-run/downloader.cast"></div>

**2. 进入 FEL 并写入**

按住 FEL 键上电，然后：

```sh
xfel version
xfel spinor write 0x030000 out/sys.img
xfel reset
```

这里<strong>不写应用</strong>。Flash 里没有有效应用时，加载器会直接运行下载器。

**3. 确认 UF2 盘出现**

复位后，用 USB 数据线连接电脑，板子应显示为 USB 盘 <strong>`F101BOOT`</strong>。看到这个盘，安装就完成了。

### 第二步：用 UF2 下载应用（日常流程）

把 `zephyr.bin` 做成 `.uf2`：

```sh
python3 zephyr-components/uf2-downloader/tools/mkuf2.py app build/hello/zephyr/zephyr.bin -o out/app.uf2
```

输出类似 `out/app.uf2: 2096208 bytes at 0x200000, 8189 UF2 blocks`。`.uf2` 文件大小约是 `zephyr.bin` 的两倍，因为每个块只携带 256 字节数据。

然后：

1. 让板子进入 UF2 下载器：<strong>按住 PD5 上的按键，再上电</strong>（或复位）。Flash 里没有有效应用时不用按键，自动进入。
2. 板子显示为 `F101BOOT` 盘。
3. 把 `out/app.uf2` 拷进这个盘。
4. 拷完后板子自动重启，加载器运行新的应用，控制台开始输出。

之后每次改代码：重新编译 → `mkuf2.py app …` → 按住按键上电 → 拷贝。

### 三种 uf2 文件

| 文件类型 | 命令 | 写入位置 | 能写的范围 |
| --- | --- | --- | --- |
| 应用 | `mkuf2.py app zephyr.bin -o x.uf2` | `0x200000` | 只能写应用区 |
| 下载器本身 | `mkuf2.py system zephyr.bin -o x.uf2` | `0x030000` | 任意位置 |
| 加载器 | `mkuf2.py loader flash-boot_spi.bin -o x.uf2` | `0x000000` | 任意位置 |

:::caution
`app` 文件只会写到应用区，写错了顶多是应用不能运行。`system` 和 `loader` 文件可以写入任何位置，写坏了板子就没有加载器，只有 FEL 能救。只拖放你信任的文件，并且写入期间不要断电。
:::

更多关于 UF2 的细节见 [UF2 拖放烧录](zephyr-uf2.md)。

## 常见问题

<strong>方式一：`exec` 后控制台没有输出</strong>：先确认控制台接线和参数，确认 `xfel ddr f101-s3` 已经执行。仍然没有，用前面「控制台」一节说的裸机小程序区分问题在哪一环。

<strong>`mkuf2.py` 报 `… bytes, the limit is 10420224`</strong>：应用超过了 `0x9F0000` 字节的应用区。减小程序，或去掉不需要的功能。

<strong>没有出现 `F101BOOT` 盘</strong>：确认用的是带数据线的 USB-C 线，接在下载口上；确认已按住 PD5 的按键再上电。仍然没有，说明加载器或下载器没装好，按住 FEL 键上电，重新写入。

<strong>拷贝或写入后板子重启，但没有输出</strong>：先用方式一把同一个 `zephyr.bin` 载入内存运行，看程序本身是否正常，再排查 NOR 里的镜像。

<strong>板子上电什么都没有</strong>：加载器被覆盖或写坏。按住 FEL 键上电，重新写加载器，或者用备份恢复：`xfel spinor write 0x0 neko-backup.bin`。
