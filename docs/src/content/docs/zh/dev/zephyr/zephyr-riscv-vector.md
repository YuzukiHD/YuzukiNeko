---
title: "RISC-V 向量扩展 (RVV)"
---

这一页介绍 RISC-V 向量扩展（RVV），以及怎样在 YuzukiNeko 的 Zephyr 上使用它：打开哪个配置、有哪些接口、写代码时要注意什么，并给出可以直接编译的示例。

## 什么是 RVV

RVV 是 RISC-V 的标准向量扩展（"V" 扩展，1.0 版）。它让一条指令同时处理一批数据，适合音频、图像、滤波、矩阵、内存拷贝这类“对很多元素做同样运算”的循环。F101 的 XuanTie C907 内核带有这个扩展，所以芯片是 `rv32imacfdv`。

和固定宽度的 SIMD 不同，RVV 的程序<strong>不依赖向量寄存器有多宽</strong>：同一段代码在不同位宽的实现上都能跑，每一轮处理多少个元素由硬件告诉程序。

### 寄存器和 CSR

| 名称 | 作用 |
| --- | --- |
| `v0`–`v31` | 32 个向量寄存器，每个 `VLEN` 位。F101 的 `VLEN` 是 128 位，即每个寄存器 16 字节 |
| `vlenb` | 只读 CSR，等于 `VLEN / 8`。F101 上是 16 |
| `vl` | 当前这一轮要处理的元素个数 |
| `vtype` | 当前配置：元素宽度、寄存器分组、尾部和掩码策略 |
| `vstart`、`vcsr` | 被打断后从哪个元素继续、定点运算的舍入和饱和状态 |

### 配置向量单元：`vsetvli`

使用向量指令之前，先用 `vsetvli` 说明“我要处理多少个元素、每个多宽”，它返回这一轮实际能处理的个数 `vl`：

```text
vsetvli  vl, 剩余元素数, e32, m8, ta, ma
```

| 参数 | 含义 |
| --- | --- |
| `e8`、`e16`、`e32` | 元素宽度（`SEW`），8、16、32 位 |
| `m1`、`m2`、`m4`、`m8` | 寄存器分组（`LMUL`）：把几个寄存器合起来当一个用。分组越大，一条指令处理的元素越多，可用的寄存器组越少 |
| `ta`、`ma` | 尾部和被掩码的元素怎么处理（这里表示不关心它们的值） |

一轮最多处理 `VLEN / SEW × LMUL` 个元素。F101 上 `VLEN = 128`，所以 `e32, m8` 一轮最多 32 个元素，`e8, m1` 最多 16 个。

### 分段循环

数据比一轮能处理的多时，用“分段循环”（strip-mining）：每次让硬件决定 `vl`，处理完就把指针和剩余个数往后推。最后一轮元素不够时，`vl` 自动变小，不需要单独写收尾代码。下面的示例都是这个写法。

## Zephyr 里的 RVV 支持

这套支持是在 Zephyr v4.2.2 上实现的，针对 F101。包括：

- <strong>编译</strong>：打开后，编译参数里的 `-march` 带上 `v`（实际是 `rv32imafdcv_zicsr_zifencei_xtheadcmo`），可以用 `<riscv_vector.h>` 里的内建函数，也可以写汇编。
- <strong>使用权限</strong>：`mstatus.VS` 在任何 C 代码运行之前就已经打开（编译器可能把向量指令用在 `memcpy()` 这类函数里），新建的线程也一样。
- <strong>状态保存</strong>：每个中断和异常的栈帧里都保存 `v0`–`v31`、`vstart`、`vl`、`vtype`、`vcsr`，所以线程和中断处理函数<strong>都可以</strong>使用向量单元。被抢占（时间片用完、被更高优先级打断、被中断打断）的线程，向量状态会原样恢复。
- <strong>主动切换</strong>：线程自己调用函数、`k_sleep()`、`k_yield()` 这类主动让出时，按 ABI 办事，向量寄存器是<strong>调用者保存</strong>的，不保证保留。

## 启用

在 `prj.conf` 里加一行：

```text
CONFIG_SUN252I_F101_RVV=y
```

评估板 `f101_evb` 和 `yuzukineko` 都是 F101，这个配置对它们都适用。

