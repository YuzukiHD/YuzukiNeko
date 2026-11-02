---
title: "MBUS 与 SRAM - 总线优先级与片上内存"
---

两个小模块决定了内存总线怎么共享、片上 SRAM 归哪个引擎。MBUS 仲裁器给每个总线 master 设置优先级和带宽上限，并统计各 master 组的流量。系统控制器把内部 SRAM 和 OTG FIFO RAM 交给认领它的模块。两者都没有中断，都是纯 MMIO，也都通过 debugfs 暴露状态。

| 项目 | 内容 |
| --- | --- |
| 驱动 | `drivers/soc/sunxi/sun252i_f101_mbus.c`、`drivers/soc/sunxi/sunxi_sram.c` |
| 兼容字符串 | `allwinner,sun252i-f101-mbus`、`allwinner,sun252i-f101-system-control`，以及三个 SRAM section 兼容字符串 |
| 基址 | MBUS `0x03102000`（0x1000）、系统控制 `0x03000000`（0x1000） |
| 时钟与复位 | MBUS 需要 `CLK_BUS_DRAM` 和 `CLK_MBUS`，且必须释放 `RST_BUS_DRAM` |
| Kconfig | `CONFIG_SUN252I_F101_MBUS`、`CONFIG_SUNXI_SRAM`（`CONFIG_ARCH_SUNXI` 下默认开启） |
| 用户接口 | `/sys/kernel/debug/sun252i-f101-mbus/{traffic,masters}`、`/sys/kernel/debug/sram` |

## 硬件

### MBUS 仲裁寄存器

`0x03102000` 的 MBUS 窗口里有三组寄存器。每个 master 的仲裁在 `0x210 + 0x10 * m`（MSC），带宽上限在 `0x218 + 0x10 * m`（BWLR），共 40 个 master，编号 0 到 39。流量监视器从 `0x09c` 开始。

| 寄存器 | 偏移 | 字段 |
| --- | --- | --- |
| `MSC(m)` | `0x210 + 0x10 * m` | 优先级在 bits 3:2，取值 0 到 3，3 最高 |
| `BWLR(m)` | `0x218 + 0x10 * m` | 上限在 bits 27:16，使能在 bit 31 |
| `PMU_CTRL` | `0x09c` | 窗口在 bits 31:16，使能在 bit 0 |
| `PMU_COUNTER(n)` | `0x0a0 + 4 * n` | 第 n 组的 32 位计数器，共 16 组 |

带宽上限的单位不是 MB/s。该字段按每个 MBUS 时钟周期 1/256 字节计数，所以驱动把请求的 `bandwidth-limit-mbps` 换算成 `256 * mbps / mbus_clk_mhz`，再截断到 12 位字段。devicetree 属性值为 0 时清除使能位，表示不限制。监视窗口是 16 位字段，计数器本身是 32 位寄存器。窗口属性是 `allwinner,monitor-window-us`，默认 50000，最大 65535。

16 个监视组由硬件固定：

| 序号 | 名称 | 序号 | 名称 |
| --- | --- | --- | --- |
| 0 | `cpu` | 8 | `dsp_sys` |
| 1 | `rv_sys` | 9 | `g2d` |
| 2 | `mahb` | 10 | `di` |
| 3 | `dma` | 11 | `de` |
| 4 | `ve` | 12 | `iommu` |
| 5 | `ce` | 13 | `reserved` |
| 6 | `tvd` | 14 | `other` |
| 7 | `csi` | 15 | `total` |

计数器按组统计，不按 master 统计。无法单独读某个 master 的流量；`masters` 文件显示它的配置，`traffic` 文件显示它贡献到的组。16 个组不保证覆盖全部流量：`reserved` 和 `other` 表示不对应单个具名 master 的桶。

MBUS 时钟是上限和计数器共同的时间基准。500 MB/s 的上限只有相对于 `clk_get_rate()` 报告的频率才有意义；如果将来的板子降低 MBUS 时钟，同一个寄存器值对应的字节速率会更低，驱动会在启动时按新时钟重新算字段。

devicetree 绑定只给板子配置的两个 master 起了符号名：`SUN252I_F101_MBUS_MASTER_DE` 是 16，`SUN252I_F101_MBUS_MASTER_RISCV` 是 39。其他 master 编号来自硬件手册，头文件里没有命名。

### 系统控制与 SRAM

