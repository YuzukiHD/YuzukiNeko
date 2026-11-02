---
title: "常用命令"
---

这一页是板端 shell 的实用手册。文中每个命令都存在于出厂镜像里，默认以 `root` 在 `ttyS1` 控制台上运行。例子按任务分组；每个命令给出这个 BusyBox 构建接受的语法、一个真实调用、输出长什么样，以及最容易踩的坑。

root 账户没有密码，提示符是 `# `，当前目录从 `/` 开始。Shell 是 ash，不是 bash；语法差异见 [BusyBox - shell 与 applet](busybox.md)。

:::tip
一条命令跑几分钟以上就可能超过串口工具的超时。放后台跑，之后再读文件：

```sh
( long_command > /tmp/out.txt 2>&1 & )
cat /tmp/out.txt
```

`/tmp` 是 tmpfs，重定向很便宜，但它和其他东西共用内存，重启就清空。
:::

## 系统和进程

### ps

```text
Usage: ps [-o COL1,COL2=HEADER]
```

BusyBox `ps` 不接受 BSD 风格的 `ps aux`。默认输出每个进程一行，列是 `PID`、`USER`、`VSZ`、`STAT` 和 `COMMAND`；`-o` 用来选择并重命名列：

```sh
ps
ps -o pid,ppid,user,stat,args
```

| 列 | 含义 |
| --- | --- |
| `PID` | 进程 ID |
| `PPID` | 父进程 ID |
| `USER` | 属主 |
| `VSZ` | 虚拟内存大小，单位 KiB |
| `STAT` | 状态字母：`R` 运行、`S` 睡眠、`D` 不可中断、`Z` 僵尸 |
| `ARGS` | 完整命令行 |
| `COMMAND` | 命令名 |

`ps` 读 `/proc`；刚退出、父进程还没回收的进程显示为 `Z`。空闲时该看到的是 `ttyS1` 上的 getty，以及 syslog、klogd、crond 几个守护进程。

### top

```text
Usage: top [-b] [-n COUNT] [-d SECONDS]
```

`top` 默认每两秒读一次 `/proc`。批处理模式打印一屏就退出，适合写进日志：

```sh
top -b -n 1
top -b -n 5 -d 1
```

交互按键：`N` 按 PID 排序，`M` 按内存，`P` 按 CPU，`T` 按时间，`R` 反向排序，`Q` 或 Ctrl-C 退出。单核 C907 上 CPU 百分比是相对这一个 hart 的，所以 100% 就是占满整个 CPU。

### free

```text
Usage: free [-bkmgh]
```

```sh
free -h
free -m
```

列是 `total`、`used`、`free`、`shared`、`buff/cache` 和 `available`。板子有 32 MiB PSRAM，内核和它的数据结构占掉几 MiB；`Mem:` 总量约 26 MiB。`Swap:` 是零，因为没有配置交换设备。要盯的是 `available`：它算进了可回收的页缓存，才是新程序真正能拿到的量。

### uptime

```sh
uptime
```

一行：当前时间、开机时长、用户数和 1、5、15 分钟负载。这块板子上负载超过 1.0 意味一个可运行任务占满了 CPU，不是服务器意义上的过载。

### dmesg

```text
Usage: dmesg [-cr] [-n LEVEL] [-s SIZE]
```

```sh
dmesg
dmesg | tail -40
dmesg -c
dmesg -n 4
```

`dmesg -c` 打印缓冲区然后清空。清空会毁掉下一个人要看的证据，而且 klogd 可能已经把行拷进 `/var/log/messages`；除非缓冲区真的满了，优先用 `dmesg | tail`。`dmesg -n LEVEL` 设置控制台日志级别，是阻止内核消息盖掉提示符的快捷办法；它不改变 klogd 记录的内容。日志缓冲区是 128 KiB（`CONFIG_LOG_BUF_SHIFT=17`）。

启动消息带时间戳，因为命令行里有 `printk.time=1`。典型启动行以 `[    0.000000]` 开头，时间戳是内核启动后的秒数。

### kill 和 killall

```text
Usage: kill [-l] [-SIG] PID...
Usage: killall [-lq] [-SIG] PROCESS_NAME...
```

```sh
kill -TERM 123
kill -HUP 123
killall -TERM crond
kill -l
```

