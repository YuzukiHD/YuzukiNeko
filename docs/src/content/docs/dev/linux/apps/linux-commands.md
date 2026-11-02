---
title: "Common commands"
---

This page is a cookbook for the shell on the board. Every command shown exists in the shipped image and is meant to be run as `root` on the `ttyS1` console. The examples are grouped by task; for each command there is the syntax this BusyBox build accepts, a real invocation, what the output looks like, and the trap that usually catches people.

The root account has no password, the prompt is `# `, and the current directory starts at `/`. The shell is ash, not bash; see [BusyBox - shell and applets](busybox.md) for the syntax differences.

:::tip
A single command that runs for more than a few minutes can exceed the timeout of the serial-console tool. Run it in the background and read the file afterwards:

```sh
( long_command > /tmp/out.txt 2>&1 & )
cat /tmp/out.txt
```

`/tmp` is a tmpfs, so the redirect is cheap, but it shares RAM with everything else and is wiped at reboot.
:::

## System and processes

### ps

```text
Usage: ps [-o COL1,COL2=HEADER]
```

BusyBox `ps` does not accept BSD-style `ps aux`. The default output is one line per process with `PID`, `USER`, `VSZ`, `STAT`, and `COMMAND`; `-o` selects and renames columns:

```sh
ps
ps -o pid,ppid,user,stat,args
```

| Column | Meaning |
| --- | --- |
| `PID` | Process ID |
| `PPID` | Parent process ID |
| `USER` | Owner |
| `VSZ` | Virtual memory size in KiB |
| `STAT` | State letter: `R` running, `S` sleeping, `D` uninterruptible, `Z` zombie |
| `ARGS` | Full command line |
| `COMMAND` | Command name |

`ps` reads `/proc`; a process that has just exited and is not reaped by its parent shows as `Z`. The getty on `ttyS1` and the syslog/klogd/crond daemons are the processes to expect at idle.

### top

```text
Usage: top [-b] [-n COUNT] [-d SECONDS]
```

`top` reads `/proc` every two seconds by default. In batch mode it prints one screen and exits, which is what you want in a captured log:

```sh
top -b -n 1
top -b -n 5 -d 1
```

Interactive keys: `N` sorts by PID, `M` by memory, `P` by CPU, `T` by time, `R` reverses the sort, `Q` or Ctrl-C exits. On a single-core C907 the CPU percentages are relative to that one hart, so a process at 100% is using the whole CPU.

### free

```text
Usage: free [-bkmgh]
```

```sh
free -h
free -m
```

The columns are `total`, `used`, `free`, `shared`, `buff/cache`, and `available`. The board has 32 MiB of PSRAM, of which the kernel and its data structures take several MiB; `Mem:` total is about 26 MiB. `Swap:` is zero because no swap device is configured. `available` is the number to watch: it accounts for reclaimable page cache and is what a new program can actually get.

### uptime

```sh
uptime
```

One line: current time, time since boot, number of users, and the 1, 5, and 15 minute load averages. On this board a load average above 1.0 means a single runnable task is saturating the CPU, not that the system is overloaded in the server sense.

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

`dmesg -c` prints the buffer and clears it. Clearing destroys the evidence for the next person, and klogd may already have copied the lines to `/var/log/messages`; prefer `dmesg | tail` unless the buffer is genuinely full. `dmesg -n LEVEL` sets the console log level and is the quick way to stop kernel messages from overwriting the prompt; it does not change what klogd records. The log buffer is 128 KiB (`CONFIG_LOG_BUF_SHIFT=17`).

Boot messages are timestamped because the command line contains `printk.time=1`. A typical boot line starts with `[    0.000000]`, and the timestamps are seconds since the kernel started.

### kill and killall

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

| Signal | Number | Use |
| --- | ---: | --- |
| `HUP` | 1 | Reload configuration, or hang up a terminal |
| `INT` | 2 | Same as Ctrl-C |
| `KILL` | 9 | Cannot be caught or ignored; last resort |
| `TERM` | 15 | Default; ask the process to exit |
| `STOP` | 19 | Pause the process |
| `CONT` | 18 | Resume a stopped process |
| `USR1`, `USR2` | 10, 12 | Program-specific |