### 配置项

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `CONFIG_SUN252I_F101_RVV` | n | 打开向量扩展。会自动选上 `RISCV_ISA_EXT_V`、`RISCV_ISA_EXT_ZICSR` 和 `RISCV_SOC_CONTEXT_SAVE` |
| `CONFIG_SUN252I_F101_VLEN` | 128 | 向量寄存器的位宽。启动时用 `vlenb` 核对（需要 `CONFIG_ASSERT=y`），不一致会断言失败 |
| `CONFIG_RISCV_ISA_EXT_V` | — | 架构层的开关，让编译参数带上 `v`。一般不需要手动设置 |

### 栈大小

每个中断栈帧里要放下全部向量寄存器，大小是 `32 × VLEN / 8 + 32` 字节，`VLEN = 128` 时是 <strong>544 字节</strong>。线程栈要能放下一帧再加上处理函数本身。打开 `CONFIG_SUN252I_F101_RVV` 后，这些栈的默认值会变大：

| 配置项 | 默认值 |
| --- | --- |
| `CONFIG_IDLE_STACK_SIZE` | 1536 |
| `CONFIG_MAIN_STACK_SIZE` | 4096 |
| `CONFIG_ISR_STACK_SIZE` | 4096 |
| `CONFIG_SYSTEM_WORKQUEUE_STACK_SIZE` | 2048 |
| `CONFIG_TEST_EXTRA_STACK_SIZE` | 1024 |

自己创建的线程要自己留够栈。示例里创建的线程栈是 2048 字节。

## 接口

RVV 没有专门的 Zephyr API。向量单元就是 CPU 的一部分，用法有三种：

### 内建函数（推荐）

包含 `<riscv_vector.h>`，用 `__riscv_` 开头的内建函数，编译器会生成对应的向量指令并分配寄存器。示例里用到的有：

| 内建函数 | 作用 |
| --- | --- |
| `__riscv_vsetvl_e32m8(n)` | 对剩余 `n` 个元素配置 `e32, m8`，返回这一轮的 `vl` |
| `__riscv_vsetvlmax_e8m1()` | 取 `e8, m1` 一轮最多处理的元素数，等于 `vlenb` |
| `__riscv_vle32_v_u32m8(p, vl)`、`__riscv_vle32_v_i32m8(p, vl)` | 从内存读 `vl` 个 32 位元素 |
| `__riscv_vse32_v_u32m8(p, v, vl)` | 把向量写回内存 |
| `__riscv_vadd_vv_u32m8(a, b, vl)`、`__riscv_vmul_vv_i32m8(a, b, vl)` | 逐元素加、乘 |
| `__riscv_vredsum_vs_i32m8_i32m1(v, acc, vl)` | 把向量里的元素加起来，结果放进 `acc` 的第 0 个元素 |
| `__riscv_vmv_s_x_i32m1(x, vl)`、`__riscv_vmv_x_s_i32m1_i32(v)` | 标量和向量第 0 个元素之间搬数据 |

名字的规律是：`__riscv_` + 指令名 + 操作数形式 + 元素类型和分组（例如 `u32m8` 是 8 个寄存器一组的无符号 32 位元素）。

:::note
这个工具链（玄铁 900 的 GCC 14.1.1）里，32 位元素的内建函数在 RV32 上的指针参数是 `unsigned long *`（或 `long *`），不是 `uint32_t *`。示例里的做法是先把指针转一下。
:::

### 内联汇编

需要精确控制具体哪个寄存器、或者内建函数没有覆盖的指令时，可以直接写汇编：

```c
__asm__ volatile("vsetvli t0, zero, e32, m1, ta, ma\n\t"
		 "vmv.v.x v8, %0"
		 :: "r"(seed) : "t0", "memory");
```

`vsetvli` 和向量指令要<strong>放在同一个 `asm` 语句里</strong>，避免编译器把 `vtype` 的设置挪走或删掉。

### 宏

`zephyr/arch/riscv/arch.h` 里定义了 `mstatus.VS` 的几个取值，自己操作 `mstatus` 时用：

| 宏 | 含义 |
| --- | --- |
| `MSTATUS_VS` | `VS` 字段的掩码 |
| `MSTATUS_VS_OFF` | 关闭，用向量指令会触发异常 |
| `MSTATUS_VS_INIT` | 已打开，向量状态是初始值 |
| `MSTATUS_VS_CLEAN` | 向量状态没有被改过 |
| `MSTATUS_VS_DIRTY` | 向量状态被改过 |

一般不需要碰它们：`CONFIG_SUN252I_F101_RVV` 已经在启动和创建线程时设好了。

## 使用规则