| 信号 | 编号 | 用途 |
| --- | ---: | --- |
| `HUP` | 1 | 重新加载配置，或挂断终端 |
| `INT` | 2 | 等同 Ctrl-C |
| `KILL` | 9 | 不能捕获也不能忽略；最后手段 |
| `TERM` | 15 | 默认；请进程退出 |
| `STOP` | 19 | 暂停进程 |
| `CONT` | 18 | 恢复暂停的进程 |
| `USR1`、`USR2` | 10、12 | 程序自定义 |

`killall` 匹配进程名（`comm`），不是完整命令行，所以 `killall sh` 会杀掉所有 shell，包括执行这条命令的那个。优先用 `ps` 拿到的 PID。PID 1 是 BusyBox init；杀掉它会重启板子。

### reboot、poweroff、halt

```text
Usage: reboot [-d DELAY] [-nf]
Usage: poweroff [-d DELAY] [-nf]
Usage: halt [-d DELAY] [-nfw]
```

```sh
reboot
poweroff
reboot -d 5
```

普通的 `reboot` 把请求交给 init，init 执行 `/etc/inittab` 里的 `shutdown` 条目：`rcK` 按相反顺序停服务、`swapoff -a`、`umount -a -r`。`-f` 绕过 init，是搞坏 JFFS2 overlay 的好办法；除非系统已经卡死，不要用。板子起不来的话用 ThunderLinker 继电器断电重启，不要一直按复位键。

## 文件和存储

### ls、cp、mv、rm

```text
Usage: ls [-1AaCxdLHRFplinshrSXvctu] [-w WIDTH] [FILE]...
Usage: cp [-arPLHpfinlsTu] SOURCE DEST
Usage: mv [-finT] SOURCE DEST
Usage: rm [-irf] FILE...
```

```sh
ls -la /
ls -l /lib/modules/7.2.0/kernel/drivers/char/hw_random
cp /etc/inittab /tmp/inittab.bak
mv /tmp/inittab.bak /tmp/inittab.old
rm -f /tmp/inittab.old
```

`ls -l` 是 `stat` 的替代品，这个镜像没有 `stat`：它显示权限、属主、属组、大小和修改时间。`cp -a` 保留权限和时间戳。`rm -rf /` 没有任何东西阻止；没有 `--preserve-root` 保护，通配符要格外小心。

### tar 和 gzip

```text
Usage: tar c|x|t [-ahvokO] [-f TARFILE] [-C DIR] [-T FILE] [-X FILE] [LONGOPT]... [FILE]...
Usage: gzip [-cfkdt] [FILE]...
```

BusyBox tar 用 `-a` 按文件扩展名选择压缩；这个构建的帮助里没有单独的 `-z`。可移植的写法是显式走 gzip：

```sh
tar -cf - /etc | gzip > /tmp/etc.tar.gz
tar -tzf /tmp/etc.tar.gz | head
tar -xf /tmp/etc.tar.gz -C /tmp
```

`-tzf` 在出厂二进制上对 gzip 流实测可用。要解不压缩的 tar，用 `tar -xf file.tar -C DIR`。`gzip -k` 保留输入文件；不带 `-k` 时原文件被 `.gz` 替换。这个构建里 `xz`、`bunzip2`/`bzcat`、`lzma` 和 `lzopcat` 只解压；压缩用 `gzip`。

### df 和 du

```text
Usage: df [-Pkmh] [FILESYSTEM]...
Usage: du [-aHLdclsxhmk] [FILE]...
```

```sh
df -h
df -h /tmp
du -sh /var/log
du -sh /* 2>/dev/null
```

`df /` 报的是 overlay 文件系统，可写空间是 1 MiB 的 JFFS2 upper，不是整个 32 MiB 内存。`/tmp`、`/run` 和 `/dev/shm` 是 tmpfs，显示的是内存大小。`du` 会遍历整棵树；在 `/` 上它会进 `/proc`、`/sys` 和 `/dev`，所以要重定向错误，只想看一个文件系统时用 `-x`。

### mount 和 umount

```text
Usage: mount [OPTIONS] [-o OPT] DEVICE NODE
Usage: umount [-rlfda] [-t FSTYPE] FILESYSTEM|DIRECTORY
```

```sh
mount
cat /proc/mounts
mount -t debugfs none /sys/kernel/debug
umount /sys/kernel/debug
```