`0x03000000` 的系统控制器基本上是一个 mux 模块。这个 SoC 上 `+0x00` 的寄存器读回为零、忽略写入，Linux 和 OpenSBI 都一样；只有 `+0x04` 的 mux 可写且有效。驱动建模了三个 section，其中两个共用同三位。

| Section | 兼容字符串 | 寄存器 | 认领时的值 | 含义 |
| --- | --- | --- | --- | --- |
| 视频引擎 SRAM | `allwinner,sun252i-f101-sram-ve` | `+0x04` bit 24 | 0 | VE 拥有 SRAM；1 表示 CPU |
| 显示引擎 SRAM | `allwinner,sun252i-f101-sram-de` | `+0x04` bits 27:25 | 5 | DE 拥有 SRAM；0 表示 CPU |
| USB OTG FIFO | `allwinner,sun252i-f101-sram-usb` | `+0x04` bits 27:25 | 0 | OTG 拥有 FIFO RAM；DE 拥有时该字段是 5 |

VE 的内存是 `0x00020000` 处 0xb000 字节的 `mmio-sram`，也就是 FEL 阶段加载 `init_psram_efex.bin` 和 `usb-boot_fel.bin` 的同一块 SRAM。Linux 启动时这些程序已经结束，这块区域可以交给视频引擎。OTG FIFO RAM 位于 USB 控制器内部，但它的归属由显示引擎也使用的 bits 27:25 选择，这就是两个设备冲突的原因。

显示引擎和 USB 控制器希望同一位段取相反的值。DE 认领自己的 section 时写 5；OTG 认领 USB section 时写 0。显示引擎在值为 0 时也能工作，板子在两者同时活动、且 OTG 最后认领时就是这个状态。如果位段停在 5，gadget 永远离不开 `default` 状态，枚举无法完成。角色切换和 gadget 侧见 [USB](usb.md)。

## Devicetree

### MBUS

MBUS 节点有时钟和复位，需要非默认设置的 master 是子节点，`reg` 里写 master 编号。

```text
mbus: mbus@3102000 {
	compatible = "allwinner,sun252i-f101-mbus";
	reg = <0x0 0x03102000 0x0 0x1000>;
	clocks = <&ccu CLK_BUS_DRAM>, <&ccu CLK_MBUS>;
	clock-names = "bus", "mbus";
	resets = <&ccu RST_BUS_DRAM>;
	#address-cells = <1>;
	#size-cells = <0>;
	status = "disabled";
};
```

板级节点把它打开，给显示引擎最高优先级，并给 C907 集群设上限：

```text
&mbus {
	status = "okay";

	display-engine@10 {
		reg = <SUN252I_F101_MBUS_MASTER_DE>;
		priority = <3>;
	};

	cpu@27 {
		reg = <SUN252I_F101_MBUS_MASTER_RISCV>;
		bandwidth-limit-mbps = <500>;
	};
};
```

名字来自 `include/dt-bindings/memory/sun252i-f101-mbus.h`。`16` 是显示引擎，`39` 是 RISC-V 集群。`reg` 大于等于 40 或没有有效 `reg` 的子节点会被跳过并给出警告。优先级大于 3 会被拒绝并保留原值。驱动没有对 `bandwidth-limit-mbps` 做上限检查：算出的字段由 `FIELD_MAX()` 截断到 0xfff。

### 系统控制与 SRAM

系统控制器里有一个 `0x20000` 处的 `mmio-sram` 子节点。VE section 是该 SRAM 节点的子节点。DE 和 USB section 直接声明在 SoC 节点下，因为它们对驱动来说只是 phandle，没有自己的地址。

```text
syscon: syscon@3000000 {
	compatible = "allwinner,sun252i-f101-system-control";
	reg = <0x0 0x03000000 0x0 0x1000>;
	#address-cells = <1>;
	#size-cells = <1>;
	ranges = <0x0 0x0 0x0 0x40000000>;

	ve_sram: sram@20000 {
		compatible = "mmio-sram";
		reg = <0x20000 0xb000>;
		#address-cells = <1>;
		#size-cells = <1>;
		ranges = <0 0x20000 0xb000>;

		ve_sram_section: sram-section@0 {
			compatible = "allwinner,sun252i-f101-sram-ve";
			reg = <0x0 0xb000>;
		};
	};
};

usb_sram_section: sram-section-usb {
	compatible = "allwinner,sun252i-f101-sram-usb";
};

de_sram_section: sram-section-de {
	compatible = "allwinner,sun252i-f101-sram-de";
};
```