1. <strong>先 `vsetvli` 再用向量指令</strong>。没用过向量的线程里 `vtype` 的 `vill` 位是置位的，直接用向量指令会失败。内建函数会自动带上 `vsetvli`，内联汇编要自己写。
2. <strong>不要让向量寄存器的值跨过函数调用、`k_sleep()`、`k_yield()`</strong>。它们是调用者保存的。想让值在线程里一直保留，中间不要有调用，也不要主动让出。被动的抢占（中断、时间片）不会丢。
3. <strong>中断处理函数里可以用向量单元</strong>，处理函数返回后，被打断的代码看到的向量寄存器不变。
4. <strong>栈要够</strong>。每层中断多占一帧（VLEN = 128 时 544 字节）。线程栈太小，在中断里会踩坏栈后面的数据。
5. <strong>`CONFIG_SUN252I_F101_VLEN` 要和硬件一致</strong>，它决定了栈帧和存放向量寄存器的数组大小。

## 示例：向量加法和点积

下面是一个完整的 Zephyr 应用。`vec_add_u32()` 做两个数组逐元素相加，`vec_dot_i32()` 做点积。两个函数都是上面说的分段循环。

目录结构：

```text
rvv-demo/
├── CMakeLists.txt
├── prj.conf
└── src/main.c
```

`CMakeLists.txt`：

```cmake
cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(rvv_demo)

target_sources(app PRIVATE src/main.c)
```

`prj.conf`：

```text
CONFIG_SUN252I_F101_RVV=y
```

`src/main.c`：

```c
#include <zephyr/kernel.h>
#include <riscv_vector.h>
#include <stdint.h>

#define N 100

/* c[i] = a[i] + b[i]; the intrinsics of this toolchain take unsigned long (32 bit here) */
static void vec_add_u32(uint32_t *c32, const uint32_t *a32, const uint32_t *b32, size_t n)
{
	unsigned long *c = (unsigned long *)c32;
	const unsigned long *a = (const unsigned long *)a32;
	const unsigned long *b = (const unsigned long *)b32;

	while (n > 0) {
		size_t vl = __riscv_vsetvl_e32m8(n);	/* elements handled in this round */
		vuint32m8_t va = __riscv_vle32_v_u32m8(a, vl);
		vuint32m8_t vb = __riscv_vle32_v_u32m8(b, vl);

		__riscv_vse32_v_u32m8(c, __riscv_vadd_vv_u32m8(va, vb, vl), vl);
		a += vl;
		b += vl;
		c += vl;
		n -= vl;
	}
}

/* sum of a[i] * b[i]; vredsum folds the products of every round into acc[0] */
static int32_t vec_dot_i32(const int32_t *a32, const int32_t *b32, size_t n)
{
	const long *a = (const long *)a32;
	const long *b = (const long *)b32;
	vint32m1_t acc = __riscv_vmv_s_x_i32m1(0, 1);

	while (n > 0) {
		size_t vl = __riscv_vsetvl_e32m8(n);
		vint32m8_t va = __riscv_vle32_v_i32m8(a, vl);
		vint32m8_t vb = __riscv_vle32_v_i32m8(b, vl);

		acc = __riscv_vredsum_vs_i32m8_i32m1(__riscv_vmul_vv_i32m8(va, vb, vl), acc, vl);
		a += vl;
		b += vl;
		n -= vl;
	}
	return __riscv_vmv_x_s_i32m1_i32(acc);
}

int main(void)
{
	static uint32_t a[N], b[N], c[N];
	static int32_t x[N], y[N];
	int32_t dot_ref = 0;
	int add_bad = 0;

	for (int i = 0; i < N; i++) {
		a[i] = i * 3;
		b[i] = 1000 - i;
		x[i] = i - 50;
		y[i] = 2 * i + 1;
		dot_ref += x[i] * y[i];
	}

	vec_add_u32(c, a, b, N);
	for (int i = 0; i < N; i++) {
		if (c[i] != a[i] + b[i]) {
			add_bad++;
		}
	}

	printk("VLENB = %u\n", (unsigned int)__riscv_vsetvlmax_e8m1());
	printk("add: %d wrong elements\n", add_bad);
	printk("dot = %d, expected %d\n", (int)vec_dot_i32(x, y, N), (int)dot_ref);
	return 0;
}
```