空闲时 `mount` 显示 overlay 根、`/mnt/overlay` 上的 JFFS2 upper、`proc`、`sysfs`、`devtmpfs`，以及 `/dev/shm`、`/tmp`、`/run` 的 tmpfs。`mount -a` 挂 `/etc/fstab` 里的所有东西；`/dev/root` 那条标了 `noauto`，会跳过。按 MTD 名字挂载（如 `mount -t jffs2 mtd:overlay /mnt/overlay`）要求 `/proc/mtd` 里存在这个分区标签。

### /proc/mtd

`cat /proc/mtd` 每个分区打印一行：

```text
mtdN: <size> <erasesize> "<label>"
```

板子上有六个：

| 设备 | 标签 | 大小 | 只读 |
| --- | --- | ---: | --- |
| `/dev/mtd0` | `bootloader` | 64 KiB | 是 |
| `/dev/mtd1` | `dtb` | 256 KiB | 是 |
| `/dev/mtd2` | `opensbi` | 512 KiB | 是 |
| `/dev/mtd3` | `kernel` | 6 MiB | 是 |
| `/dev/mtd4` | `rootfs` | 8.2 MiB | 是 |
| `/dev/mtd5` | `overlay` | 1 MiB | 否 |

对应的块设备是 `/dev/mtdblock0` 到 `/dev/mtdblock5`。只读标志来自设备树 fixed-partitions 节点里的 `read-only` 属性；它不阻止 `root` 通过 `/dev/mtdblockN` 写入，只是告诉内核不要读写挂载它。

### mtd_debug

```text
usage: mtd_debug info <device>
       mtd_debug read <device> <offset> <len> <dest-filename>
       mtd_debug write <device> <offset> <len> <source-filename>
       mtd_debug erase <device> <offset> <len>
```

```sh
mtd_debug info /dev/mtd4
mtd_debug read /dev/mtd4 0 4 /tmp/magic
hexdump -C /tmp/magic
```

`info` 打印 `mtd.type`、`mtd.flags`、`mtd.size`、`mtd.erasesize`、`mtd.writesize`、`mtd.oobsize` 和区域列表；`mtd4` 的类型是 `MTD_NORFLASH`，大小是 `8585216 (8M)`，标志是 `MTD_BIT_WRITEABLE`：设备树里这个分区标了只读，所以可写位被屏蔽。可写的 `mtd5` 则显示 `MTD_CAP_NORFLASH`。上面的 read 产生 SquashFS 魔数：

```text
00000000  68 73 71 73                                       |hsqs|
00000004
```

`write` 和 `erase` 直接作用在 flash 上。设备和长度要反复确认：没有确认提示，也没有撤销。`mtd_debug` 绕过文件系统，所以绝对不要擦除或写入已挂载的分区。

### flash_erase

```text
Usage: flash_erase [options] MTD_DEVICE <start offset> <block count>
```

```sh
flash_erase /dev/mtd5 0 0
flash_erase -j /dev/mtd5 0 0
```

块计数 `0` 意思是“到设备末尾”，所以第一条会擦掉整个 1 MiB overlay。`-j` 写入 JFFS2 cleanmarker。这正是 `/sbin/init` 在挂载空 overlay 之前跑的命令。

:::danger
`flash_erase /dev/mtd5 0 0` 会毁掉 overlay 里的所有改动：日志、改过的脚本、新增的文件，以及 overlayfs upper 本身。只有在 JFFS2 尚未挂载时才是安全的，比如刚刷完的板子。要故意重置板子，先卸载 `/mnt/overlay` 再擦除；正在运行的根就在用这个 upper，所以最干净的重置是刷完整镜像后重启。
:::

### blkid

```text
Usage: blkid [BLOCKDEV]...
```

```sh
blkid
blkid /dev/mmcblk0p1
```

`blkid` 读文件系统超级块，对它认识的东西打印 `DEVICE: UUID="..." TYPE="..."`。它适合看 SD 卡分区，不适合看 NOR：这些分区是有设备树表的 MTD 设备，不是 DOS 或 GPT 分区表，`blkid` 在上面找不到文件系统 UUID。找不到签名时它什么都不打印，而不是报错。

### fdisk

```text
Usage: fdisk [-uls] [-C CYLINDERS] [-H HEADS] [-S SECTORS] [-b SSZ] [-t PARTTYPE] DISK
```