`killall` matches the process name (`comm`), not the full command line, so `killall sh` kills every shell, including the one that ran the command. Prefer a PID from `ps`. PID 1 is the BusyBox init; killing it reboots the board.

### reboot, poweroff, halt

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

A plain `reboot` sends the request through init, which runs the `shutdown` entries in `/etc/inittab`: `rcK` stops the services in reverse order, `swapoff -a`, and `umount -a -r`. `-f` bypasses init and is a good way to corrupt the JFFS2 overlay; avoid it unless the system is already wedged. If the board does not come back, power-cycle it with the ThunderLinker relay rather than holding the reset button.

## Files and storage

### ls, cp, mv, rm

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

`ls -l` is the substitute for `stat`, which this image does not have: it shows the mode, owner, group, size, and modification time. `cp -a` preserves mode and timestamps. `rm -rf /` is not prevented by anything; there is no `--preserve-root` guard, so be careful with wildcards.

### tar and gzip

```text
Usage: tar c|x|t [-ahvokO] [-f TARFILE] [-C DIR] [-T FILE] [-X FILE] [LONGOPT]... [FILE]...
Usage: gzip [-cfkdt] [FILE]...
```

BusyBox tar selects compression from the file extension with `-a`; the separate `-z` option is not in this build's help. The portable form pipes through gzip explicitly:

```sh
tar -cf - /etc | gzip > /tmp/etc.tar.gz
tar -tzf /tmp/etc.tar.gz | head
tar -xf /tmp/etc.tar.gz -C /tmp
```

`-tzf` worked on the shipped binary when tested against a gzip stream. To unpack a tarball without gzip, use `tar -xf file.tar -C DIR`. `gzip -k` keeps the input file; without `-k` the original is replaced by `.gz`. In this build `xz`, `bunzip2`/`bzcat`, `lzma`, and `lzopcat` are decompression-only; `gzip` is the compressor to use.

### df and du

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

`df /` reports the overlay filesystem, whose writable space is the 1 MiB JFFS2 upper, not the whole 32 MiB of RAM. `/tmp`, `/run`, and `/dev/shm` are tmpfs and show RAM-backed sizes. `du` walks the directory tree; on `/` it crosses into `/proc`, `/sys`, and `/dev`, so redirect errors and use `-x` if you only want one filesystem.

### mount and umount

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

At idle, `mount` shows the overlay root, the JFFS2 upper at `/mnt/overlay`, `proc`, `sysfs`, `devtmpfs`, and the tmpfs mounts for `/dev/shm`, `/tmp`, and `/run`. `mount -a` mounts everything in `/etc/fstab`; the `/dev/root` entry is marked `noauto` and is skipped. Mounting by MTD name, as in `mount -t jffs2 mtd:overlay /mnt/overlay`, requires the partition label to exist in `/proc/mtd`.

### /proc/mtd

`cat /proc/mtd` prints one line per partition:

```text
mtdN: <size> <erasesize> "<label>"
```

The board has six:

| Device | Label | Size | Read-only |
| --- | --- | ---: | --- |
| `/dev/mtd0` | `bootloader` | 64 KiB | yes |
| `/dev/mtd1` | `dtb` | 256 KiB | yes |
| `/dev/mtd2` | `opensbi` | 512 KiB | yes |
| `/dev/mtd3` | `kernel` | 6 MiB | yes |
| `/dev/mtd4` | `rootfs` | 8.2 MiB | yes |
| `/dev/mtd5` | `overlay` | 1 MiB | no |

The matching block devices are `/dev/mtdblock0` through `/dev/mtdblock5`. The read-only flag comes from the `read-only` property in the devicetree fixed-partitions node; it does not stop `root` from writing through `/dev/mtdblockN`, it only tells the kernel not to mount it read-write.

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

`info` prints `mtd.type`, `mtd.flags`, `mtd.size`, `mtd.erasesize`, `mtd.writesize`, `mtd.oobsize`, and the region list; for `mtd4` the type is `MTD_NORFLASH`, the size is `8585216 (8M)`, and the flags are `MTD_BIT_WRITEABLE`: the partition is marked read-only in the devicetree, so the writable bit is masked out. The writable `mtd5` shows `MTD_CAP_NORFLASH` instead. The read above produces the SquashFS magic:

