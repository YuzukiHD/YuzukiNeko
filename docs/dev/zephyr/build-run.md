# 编译与运行

## 编译

```bash
. ./env.sh                      # 激活 .venv，设置 ZEPHYR_BASE、CROSS_COMPILE、PATH
west build -b yuzukineko -d build/hello zephyr/samples/hello_world
```

输出在 `build/hello/zephyr/zephyr.{elf,bin}`，镜像链接在 `0x40010000`（入口 `__start`），工具链是 XuanTie 900 newlib GCC（`ZEPHYR_TOOLCHAIN_VARIANT=cross-compile`）。

## 经 FEL 载入运行

在已进入 FEL 的板子上：

```sh
xfel ddr f101-s3
xfel write 0x40010000 zephyr.bin
xfel exec 0x40010000
```

要点：

- <strong>每次下载都要重新上电进入 FEL</strong>；`exec` 之后 FEL 不再可用。
- `ddr` 这一步的辅助程序也会把 UART 时钟和引脚复用配置好；没有它，控制台没有输出。
- 经 xfel 启动会跳过 boot0/u-boot，所以 SoC 早期初始化需要自己设好 CPU CSR 和控制台时钟。
- `exec` 之后不要再用 `xfel read32` / `hexdump` 查看状态，USB 链路已断。想查状态只能在 `exec` 前做。
- 重新上电后用 `xfel version` 确认 FEL（输出里有 `AWUSBFEX ID=0x00193700(F101)`）。`exec` 后看到 `usb bulk send/recv error` 说明 CPU 已离开 BROM、代码在跑，不代表 Zephyr 健康。

## 控制台

`yuzukineko` 的控制台是 UART1 的 `PB00` / `PB01`，115200 8N1。把 USB 转串口的 RX/TX 接到这两个脚，共地。没有输出时，先用一个裸机小程序证明路径（链接在 `0x40010000`，轮询 UART 并写发送寄存器），这样可以区分问题出在执行、串口、接线上，还是 Zephyr 自身。