```sh
fdisk -l /dev/mmcblk0
```

`fdisk -l` 打印块设备的分区表。用它看 SD 卡，不要用在 `/dev/mtdblockN` 上：NOR 里没有分区表，输出没有意义。不带 `-l` 的 `fdisk` 是交互式编辑器；写错会毁掉卡上的表，而且没有撤销。

### dd

```text
Usage: dd [if=FILE] [of=FILE] [bs=N] [count=N] [skip=N] [seek=N]
	[conv=notrunc|noerror|sync|fsync] ...
```

```sh
dd if=/dev/mtdblock4 of=/tmp/rootfs-head.bin bs=1k count=16
hexdump -C -n 16 /tmp/rootfs-head.bin
```

`bs` 是块大小；`count` 是块数不是字节数；`skip` 和 `seek` 也以块为单位，除非用 `iflag=skip_bytes` 或 `oflag=seek_bytes`。第一条把 rootfs 分区前 16 KiB 拷进 tmpfs，足够看 SquashFS 头，又不用拷 8.2 MiB。`of=/dev/mtdblockN` 会经过块设备缓存写 flash；正式的 flash 更新优先用 `mtd_debug write` 或 `flashcp`，并且绝不要写已挂载的分区。

## 硬件检查

### devmem

```text
Usage: devmem ADDRESS [WIDTH [VALUE]]
```

只给地址时它按十六进制打印值；给了宽度就按这个位宽读；给了值就写，然后打印结果。`WIDTH` 是 8、16、32 或 64。地址是物理地址；每次读写就是对那个地址的一次访问。

一个有用的读是 `0x03000004` 的系统配置寄存器。位 27:25 选择 OTG FIFO RAM 的划分；USB 控制器要求它们为 0，MUSB gadget 才能枚举。启动 gadget 之前先读这个寄存器：

```sh
devmem 0x03000004 32
```

对任意寄存器写入可能挂死板子或损坏外设。写的形式是 `devmem ADDRESS WIDTH VALUE`，它替换整个位宽，而不只是你心里想的那几位；只写你在 SoC 或板级文档里查到的地址，并记下旧值。

### dd if=/dev/mem

```sh
dd if=/dev/mem bs=1 skip=$((0x41e00000)) count=16 2>/dev/null | hexdump -C
```

内核开了 `CONFIG_DEVMEM=y`，没开 `CONFIG_STRICT_DEVMEM`，所以 `/dev/mem` 暴露物理内存。`skip` 以 `bs` 为单位，`bs=1` 时就是字节偏移。例子里的 `0x41e00000` 在 PSRAM 顶部附近：板级测试流程刷一个特殊的 DTB（`dtb-test.bin`），在那里预留 2 MiB，于是可以用 `xfel` 写入二进制，再用 `dd` 读回。没有那个 DTB 时，内核可能把同一块内存分配给自己。通过 `/dev/mem` 读设备寄存器可行但不是缓存一致的；单个寄存器用 `devmem`。

### hexdump、xxd、od

```sh
hexdump -C -n 64 /dev/mtdblock4
xxd -l 64 /dev/mtdblock4
od -A x -t x1 -N 64 /dev/mtdblock4
```

`hexdump -C` 是可读的默认选择：偏移、16 字节十六进制、ASCII 列。`xxd` 适合用 `-i` 把字节变成 C 数组。`od` 是 POSIX 工具；这个 BusyBox 构建接受 `-A`、`-t`、`-N`、`-j` 和 `-w`，但不是所有 GNU 类型串。

### lsusb

```sh
lsusb
```

BusyBox `lsusb` 遍历 `/sys/bus/usb/devices`，每个设备打印一行：总线号、设备号、厂商和产品 ID、产品字符串。root hub 不列出。host 口上什么都没插时输出为空，这是正常的。device 模式下 host 控制器是关的，所以 `lsusb` 也是空。gadget 本身要从线的另一端看，不是从板子看。

### lsblk

```sh
lsblk
lsblk /dev/mmcblk0
```

`lsblk` 从 `/sys/block` 列出块设备。板子上它显示 `mtdblock0` 到 `mtdblock5`，每个 MTD 分区一个，带分区大小和只读标志；插上 TF 卡后 `mmcblk0` 和它的分区也会出现。overlay 根本身不是块设备，所以不要指望看到 `squashfs` 或 `overlay` 行。