```text
00000000  68 73 71 73                                       |hsqs|
00000004
```

`write` and `erase` act on the flash immediately. Double-check the device and the length: there is no confirmation prompt and no undo. `mtd_debug` bypasses the filesystem, so never erase or write a partition that is mounted.

### flash_erase

```text
Usage: flash_erase [options] MTD_DEVICE <start offset> <block count>
```

```sh
flash_erase /dev/mtd5 0 0
flash_erase -j /dev/mtd5 0 0
```

A block count of `0` means "to the end of the device", so the first command erases the whole 1 MiB overlay. `-j` writes JFFS2 cleanmarkers. This is the command `/sbin/init` runs on a blank overlay before mounting it.

:::danger
`flash_erase /dev/mtd5 0 0` destroys every change stored in the overlay: logs, edited scripts, added files, and the overlayfs upper itself. It is safe only before the JFFS2 filesystem is mounted, as on a freshly flashed board. To reset the board deliberately, unmount `/mnt/overlay` first, then erase; the running root is using that upper, so the cleanest reset is a reboot after flashing a full image.
:::

### blkid

```text
Usage: blkid [BLOCKDEV]...
```

```sh
blkid
blkid /dev/mmcblk0p1
```

`blkid` reads filesystem superblocks and prints `DEVICE: UUID="..." TYPE="..."` for what it recognises. It is useful for an SD card partition, not for the NOR: the partitions are MTD devices with a devicetree table, not a DOS or GPT partition table, and `blkid` does not find a filesystem UUID on them. It prints nothing rather than an error when it finds no signature.

### fdisk

```text
Usage: fdisk [-uls] [-C CYLINDERS] [-H HEADS] [-S SECTORS] [-b SSZ] [-t PARTTYPE] DISK
```

```sh
fdisk -l /dev/mmcblk0
```

`fdisk -l` prints the partition table of a block device. Use it on the SD card, not on `/dev/mtdblockN`: there is no partition table in the NOR, so the output is meaningless. `fdisk` without `-l` is the interactive editor; a wrong write destroys the card's table, and there is no undo.

### dd

```text
Usage: dd [if=FILE] [of=FILE] [bs=N] [count=N] [skip=N] [seek=N]
	[conv=notrunc|noerror|sync|fsync] ...
```

```sh
dd if=/dev/mtdblock4 of=/tmp/rootfs-head.bin bs=1k count=16
hexdump -C -n 16 /tmp/rootfs-head.bin
```

`bs` is the block size; `count` is a number of blocks, not bytes; `skip` and `seek` are also in blocks unless `iflag=skip_bytes` or `oflag=seek_bytes` is used. The first command copies the first 16 KiB of the rootfs partition into tmpfs, enough to inspect the SquashFS header without copying 8.2 MiB. `of=/dev/mtdblockN` writes to flash through the block-device cache; prefer `mtd_debug write` or `flashcp` for a deliberate flash update, and never write a mounted partition.

## Hardware inspection

### devmem

```text
Usage: devmem ADDRESS [WIDTH [VALUE]]
```

With only an address it prints the value in hex; with a width it reads that many bits; with a value it writes and then prints the result. `WIDTH` is 8, 16, 32, or 64. The address is physical; each read or write is one access to that address.

A useful read is the system configuration register at `0x03000004`. Bits 27:25 select the OTG FIFO RAM split; the USB controller requires them to be zero for the MUSB gadget to enumerate. Read the register before starting a gadget:

```sh
devmem 0x03000004 32
```

A write to an arbitrary register can hang the board or damage a peripheral. The write form is `devmem ADDRESS WIDTH VALUE`, and it replaces the whole width, not just the bits you have in mind; only write an address you have found in the SoC or board documentation, and keep a note of the old value.

### dd if=/dev/mem

```sh
dd if=/dev/mem bs=1 skip=$((0x41e00000)) count=16 2>/dev/null | hexdump -C
```