### 使用者

设备用 `allwinner,sram` 申请 section；第二个 cell 是“这个设备”对应的值。驱动按兼容字符串找到 section 节点，把第二个 cell 与函数表对照，并在第一次认领时写入对应的寄存器值。

```text
ve: video-codec@1c0e000 {
	allwinner,sram = <&ve_sram_section 1>;
};

mixer0: mixer@5100000 {
	allwinner,sram = <&de_sram_section 1>;
};

usb_otg: usb@4100000 {
	allwinner,sram = <&usb_sram_section 1>;
};
```

| 绑定 | 范围 |
| --- | --- |
| `Documentation/devicetree/bindings/arm/sunxi/allwinner,sun252i-f101-mbus.yaml` | MBUS 节点、master 子节点、`priority`、`bandwidth-limit-mbps`、`allwinner,monitor-window-us` |
| `Documentation/devicetree/bindings/sram/allwinner,sun4i-a10-system-control.yaml` | 系统控制、`mmio-sram` 子节点、section 兼容字符串 |
| `include/dt-bindings/memory/sun252i-f101-mbus.h` | 两个有名字的 master 编号 |

在这份 devicetree 里，DE 和 USB section 节点不在系统控制器内部，而绑定把 section 描述成 `sram` 的子节点。驱动只需要兼容字符串和 phandle，所以能工作，但节点位置不在绑定 schema 的覆盖范围内。跑 `dtbs_check` 时把它当成已知的布局特例。

## Kconfig

```text
CONFIG_SUN252I_F101_MBUS=y
CONFIG_SUNXI_SRAM=y
CONFIG_DEBUG_FS=y
```

`CONFIG_SUNXI_SRAM` 是 bool，在 `CONFIG_ARCH_SUNXI` 下默认 `y`，并 select `REGMAP_MMIO`。F101 的系统控制 variant 没有 EMAC 时钟也没有 LDO 控制，所以驱动不会为它注册 regmap；它只映射窗口、populate SRAM 子节点并创建 debugfs 文件。`CONFIG_SUNXI_MBUS` 是另一个选项：它是 ARM 专用的 DMA quirk 修正，这里不用。

`CONFIG_SUN252I_F101_MBUS` 依赖 `ARCH_SUNXI` 或 `COMPILE_TEST`，是 tristate，不过板级配置把它编进内核。

## 驱动内部

### MBUS 的 probe

`f101_mbus_probe()` 映射 4 KiB 窗口，用 `devm_reset_control_get_optional_exclusive_deasserted()` 取得复位，用 `devm_clk_get_enabled()` 打开 `bus` 和 `mbus` 时钟，并把 `clk_get_rate() / 1000000` 存成 MBUS 时钟的 MHz 值。如果时钟频率为 0，probe 会失败，因为换算上限时会除以零。

随后它通过向 `PMU_CTRL` 写窗口和使能位来启动监视器，遍历可用子节点应用 `priority` 和 `bandwidth-limit-mbps`，创建 debugfs 目录，并打印时钟的 MHz 值。复位在任何寄存器访问之前释放。复位仍被 assert 时整个窗口读回 `0x4`，看起来像控制器坏了，其实只是复位没释放。

### 上限编码

`f101_mbus_set_limit()` 读 BWLR，清掉上限字段和使能位，再写新值。请求 0 mbps 被编码成“清除使能”，不是零上限。非零请求用 `div_u64(256 * mbps, clk_mhz)` 换算，结果是每周期 1/256 字节的单位；debugfs 的 `masters` 文件再用 `limit * clk_mhz / 256` 换回来，打印 MB/s。整数截断意味着 MBUS 时钟较低时，实际上限可能比请求值略低。

### 监视窗口

驱动先写窗口字段，再置使能位。属性名表明单位是微秒，值不做缩放直接放进 bits 31:16。默认窗口是 50000。`traffic` 文件直接读 `0x0a0` 起的计数器，驱动不缩放、不锁存、不复位它们。因此连续两次读看到的是有重叠的流量，不是每秒速率。

驱动移除时只删除 debugfs 目录，不会停止监视器，也不会恢复仲裁寄存器。probe 时写入的值会一直留在硬件里，直到下次上电。

### SRAM 的 probe 与认领