### /proc/cpuinfo

`cat /proc/cpuinfo` 给单个 C907 hart 打印一块信息。字段是：

| 字段 | 这块板子上的值 |
| --- | --- |
| `processor` | `0` |
| `hart` | `0` |
| `isa` | `rv32` 加上所有 hart 共有的扩展 |
| `mmu` | `sv32` |
| `uarch` | `thead,c907` |
| `mvendorid`、`marchid`、`mimpid` | hart 报告的值 |
| `hart isa` | 这个 hart 的完整扩展列表 |

设备树 CPU 节点列了 `i`、`m`、`a`、`f`、`d`、`c`、`v`、若干 `z*` 扩展和 T-Head 厂商扩展。两行 `isa` 可以不同；第一行是所有 hart 的交集，第二行是这个 hart 自己的列表。

### /proc/interrupts

```sh
cat /proc/interrupts
```

因为 `CONFIG_SMP` 关着，表头只有一列 `CPU0`。后面每行是中断号、每 CPU 计数、中断控制器或类型，以及设备名。负载下计数持续增长的行就是要看的：UART、MMC 控制器、显示引擎和 USB 控制器通常是活跃的中断源。名字来自设备树节点，所以 `2500400.serial` 是 UART1，PLIC 编号和 `interrupts-extended` 属性对应。

### /proc/meminfo

```sh
head -5 /proc/meminfo
grep -E 'MemTotal|MemFree|MemAvailable|Cached' /proc/meminfo
```

`MemTotal` 是内核自己预留之后可用的 RAM，约 26 MiB。`MemAvailable` 是不用交换就能满足新分配的估计。内存没有进程增长却消失了，值得看 `Slab`、`SUnreclaim` 和 `PageTables`。

### /sys/kernel/debug

debugfs 编进去了，但 init 脚本不挂它。读 `/sys/kernel/debug` 下的东西之前先挂载：

```sh
mount -t debugfs none /sys/kernel/debug
ls /sys/kernel/debug
cat /sys/kernel/debug/clk/clk_summary
cat /sys/kernel/debug/regulator/regulator_summary
cat /sys/kernel/debug/devices_deferred
```

`clk_summary` 列出每个时钟、频率和使能计数；外设时钟不对时先看它。`regulator_summary` 显示固定的 3.3 V 电源轨和它的消费者。`devices_deferred` 列出等待依赖的设备，显示或 USB 节点缺失通常就是它：组件还没 probe。

ftrace 要单独挂 tracefs：

```sh
mount -t tracefs none /sys/kernel/tracing
cat /sys/kernel/tracing/available_tracers
```

### /sys/class 和 /sys/devices

`/sys/class/<subsystem>` 是快速索引：`ls /sys/class` 会看到 `drm`、`graphics`、`i2c-dev`、`misc`、`mmc`、`mtd`、`net`（没有网络时不存在）、`tty`、`udc`、`video4linux` 等。class 条目是指向 `/sys/devices` 的符号链接，父链显示设备挂在哪条总线和哪个控制器上。`readlink -f /sys/class/video4linux/video1` 往往就够确认驱动实例。

## I2C 和串口

### i2cdetect

```text
Usage: i2cdetect -l | -F I2CBUS | [-ya] [-q|-r] I2CBUS [FIRST LAST]
```

```sh
i2cdetect -l
i2cdetect -y 0
i2cdetect -y 0 0x20 0x30
```

`-l` 列出适配器，是第一个该跑的命令：只会出现板子上启用的那个 I2C 控制器，总线号是内核分配的。不要从另一个内核或设备树硬编码总线号。`-y` 关掉交互确认；`-q` 用 SMBus quick write 探测，`-r` 用 read byte。网格里有设备应答的地址显示十六进制，没有的显示 `--`。探测设备不期望的地址可能让它困惑，所以 `-y` 是一个有意的选择。

板级设备树在 `PB2`/`PB3` 上启用一个 I2C 控制器，没有声明任何子设备，所以空网格是正常结果。

### i2cget、i2cset、i2cdump、i2ctransfer

```text
Usage: i2cget [-fy] BUS CHIP-ADDRESS [DATA-ADDRESS [MODE]]
Usage: i2cset [-fy] [-m MASK] BUS CHIP-ADDRESS DATA-ADDRESS [VALUE] ... [MODE]
Usage: i2cdump [-fy] [-r FIRST-LAST] BUS ADDR [MODE]
Usage: i2ctransfer [-fay] I2CBUS { rLENGTH[@ADDR] | wLENGTH[@ADDR] DATA...}...
```