The kernel is built with `CONFIG_DEVMEM=y` and without `CONFIG_STRICT_DEVMEM`, so `/dev/mem` exposes physical memory. `skip` is in units of `bs`, so with `bs=1` it is a byte offset. The address in the example, `0x41e00000`, is near the top of PSRAM: the board test workflow flashes a special DTB (`dtb-test.bin`) that reserves 2 MiB there, so a binary can be written with `xfel` and read back with `dd`. Without that DTB the kernel may allocate the same memory for itself. Reads of device registers through `/dev/mem` are possible but not cache-coherent; use `devmem` for a single register.

### hexdump, xxd, od

```sh
hexdump -C -n 64 /dev/mtdblock4
xxd -l 64 /dev/mtdblock4
od -A x -t x1 -N 64 /dev/mtdblock4
```

`hexdump -C` is the readable default: offset, 16 bytes in hex, and the ASCII column. `xxd` is convenient when you want to turn bytes into a C array with `-i`. `od` is the POSIX tool; this BusyBox build accepts `-A`, `-t`, `-N`, `-j`, and `-w`, but not every GNU type string.

### lsusb

```sh
lsusb
```

BusyBox `lsusb` walks `/sys/bus/usb/devices` and prints one line per device: bus number, device number, vendor and product IDs, and the product string. Root hubs are not listed. When nothing is plugged into the host port, the output is empty; that is normal. In device mode the host controller is off, so `lsusb` also prints nothing. The gadget itself is visible from the other end of the cable, not from the board.

### lsblk

```sh
lsblk
lsblk /dev/mmcblk0
```

`lsblk` lists block devices from `/sys/block`. On the board it shows `mtdblock0` through `mtdblock5`, one per MTD partition, with the partition size and the read-only flag; insert a TF card and `mmcblk0` and its partitions appear as well. The overlay root itself is not a block device, so do not expect a `squashfs` or `overlay` row.

### /proc/cpuinfo

`cat /proc/cpuinfo` prints one block for the single C907 hart. The fields are:

| Field | Value on this board |
| --- | --- |
| `processor` | `0` |
| `hart` | `0` |
| `isa` | `rv32` followed by the extensions common to all harts |
| `mmu` | `sv32` |
| `uarch` | `thead,c907` |
| `mvendorid`, `marchid`, `mimpid` | The values reported by the hart |
| `hart isa` | The full extension list of this hart |

The devicetree CPU node lists `i`, `m`, `a`, `f`, `d`, `c`, `v`, several `z*` extensions, and the T-Head vendor extensions. The two `isa` lines can differ; the first is the intersection across harts, the second is this hart's own list.

### /proc/interrupts

```sh
cat /proc/interrupts
```

The header has one `CPU0` column because `CONFIG_SMP` is off. Each following line is an interrupt number, the per-CPU counts, the interrupt controller or type, and the device name. Lines with a count that keeps increasing under load are the ones to watch: the UART, the MMC controller, the display engine, and the USB controller are the usual active sources. The names come from the devicetree nodes, so `2500400.serial` is UART1 and the PLIC numbers match the `interrupts-extended` properties.

### /proc/meminfo

```sh
head -5 /proc/meminfo
grep -E 'MemTotal|MemFree|MemAvailable|Cached' /proc/meminfo
```

`MemTotal` is the usable RAM after the kernel's own reservation, about 26 MiB. `MemAvailable` is the estimate of what a new allocation can obtain without swapping. `Slab`, `SUnreclaim`, and `PageTables` are worth checking when memory disappears without a process growing.

### /sys/kernel/debug

debugfs is compiled in but not mounted by the init scripts. Mount it before reading anything under `/sys/kernel/debug`:

```sh
mount -t debugfs none /sys/kernel/debug
ls /sys/kernel/debug
cat /sys/kernel/debug/clk/clk_summary
cat /sys/kernel/debug/regulator/regulator_summary
cat /sys/kernel/debug/devices_deferred
```

`clk_summary` lists every clock, its rate, and its enable count; it is the first place to look when a peripheral's clock is wrong. `regulator_summary` shows the fixed 3.3 V rail and its consumers. `devices_deferred` lists devices waiting for a dependency, which is the usual reason a display or USB node is missing: the component has not probed yet.

For ftrace, mount tracefs separately:

```sh
mount -t tracefs none /sys/kernel/tracing
cat /sys/kernel/tracing/available_tracers
```

### /sys/class and /sys/devices

`/sys/class/<subsystem>` is the fast index: `ls /sys/class` shows `drm`, `graphics`, `i2c-dev`, `misc`, `mmc`, `mtd`, `net` (absent without networking), `tty`, `udc`, `video4linux`, and others. A class entry is a symlink into `/sys/devices`, where the parent chain shows which bus and controller the device sits on. `readlink -f /sys/class/video4linux/video1` is often enough to identify the driver instance.

## I2C and serial

### i2cdetect

```text
Usage: i2cdetect -l | -F I2CBUS | [-ya] [-q|-r] I2CBUS [FIRST LAST]
```

```sh
i2cdetect -l
i2cdetect -y 0
i2cdetect -y 0 0x20 0x30
```

`-l` lists the adapters and is the first command to run: only the board's enabled I2C controller appears, and its bus number is whatever the kernel assigned. Do not hard-code a bus number from another kernel or devicetree. `-y` disables the interactive confirmation; `-q` uses SMBus quick writes, `-r` uses read-byte probes. The grid shows the address in hex where a device acknowledged, and `--` where it did not. Probing an address that a device does not expect can confuse it, which is why `-y` is a deliberate choice.

The board devicetree enables one I2C controller on `PB2`/`PB3`. It declares no child devices, so an empty grid is the normal result.

### i2cget, i2cset, i2cdump, i2ctransfer

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

The mode letter selects the transfer: `b` byte data (the default), `w` word data, `c` write byte then read byte for `i2cget`; `i2cset` adds `i` block and `s` SMBus block. `i2cdump` reads the whole register space, which is fine for a sensor and a bad idea for a device with side effects on read. The `-y` flag is required in scripts; without it the tools ask for confirmation.

Writing to an unknown address can change a PMIC voltage or a clock configuration. Read the schematic and the device datasheet first, and note the old register value.

### microcom

```sh
microcom -s 115200 /dev/ttyGS0
microcom -s 115200 -t 5000 /dev/ttyGS0
```

`microcom` bridges stdin/stdout and a tty. Ctrl-X exits; `-X` disables that and the special meaning of NUL, which is needed for binary protocols. `-t` exits after the given number of milliseconds of silence on both sides. The full option list is in [BusyBox - shell and applets](busybox.md).

`/dev/ttyS1` is the console and getty owns it, so microcom on that device fights the login prompt. Use the USB gadget's `/dev/ttyGS0`, or stop getty first.

### stty

```text
Usage: stty [-a|g] [-F DEVICE] [SETTING]...
```

```sh
stty -F /dev/ttyS1 -a
stty -F /dev/ttyS1 115200 cs8 -cstopb -parenb
stty -F /dev/ttyGS0 raw -echo
```

`-a` prints the settings in human-readable form, `-g` in the form `stty` can read back. The console is 115200 8N1. Changing `/dev/ttyS1` while the console is in use can lock you out of the board until a reboot, because getty and the kernel console keep the old settings while your terminal program does not. Change settings on a spare port or on the gadget instead.

## Display

### fbset

```text
Usage: fbset [OPTIONS] [MODE]
```

```sh
fbset
fbset -fb /dev/fb0
```

`fbset` reads the framebuffer's variable screen info and prints a mode block. With DRM fbdev emulation the pixel clock and all timing fields are zero, and the mode name carries a zero refresh suffix: the first line reads `mode "1024x768-0"`, the geometry line reads `geometry 1024 768 1024 768 32`, and the timing line is all zeros. Read it as a description of the framebuffer, not as the panel timings; those are in the JD9168S driver. This is the minimal BusyBox fbset: `-i` is not handled, but `-fb`, `-s`, `-g`, `-t`, and `-db` are.

The `-0` suffix and zero timings are not an error. The fbdev compatibility layer deliberately reports no pixel clock because the DRM driver, not fbdev, owns the mode; changing the timing through `fbset` would be ignored or rejected.

### /dev/fb0 and sysfs

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