`sunxi_sram_probe()` 保存 platform device，映射系统控制窗口，调用 `of_platform_populate()` 让 `mmio-sram` 节点由通用 SRAM 驱动 probe，然后创建 `/sys/kernel/debug/sram`。对 `allwinner,sun252i-f101-system-control`，variant 数据是普通 A10 variant：没有 EMAC 时钟，也没有 LDO 控制，所以不会调用 `of_syscon_register_regmap()`。

`sunxi_sram_claim()` 遍历设备的每一个 `allwinner,sram` phandle。对每个 phandle，它检查 section 节点是否 available、匹配兼容字符串，并把第二个 cell 通过函数表映射成寄存器值。第一次认领某个 section 时，它读 `+0x04`，清掉字段宽度，再把值移到对应位置写入。之后同一 section 的认领只增加 `claim_cnt`，不重写寄存器，所以同一 section 的两个使用者共享第一次写入的值。

### 认领计数与释放

`sunxi_sram_release()` 只递减计数，别的什么都不做。它不恢复之前的所有者，也不写寄存器。如果驱动 probe、认领、然后被移除，字段会停在它写入的值。DE 和 VE 使用者在 probe 时认领，只在驱动移除时释放；OTG 在 `sunxi_musb_init()` 认领，在 `sunxi_musb_exit()` 释放。

显示引擎和 OTG 控制器之间的认领顺序决定 bits 27:25 的最终值。MUSB 驱动在 MUSB core 初始化时认领，mixer 在 DRM component bind 时认领。按当前板子的构建，OTG 的认领是最后一次，所以字段读 0，显示和 gadget 都能工作。如果将来的 probe 顺序让字段停在 5，gadget 会卡在 `default`；见排错表。

## 用户接口

### MBUS debugfs

挂载 debugfs 后会出现两个只读文件：

```sh
mkdir -p /sys/kernel/debug
mount -t debugfs none /sys/kernel/debug
cat /sys/kernel/debug/sun252i-f101-mbus/masters
cat /sys/kernel/debug/sun252i-f101-mbus/traffic
```

`masters` 打印 40 行，每个 master 一行，格式是 `NN priority P limit L MB/s`，bit 31 未置位时是 `NN priority P limit none`。`traffic` 打印 16 行，每组一行，格式是 `name value`，名字左对齐占八列。两个文件每次打开都重新读硬件，没有缓存快照。

### SRAM debugfs

`/sys/kernel/debug/sram` 遍历系统控制器的 `mmio-sram` 子节点，打印每个 section、它的函数表，并在当前寄存器值对应的函数旁打 `*`。只有 VE section 会出现，因为这份 devicetree 里 DE 和 USB section 不在 `mmio-sram` 节点下面。因此显示引擎或 OTG 控制器对 bits 27:25 的改动在这个文件里看不到，即使寄存器值已经变了。

上限换算使用的 MBUS 时钟是 `/sys/kernel/debug/clk/mbus/clk_rate`。解读上限之前先读它，尤其是启动链为 MBUS 选了不同 PLL 的板子。

### 直接读寄存器

归属字段可以从 shell 用 `devmem` 读写：

```sh
devmem 0x03000004
```

bit 24 和 bits 27:25 是两个归属字段。整字读取是安全的；写入会改变 SRAM 归属，可能弄坏显示引擎或视频引擎，除非是刻意从错误的认领顺序里恢复，否则不要写。

## 示例

### 读取仲裁设置

```sh
cat /sys/kernel/debug/sun252i-f101-mbus/masters
```

一段有代表性的裁剪输出，只保留板子配置的行：

```text
 0 priority 0 limit none
...
16 priority 3 limit none
...
39 priority 0 limit 500 MB/s
...
```

显示引擎优先级 3，没有带宽上限。CPU 优先级 0，上限 500 MB/s。其余 master 保持复位值：优先级 0，不限制。

### 读取流量计数器

```sh
cat /sys/kernel/debug/sun252i-f101-mbus/traffic
```

输出固定 16 行，名字如下；值是监视窗口内累计的原始字节数，每次读都会变：

```text
cpu      ...
rv_sys   ...
mahb     ...
dma      ...
ve       ...
ce       ...
tvd      ...
csi      ...
dsp_sys  ...
g2d      ...
di       ...
de       ...
iommu    ...
reserved ...
other    ...
total    ...
```