```sh
i2cget -y 0 0x50 0x00
i2cget -y 0 0x50 0x00 w
i2cset -y 0 0x50 0x00 0x12
i2cdump -y 0 0x50
i2ctransfer -y 0 w2@0x50 0x00 0x10 r4@0x50
```

模式字母选择传输方式：`b` 字节数据（默认）、`w` 字数据、`c` 给 `i2cget` 先写字节再读字节；`i2cset` 还有 `i` 块和 `s` SMBus 块。`i2cdump` 读整个寄存器空间，对传感器没问题，对读操作有副作用的设备是坏主意。脚本里必须加 `-y`；不加工具会要求确认。

写未知地址可能改 PMIC 电压或时钟配置。先看原理图和器件数据手册，并记下旧寄存器值。

### microcom

```sh
microcom -s 115200 /dev/ttyGS0
microcom -s 115200 -t 5000 /dev/ttyGS0
```

`microcom` 在 stdin/stdout 和 tty 之间搭桥。Ctrl-X 退出；`-X` 关掉这个功能以及 NUL 的特殊含义，二进制协议需要它。`-t` 在两边都静默指定毫秒后退出。完整选项见 [BusyBox - shell 与 applet](busybox.md)。

`/dev/ttyS1` 是控制台，getty 占着它，所以在那个设备上跑 microcom 会和登录提示打架。用 USB gadget 的 `/dev/ttyGS0`，或者先停掉 getty。

### stty

```text
Usage: stty [-a|g] [-F DEVICE] [SETTING]...
```

```sh
stty -F /dev/ttyS1 -a
stty -F /dev/ttyS1 115200 cs8 -cstopb -parenb
stty -F /dev/ttyGS0 raw -echo
```

`-a` 以可读形式打印设置，`-g` 打印成 `stty` 能读回去的形式。控制台是 115200 8N1。在控制台正在使用时改 `/dev/ttyS1` 可能把自己锁在板子外面直到重启，因为 getty 和内核控制台保持旧设置，而你的终端程序没有。改设置请用空闲串口或 gadget。

## 显示

### fbset

```text
Usage: fbset [OPTIONS] [MODE]
```

```sh
fbset
fbset -fb /dev/fb0
```

`fbset` 读 framebuffer 的可变屏幕信息，打印一个 mode 块。在 DRM fbdev 模拟下，像素时钟和所有时序字段都是零，模式名带一个零刷新后缀：第一行是 `mode "1024x768-0"`，geometry 行是 `geometry 1024 768 1024 768 32`，时序行全是零。把它当 framebuffer 的描述看，不要当成面板时序；面板时序在 JD9168S 驱动里。这是精简的 BusyBox fbset：`-i` 不处理，但 `-fb`、`-s`、`-g`、`-t` 和 `-db` 可用。

`-0` 后缀和零时序不是错误。fbdev 兼容层故意不报告像素时钟，因为模式归 DRM 驱动所有，不归 fbdev；通过 `fbset` 改时序会被忽略或拒绝。

### /dev/fb0 和 sysfs

```sh
cat /sys/class/graphics/fb0/virtual_size
cat /sys/class/graphics/fb0/bits_per_pixel
cat /sys/class/graphics/fb0/stride
```

```text
1024,768
32
4096
```

framebuffer 是 XRGB8888，行跨度 4096 字节。程序可以 `mmap()` `/dev/fb0` 写像素，但 DRM fbdev 模拟只有一个缓冲区，而且控制台占着它；这个节点没有页翻转双缓冲。静态图像之外的东西用 `/dev/dri/card0`。

### /sys/class/drm

```sh
ls /sys/class/drm
cat /sys/class/drm/card0-DSI-1/status
cat /sys/class/drm/card0-DSI-1/modes
```

连接器目录名由 DRM 连接器类型和序号决定；先列目录，不要假设。这块板子上是 `card0-DSI-1`，状态是 `connected`，模式列表只有一行：

```text
1024x768
```

`/dev/dri/card0` 是 modesetting 节点。镜像里没有 libdrm，所以程序用 `<drm/drm.h>` 和 `<drm/drm_mode.h>` 里的裸 ioctl；显示驱动页面有完整例子。