The framebuffer is XRGB8888 with a 4096-byte pitch. A program can `mmap()` `/dev/fb0` and write pixels, but the DRM fbdev emulation has a single buffer and the console owns it; there is no page-flip double buffering through this node. For anything beyond a static image, use `/dev/dri/card0`.

### /sys/class/drm

```sh
ls /sys/class/drm
cat /sys/class/drm/card0-DSI-1/status
cat /sys/class/drm/card0-DSI-1/modes
```

The connector directory name follows the DRM connector type and index; list the directory rather than assuming it. On this board it is `card0-DSI-1`, the status is `connected`, and the mode list contains one line:

```text
1024x768
```

`/dev/dri/card0` is the modesetting node. The image has no libdrm, so a program uses the raw ioctls from `<drm/drm.h>` and `<drm/drm_mode.h>`; the display driver page has a complete example.

### Backlight

```sh
ls /sys/class/backlight/
cat /sys/class/backlight/*/max_brightness
echo 128 > /sys/class/backlight/*/brightness
```

`max_brightness` is 255. Writing 0 turns the panel dark without stopping the DSI link, which is useful when you want the board to keep running with the screen off. The directory name comes from the devicetree node, so list it first.

## Video nodes

```sh
for n in /sys/class/video4linux/video*/name; do
	printf '%s: ' "$n"
	cat "$n"
done
```

On the current boot this prints:

```text
/sys/class/video4linux/video0/name: sun252i-g2d
/sys/class/video4linux/video1/name: cedrus
```

The numbers are assigned in probe order, so read the `name` files instead of assuming which is which. `sun252i-g2d` is the memory-to-memory converter (`/dev/video0`), and `cedrus` is the video engine (`/dev/video1`). The stateless H.264 decoder also exposes a media device at `/dev/media0`.

The image has no `v4l2-ctl`, so there is no shell command to list formats or queue buffers. `/sys/class/video4linux/video0/index` and `/dev` give the node number; format negotiation and streaming are done by a program with the V4L2 ioctls.

## USB gadget recipe

One PHY is shared by the OTG controller and the EHCI/OHCI pair, so only one role is active at a time. The role is switched by writing the mode attribute of the MUSB controller:

```sh
echo peripheral > /sys/devices/platform/soc/4100000.usb/musb-hdrc.1.auto/mode
echo host > /sys/devices/platform/soc/4100000.usb/musb-hdrc.1.auto/mode
```

To present an ACM serial port to the host:

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

When the last command prints `configured`, enumeration is complete and `/dev/ttyGS0` exists. Windows sees a new COM port with VID `1D6B`. The same port is the one used by FEL and the ThunderLinker, so the board cannot be reflashed while the gadget is bound; switch back to `host`, or power-cycle, before using `xfel`.

The UDC stays in `default` if the OTG FIFO RAM is not configured as the controller expects. The OTG driver claims the `sram-usb` section and clears bits 27:25 of `SYS_CFG` (`0x03000004`); check the register with `devmem 0x03000004 32` if enumeration fails.

The gadget can also declare mass storage (`functions/mass_storage.usb0`) and a generic serial function. It cannot provide ECM networking in a useful way: `CONFIG_NET` is off, so there is no network stack behind the interface.

## Logs and debugging

### dmesg levels

The command line sets `loglevel=8`, so the kernel prints everything to the console at boot. The four numbers in `/proc/sys/kernel/printk` are console level, default message level, minimum console level, and default console level:

```sh
cat /proc/sys/kernel/printk
```

```text
8	4	1	7
```

To stop routine kernel messages from overwriting the prompt without losing them from the ring buffer:

```sh
dmesg -n 4
echo 4 > /proc/sys/kernel/printk
sysctl -w kernel.printk="4 4 1 7"
```

`dmesg -n 4` affects the current console level; the `sysctl` form sets all four fields and is what to use when you want the change to be explicit. It lasts until reboot unless you also add a line under `/etc/sysctl.d/`.

### /proc/sys

```sh
ls /proc/sys
ls /proc/sys/kernel
cat /proc/sys/kernel/printk
sysctl -a
sysctl -w kernel.printk="4 4 1 7"
sysctl -p /etc/sysctl.d/99-local.conf
```