`total` 组不一定是其他组之和，因为硬件把每笔事务归到一个组，有些组可能与保留桶重叠。连续读两次可以看出哪些组在活动，而不是空闲。

### 验证带宽寄存器

把请求的 500 MB/s 换算成寄存器编码，再和硬件对比：

```sh
MBUS_HZ=$(cat /sys/kernel/debug/clk/mbus/clk_rate)
MBUS_MHZ=$((MBUS_HZ / 1000000))
LIMIT=$((256 * 500 / MBUS_MHZ))
echo "mbus clock: $MBUS_MHZ MHz, encoded limit: $LIMIT"
devmem 0x03102488
```

`0x03102488` 是 `0x03102000 + 0x218 + 0x10 * 39`，即 master 39 的 BWLR。bits 27:16 应等于算出的上限，bit 31 应置位。如果算出的值超过 0xfff，驱动会截断，实际上限低于 500 MB/s。

### 检查一个仲裁寄存器

显示引擎的 MSC 寄存器在 `0x03102000 + 0x210 + 0x10 * 16`，即 `0x03102310`：

```sh
devmem 0x03102310
```

bits 3:2 是优先级。板子设成 3 时，其他位为零的情况下低字节读 `0x0c`。这和 `masters` 文件解析的是同一个值；当子节点存在但 `masters` 行仍显示优先级 0 时，用它可以确认寄存器写入没有发生。

### 检查 SRAM 归属

```sh
cat /sys/kernel/debug/sram
devmem 0x03000004
```

视频引擎 probe 之后，`sram` 文件有代表性的内容是：

```text
Allwinner sunXi SRAM
--------------------

sram@00020000
	section@0000	(VE)
		cpu
		ve*
```

显示引擎和 OTG 控制器活动时同样可以跑这条命令，但它们的 section 不会出现在这个文件里。读 `0x03000004` 才能看到 bits 27:25。板子的工作状态里这三位是 0。

## 限制与排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `ls /sys/kernel/debug/sun252i-f101-mbus` 失败 | debugfs 没挂载 | 把 debugfs 挂到 `/sys/kernel/debug` |
| 所有 MBUS 寄存器都读 `0x4` | `RST_BUS_DRAM` 仍被 assert | 检查 `resets` 属性和 CCU 复位位；驱动必须在 probe 里释放 |
| `traffic` 一直全零 | 监视器没在跑，或窗口太短没抓到流量 | 看 probe 日志，在播放视频时连读两次 |
| 某个 `bandwidth-limit-mbps` 子节点没效果 | 子节点没有有效 `reg`、节点被禁用，或属性为 0 | 看 `dmesg` 里的驱动警告和子节点的 `reg` |
| 上限比请求值略低 | 12 位字段截断换算，MBUS 时钟低时更明显 | 按 `256 * mbps / clk_mhz` 算，接受向下取整 |
| `traffic` 看不到单个 master 的速率 | 硬件只统计 16 个组 | 配置看 `masters`，总量看组计数器 |
| UDC 停在 `default`，gadget 不枚举 | `0x03000004` 的 bits 27:25 是 5，被显示引擎占用 | 确保 OTG 的认领是最后一次；见 [USB](usb.md) |
| 释放 section 后内存没还回来 | `sunxi_sram_release()` 只递减认领计数 | 另一个使用者退出后重新认领，或重启 |
| 写 `0x03000000` 没反应 | 这个 SoC 上只有 `+0x04` 可写 | 用 section 机制，不要写基址寄存器 |
| `/sys/kernel/debug/sram` 不列 DE 或 USB section | 只遍历 `mmio-sram` 子节点，而这两个节点在 SoC 下 | 直接读 `0x03000004` |

MBUS 的 debugfs 文件和 SRAM 的 debugfs 文件都是只读的。两个模块都没有字符设备、ioctl 接口或中断，所以用户空间监视只能轮询 debugfs 文件。

## 相关链接

`RST_BUS_DRAM` 和 MBUS 时钟见 [CCU](clock.md)，APB0 时钟见 [引脚复用与 GPIO](pinctrl-gpio.md)，FIFO RAM 认领和依赖它的角色切换见 [USB](usb.md)。[Linux 介绍](../index.md)列出使用这些设置的驱动，[预编译镜像](../linux-prebuilt.md)描述 Linux 启动前使用 `0x00020000` 处 SRAM 的 FEL 阶段。