### 背光

```sh
ls /sys/class/backlight/
cat /sys/class/backlight/*/max_brightness
echo 128 > /sys/class/backlight/*/brightness
```

`max_brightness` 是 255。写 0 会让面板变黑但 DSI 链路不断，适合让板子继续跑而关屏。目录名来自设备树节点，所以先列出来。

## 视频节点

```sh
for n in /sys/class/video4linux/video*/name; do
	printf '%s: ' "$n"
	cat "$n"
done
```

当前这次启动会打印：

```text
/sys/class/video4linux/video0/name: sun252i-g2d
/sys/class/video4linux/video1/name: cedrus
```

编号按 probe 顺序分配，所以读 `name` 文件，不要假设谁是谁。`sun252i-g2d` 是内存到内存的转换器（`/dev/video0`），`cedrus` 是视频引擎（`/dev/video1`）。无状态 H.264 解码器还会在 `/dev/media0` 暴露一个 media 设备。

镜像里没有 `v4l2-ctl`，所以没有列格式或排队缓冲区的 shell 命令。`/sys/class/video4linux/video0/index` 和 `/dev` 给出节点号；格式协商和流式传输要用程序走 V4L2 ioctl。

## USB gadget 配方

OTG 控制器和 EHCI/OHCI 共用一套 PHY，同一时间只能有一个角色。角色通过写 MUSB 控制器的 mode 属性切换：

```sh
echo peripheral > /sys/devices/platform/soc/4100000.usb/musb-hdrc.1.auto/mode
echo host > /sys/devices/platform/soc/4100000.usb/musb-hdrc.1.auto/mode
```

要呈现一个 ACM 串口给主机：

```sh
mount -t configfs none /sys/kernel/config
cd /sys/kernel/config/usb_gadget
mkdir g1
cd g1
echo 0x1d6b > idVendor
echo 0x0104 > idProduct
mkdir strings/0x409
echo YuzukiNeko > strings/0x409/product
mkdir functions/acm.usb0
mkdir configs/c.1
ln -s functions/acm.usb0 configs/c.1/
echo musb-hdrc.1.auto > UDC
cat /sys/class/udc/*/state
```

最后一条打印 `configured` 时枚举完成，`/dev/ttyGS0` 存在。Windows 会看到一个 VID 为 `1D6B` 的新 COM 口。这个口和 FEL、ThunderLinker 用的是同一个，所以 gadget 绑定期间不能刷板子；用 `xfel` 之前切回 `host`，或者断电重启。

如果 OTG FIFO RAM 不是控制器期望的划分，UDC 会停在 `default`。OTG 驱动 claim `sram-usb` 段并清掉 `SYS_CFG`（`0x03000004`）的位 27:25；枚举失败时用 `devmem 0x03000004 32` 检查寄存器。

gadget 还可以声明 mass storage（`functions/mass_storage.usb0`）和通用串口功能。它无法有意义地提供 ECM 网络：`CONFIG_NET` 是关的，接口后面没有网络协议栈。

## 日志和调试

### dmesg 级别

命令行设了 `loglevel=8`，所以启动时内核什么都往控制台打。`/proc/sys/kernel/printk` 里的四个数是控制台级别、默认消息级别、最低控制台级别、默认控制台级别：

```sh
cat /proc/sys/kernel/printk
```

```text
8	4	1	7
```

要阻止日常内核消息盖掉提示符，同时不丢环形缓冲区里的记录：

```sh
dmesg -n 4
echo 4 > /proc/sys/kernel/printk
sysctl -w kernel.printk="4 4 1 7"
```

`dmesg -n 4` 影响当前控制台级别；`sysctl` 形式设置四个字段，想明确表达改动时用它。除非同时在 `/etc/sysctl.d/` 下加一行，否则重启就恢复。

### /proc/sys

```sh
ls /proc/sys
ls /proc/sys/kernel
cat /proc/sys/kernel/printk
sysctl -a
sysctl -w kernel.printk="4 4 1 7"
sysctl -p /etc/sysctl.d/99-local.conf
```

`/proc/sys` 是实时视图；写文件立即生效。`sysctl -a` 打印每个可写开关和它的值。启动脚本 `S02sysctl` 按顺序应用 `/etc/sysctl.d`、`/usr/lib/sysctl.d`、`/lib/sysctl.d` 和 `/etc/sysctl.conf` 里的文件。要跨重启保留的设置放进这些文件，不要放进 shell profile。