编译，参数的含义见 [编译与运行](zephyr-build-run.md)：

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/rvv-demo /path/to/rvv-demo
```

这个应用在 `yuzukineko` 上能编译通过，反汇编里 `vec_add_u32()` 的循环体就是 `vsetvli`、两条 `vle32.v`、`vadd.vv` 和 `vse32.v`：

```text
vsetvli  a5,a3,e32,m8,ta,ma
vle32.v  v8,(a1)
vle32.v  v16,(a2)
vadd.vv  v8,v8,v16
vse32.v  v8,(a0)
```

下载运行的步骤见 [编译与运行](zephyr-build-run.md)。程序正确时，串口应打印 `VLENB = 16`、`add: 0 wrong elements`，并且 `dot` 和 `expected` 两个数相同。

## 示例：向量状态能不能在中断和线程切换后保留

仓库里的 `samples/drivers/rvv` 是一个自检程序，检查前面“Zephyr 里的 RVV 支持”说的几条是否成立：

- 向量加法的结果对不对，`vlenb` 和 `CONFIG_SUN252I_F101_VLEN` 是否一致。
- 一个 300 µs 的定时器中断处理函数<strong>故意改写</strong> `v8` 和向量 CSR，被打断的线程里的 `v8` 要完全不变。
- 三个同优先级的线程（`main` 和两个工作线程）靠时间片轮流运行，各自在 `v8` 里放一个不同的值，循环里不调用任何函数，回来之后值要还在。线程里还同时做浮点运算，和 FPU 共用上下文。

它的 `prj.conf` 是：

```text
CONFIG_SUN252I_F101_RVV=y
CONFIG_FPU=y
CONFIG_FPU_SHARING=y
CONFIG_ASSERT=y
CONFIG_PRINTK=y
CONFIG_TIMESLICING=y
CONFIG_TIMESLICE_SIZE=1
CONFIG_TIMESLICE_PRIORITY=0
```

中断处理函数里用内联汇编改 `v8`：

```c
static void tick_fn(struct k_timer *t)
{
	/* the interrupt handler trashes v8 and the vector CSRs too */
	rvv_set_v8(0xdeadbeef);
	ticks++;
}
```

线程里放值、循环、再检查：

```c
/*
 * Keep a pattern in v8 over a loop without any function call, so only a
 * preemption (interrupt, time slice) can disturb it. Vector registers are
 * caller saved, a call or a voluntary switch (k_sleep, k_yield) may clobber
 * them. Returns seed if v8 survived, else the first wrong element.
 */
__attribute__((optimize("no-tree-vectorize")))
uint32_t rvv_hold_v8(uint32_t seed, uint32_t iters)
{
	uint32_t out[CONFIG_SUN252I_F101_VLEN / 32];

	__asm__ volatile("vsetvli t0, zero, e32, m1, ta, ma\n\t"
			 "vmv.v.x v8, %0"
			 :: "r"(seed) : "t0", "memory");
	for (volatile uint32_t i = 0; i < iters; i++) {
	}
	__asm__ volatile("vsetvli t0, zero, e32, m1, ta, ma\n\t"
			 "vse32.v v8, (%0)"
			 :: "r"(out) : "t0", "memory");
	for (size_t i = 0; i < ARRAY_SIZE(out); i++) {
		if (out[i] != seed) {
			return out[i];
		}
	}
	return seed;
}
```

编译它：

```sh
west build -b yuzukineko -d build/rvv zephyr/samples/drivers/rvv
```

全部检查通过时，最后一行输出是 `RVV: all checks passed`，示例的 `sample.yaml` 就是用这一行判断测试是否通过。示例的 `sample.yaml` 里 `platform_allow` 写的是评估板 `f101_evb`；`yuzukineko` 同样是 F101，示例已在 `yuzukineko` 上编译通过，没有上板运行。

## 常见问题

| 现象 | 可能的原因 |
| --- | --- |
| 编译报找不到 `riscv_vector.h` | 工具链不是玄铁 900 的 GCC，或者没有打开 `CONFIG_SUN252I_F101_RVV`，`-march` 里没有 `v` |
| 一用向量指令就进异常 | 没有先 `vsetvli`；或者在 `mstatus.VS` 为关闭的上下文里执行 |
| 中断一来系统就卡死或数据被破坏 | 线程栈不够放一帧向量寄存器。把线程栈加大，VLEN = 128 时至少要多出 544 字节 |
| 启动时断言失败，提示 `SUN252I_F101_VLEN does not match the vector unit` | `CONFIG_SUN252I_F101_VLEN` 和硬件的 `vlenb × 8` 不一致 |
| 向量寄存器里的值调用函数后变了 | 它们是调用者保存的，函数里的向量代码会改写它们。需要保留就在调用前存到内存 |