`/proc/sys` is the live view; writing a file changes the setting immediately. `sysctl -a` prints every writable knob and its value. The boot script `S02sysctl` applies the files in `/etc/sysctl.d`, `/usr/lib/sysctl.d`, `/lib/sysctl.d`, and `/etc/sysctl.conf`, in that order. If a setting must survive a reboot, put it in one of those files, not in a shell profile.

### syslog and /var/log/messages

`logger` and the syslogd that `S01syslogd` starts do not work on this kernel. BusyBox syslogd opens an `AF_UNIX` datagram socket before doing anything else, and `AF_UNIX` is part of the networking stack: with `CONFIG_NET` off, the `socket()` call fails with `EAFNOSUPPORT` and syslogd exits. The boot script has already printed `Starting syslogd: OK`, because `start-stop-daemon --background` reports that the fork succeeded, not that the daemon stayed up. `klogd` may stay up reading the kernel log, but its `syslog()` calls have no `/dev/log` to reach. There is no `/var/log/messages`.

Use `dmesg` for kernel messages. For user-space records, write a file yourself and prefix the lines with the time:

```sh
( date; ./test; date ) >> /root/test.log 2>&1
tail -20 /root/test.log
```

`/root` is on the JFFS2 overlay and survives a reboot; `/tmp` is a tmpfs and does not. For a complete boot log, capture the serial console on the host instead of relying on the board to store it.

Making syslog work would need a kernel with `CONFIG_NET` and `CONFIG_UNIX`; the rootfs already contains the daemons, so no package change would be needed.

### Kernel configuration and devicetree

There is no `/proc/config.gz`: `CONFIG_IKCONFIG` is not set. The running configuration is the one in the kernel build directory (`output/build/linux-.../.config`), and the source defconfig is in the kernel tree. The devicetree is available live under `/proc/device-tree`:

```sh
cat /proc/device-tree/model
ls /proc/device-tree/chosen
hexdump -C /proc/device-tree/chosen/bootargs
```

`/proc/device-tree` is a directory of binary properties; strings appear as NUL-terminated bytes, which is why `hexdump -C` is useful for `bootargs`.

## What does not work

| Command or feature | Why |
| --- | --- |
| `ping`, `wget`, `ip`, `ifconfig`, `telnet` | The applets exist, but the kernel has no `CONFIG_NET`; socket calls fail before a packet is sent |
| `/proc/net` | Not created without the network stack |
| `bash`, `python`, `perl` | Not in the image |
| `stat`, `file`, `ldd`, `readelf` | Not in the image; use `ls -l`, `strings`, and the cross-toolchain on the host |
| `opkg`, `apt`, `pip` | No package manager |
| `systemctl`, `journalctl` | BusyBox init and syslogd, not systemd |
| `v4l2-ctl` | Not in the image; formats and streaming are done with raw V4L2 ioctls |
| `syslogd`, `klogd`, `logger`, `/var/log/messages` | `AF_UNIX` sockets need `CONFIG_NET`; syslogd exits and the others have nowhere to send |
| Writing to `/` directly | The root is the overlayfs and is writable, but the underlying SquashFS is not; changes go to the JFFS2 upper |
| `rmmod` | The RV64I kernel is built without module unloading |

## Troubleshooting

| Observation | Cause and fix |
| --- | --- |
| `can't open '/dev/...': No such file or directory` | The device node does not exist: the driver is not enabled in the devicetree, or the module is not loaded |
| `Permission denied` on a device | The node exists but the access mode or the kernel configuration forbids it; you are root, so check the driver |
| `Address family not supported by protocol` | A network command on a kernel without `CONFIG_NET` |
| `mount: mounting ... failed` | Wrong filesystem type, missing MTD label, or the partition is already mounted |
| `flash_erase` succeeds but the board loses changes | The overlay was erased; the JFFS2 upper is gone |
| `devmem` returns `0xffffffff` | The clock or power domain for that block is off, or the address is not mapped |
| `i2cdetect` shows no bus | The I2C node is disabled or its pins are not muxed; check the board devicetree |
| `fbset` fails with `No such device` | The display pipeline did not probe; look for `-EPROBE_DEFER` in `dmesg` |
| The console stops responding after `stty` | The console tty settings were changed; reboot the board |