### syslog 和 /var/log/messages

`logger` 和 `S01syslogd` 启动的 syslogd 在这个内核上不能用。BusyBox syslogd 做的第一件事是打开一个 `AF_UNIX` 数据报 socket，而 `AF_UNIX` 属于网络协议栈：`CONFIG_NET` 关着，`socket()` 返回 `EAFNOSUPPORT`，syslogd 退出。启动脚本已经打印了 `Starting syslogd: OK`，因为 `start-stop-daemon --background` 只报告 fork 成功，不报告守护进程有没有留下。`klogd` 可能留在运行状态读内核日志，但它的 `syslog()` 调用没有 `/dev/log` 可到。`/var/log/messages` 不存在。

内核消息用 `dmesg`。用户空间的记录自己写文件，并在行首加上时间：

```sh
( date; ./test; date ) >> /root/test.log 2>&1
tail -20 /root/test.log
```

`/root` 在 JFFS2 overlay 上，能跨重启；`/tmp` 是 tmpfs，不能。完整的启动日志要在主机上抓串口控制台，不要指望板子自己存。

要让 syslog 工作，需要带 `CONFIG_NET` 和 `CONFIG_UNIX` 的内核；根文件系统里已经有这些守护进程，不需要改软件包。

### 内核配置和设备树

没有 `/proc/config.gz`：`CONFIG_IKCONFIG` 没开。运行配置在内核构建目录（`output/build/linux-.../.config`），源码 defconfig 在内核树里。设备树可以在 `/proc/device-tree` 下实时看到：

```sh
cat /proc/device-tree/model
ls /proc/device-tree/chosen
hexdump -C /proc/device-tree/chosen/bootargs
```

`/proc/device-tree` 是一堆二进制属性的目录；字符串以 NUL 结尾，所以 `hexdump -C` 对 `bootargs` 很有用。

## 用不了的东西

| 命令或特性 | 原因 |
| --- | --- |
| `ping`、`wget`、`ip`、`ifconfig`、`telnet` | applet 存在，但内核没有 `CONFIG_NET`；socket 调用在发出数据包之前就失败 |
| `/proc/net` | 没有网络协议栈就不会创建 |
| `bash`、`python`、`perl` | 镜像里没有 |
| `stat`、`file`、`ldd`、`readelf` | 镜像里没有；用 `ls -l`、`strings` 和主机上的交叉工具链 |
| `opkg`、`apt`、`pip` | 没有包管理器 |
| `systemctl`、`journalctl` | 用的是 BusyBox init 和 syslogd，不是 systemd |
| `v4l2-ctl` | 镜像里没有；格式和流式传输用裸 V4L2 ioctl |
| `syslogd`、`klogd`、`logger`、`/var/log/messages` | `AF_UNIX` socket 需要 `CONFIG_NET`；syslogd 退出，其余的无处可发 |
| 直接写 `/` 底层 | 根是 overlayfs，可写，但下层 SquashFS 不可写；改动进 JFFS2 upper |
| `rmmod` | RV64I 内核没有配置模块卸载 |

## 常见问题

| 现象 | 原因和解决办法 |
| --- | --- |
| `can't open '/dev/...': No such file or directory` | 设备节点不存在：设备树里没启用驱动，或者模块没加载 |
| 设备上报 `Permission denied` | 节点存在但访问模式或内核配置不允许；你是 root，检查驱动 |
| `Address family not supported by protocol` | 在没有 `CONFIG_NET` 的内核上跑网络命令 |
| `mount: mounting ... failed` | 文件系统类型不对、MTD 标签不存在，或者分区已经挂载 |
| `flash_erase` 成功但板子丢了改动 | overlay 被擦掉了；JFFS2 upper 没了 |
| `devmem` 返回 `0xffffffff` | 那个块的时钟或电源域关着，或者地址没有映射 |
| `i2cdetect` 看不到总线 | I2C 节点被禁用或引脚没复用；检查板级设备树 |
| `fbset` 报 `No such device` | 显示流水线没 probe；在 `dmesg` 里找 `-EPROBE_DEFER` |
| `stty` 之后控制台不响应 | 控制台 tty 设置被改了；重启板子 |
