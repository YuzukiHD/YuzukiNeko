---
title: "RISC-V vector extension (RVV)"
---

This page introduces the RISC-V vector extension (RVV) and how to use it on YuzukiNeko's Zephyr: which configuration to enable, what interfaces exist, what to watch out for when writing code, and examples that compile as they are.

## What RVV is

RVV is RISC-V's standard vector extension (the "V" extension, version 1.0). It lets a single instruction process a batch of data at once, which suits loops such as audio, image, filter, matrix and memory-copy code that "perform the same operation on many elements". The F101's XuanTie C907 core has this extension, so the chip is `rv32imacfdv`.

Unlike fixed-width SIMD, an RVV program <strong>does not depend on how wide the vector registers are</strong>: the same code runs on implementations of different widths, and the hardware tells the program how many elements to handle each round.

### Registers and CSRs

| Name | Purpose |
| --- | --- |
| `v0`–`v31` | 32 vector registers, each `VLEN` bits. On F101 `VLEN` is 128 bits, i.e. 16 bytes per register |
| `vlenb` | Read-only CSR, equal to `VLEN / 8`. It is 16 on F101 |
| `vl` | Number of elements to handle in the current round |
| `vtype` | Current configuration: element width, register grouping, tail and mask policy |
| `vstart`, `vcsr` | Which element to continue from after an interruption, and the rounding and saturation state of fixed-point arithmetic |

### Configuring the vector unit: `vsetvli`

Before using vector instructions, use `vsetvli` to say "how many elements I want to handle and how wide each is"; it returns the number `vl` actually handled in this round:

```text
vsetvli  vl, 剩余元素数, e32, m8, ta, ma
```

| Parameter | Meaning |
| --- | --- |
| `e8`, `e16`, `e32` | Element width (`SEW`), 8, 16, 32 bits |
| `m1`, `m2`, `m4`, `m8` | Register grouping (`LMUL`): several registers combined and used as one. The larger the grouping, the more elements one instruction handles and the fewer register groups are available |
| `ta`, `ma` | How the tail and masked elements are handled (here it means their values are not of interest) |

One round handles at most `VLEN / SEW × LMUL` elements. On F101 `VLEN = 128`, so `e32, m8` handles at most 32 elements per round and `e8, m1` at most 16.

### Strip-mining loops

When there is more data than one round can handle, use a "strip-mining" loop: let the hardware decide `vl` each time, then advance the pointers and the remaining count after each round. When the last round has too few elements, `vl` shrinks automatically, so no separate tail code is needed. The examples below all follow this pattern.

## RVV support in Zephyr

This support is implemented on Zephyr v4.2.2 and targets the F101. It includes:

- <strong>Compilation</strong>: when enabled, the `-march` in the compiler flags carries `v` (in practice `rv32imafdcv_zicsr_zifencei_xtheadcmo`), and you can use the intrinsics in `<riscv_vector.h>` or write assembly.
- <strong>Permission to use it</strong>: `mstatus.VS` is already enabled before any C code runs (the compiler may use vector instructions inside functions such as `memcpy()`), and newly created threads too.
- <strong>State saving</strong>: every interrupt and exception stack frame saves `v0`–`v31`, `vstart`, `vl`, `vtype` and `vcsr`, so both threads and interrupt handlers <strong>can</strong> use the vector unit. A thread that is preempted (its time slice expires, a higher priority interrupts it, an interrupt interrupts it) has its vector state restored exactly.
- <strong>Voluntary switching</strong>: when a thread voluntarily yields by calling a function, `k_sleep()`, `k_yield()` or the like, the ABI applies and the vector registers are <strong>caller-saved</strong>, so they are not guaranteed to be preserved.

## Enabling it

Add one line to `prj.conf`:

```text
CONFIG_SUN252I_F101_RVV=y
```

The evaluation board `f101_evb` and `yuzukineko` are both F101, and this configuration applies to both.

### Configuration options

| Option | Default | Description |
| --- | --- | --- |
| `CONFIG_SUN252I_F101_RVV` | n | Enables the vector extension. It automatically selects `RISCV_ISA_EXT_V`, `RISCV_ISA_EXT_ZICSR` and `RISCV_SOC_CONTEXT_SAVE` |
| `CONFIG_SUN252I_F101_VLEN` | 128 | The width of the vector registers. It is checked at boot with `vlenb` (requires `CONFIG_ASSERT=y`); a mismatch fails an assertion |
| `CONFIG_RISCV_ISA_EXT_V` | — | The architecture-layer switch that makes the compiler flags carry `v`. It normally does not need to be set manually |

### Stack size

Each interrupt stack frame must hold all the vector registers, a size of `32 × VLEN / 8 + 32` bytes, which is <strong>544 bytes</strong> when `VLEN = 128`. A thread stack must hold one frame plus the handler itself. After enabling `CONFIG_SUN252I_F101_RVV`, the default values of these stacks grow:

| Option | Default |
| --- | --- |
| `CONFIG_IDLE_STACK_SIZE` | 1536 |
| `CONFIG_MAIN_STACK_SIZE` | 4096 |
| `CONFIG_ISR_STACK_SIZE` | 4096 |
| `CONFIG_SYSTEM_WORKQUEUE_STACK_SIZE` | 2048 |
| `CONFIG_TEST_EXTRA_STACK_SIZE` | 1024 |

Threads you create must reserve enough stack yourself. The thread created in the example has a stack of 2048 bytes.

## Interfaces

RVV has no dedicated Zephyr API. The vector unit is simply part of the CPU, and there are three ways to use it:

### Intrinsics (recommended)

Include `<riscv_vector.h>` and use the intrinsics beginning with `__riscv_`; the compiler generates the corresponding vector instructions and allocates registers. The example uses:

| Intrinsic | Purpose |
| --- | --- |
| `__riscv_vsetvl_e32m8(n)` | Configures `e32, m8` for the remaining `n` elements and returns this round's `vl` |
| `__riscv_vsetvlmax_e8m1()` | Returns the maximum number of elements `e8, m1` handles per round, equal to `vlenb` |
| `__riscv_vle32_v_u32m8(p, vl)`, `__riscv_vle32_v_i32m8(p, vl)` | Reads `vl` 32-bit elements from memory |
| `__riscv_vse32_v_u32m8(p, v, vl)` | Writes the vector back to memory |
| `__riscv_vadd_vv_u32m8(a, b, vl)`, `__riscv_vmul_vv_i32m8(a, b, vl)` | Element-wise addition and multiplication |
| `__riscv_vredsum_vs_i32m8_i32m1(v, acc, vl)` | Sums the elements in the vector and puts the result in element 0 of `acc` |
| `__riscv_vmv_s_x_i32m1(x, vl)`, `__riscv_vmv_x_s_i32m1_i32(v)` | Moves data between a scalar and element 0 of the vector |

The naming pattern is: `__riscv_` + instruction name + operand form + element type and grouping (for example, `u32m8` is unsigned 32-bit elements in a group of 8 registers).

:::note
In this toolchain (XuanTie 900's GCC 14.1.1), the pointer arguments of the 32-bit element intrinsics are `unsigned long *` (or `long *`) on RV32, not `uint32_t *`. The example casts the pointers first.
:::

### Inline assembly

When you need precise control over which register is used, or an instruction the intrinsics do not cover, you can write assembly directly:

```c
__asm__ volatile("vsetvli t0, zero, e32, m1, ta, ma\n\t"
		 "vmv.v.x v8, %0"
		 :: "r"(seed) : "t0", "memory");
```

`vsetvli` and the vector instruction must be <strong>in the same `asm` statement</strong>, so the compiler does not move or delete the `vtype` setup.

### Macros

`zephyr/arch/riscv/arch.h` defines several values for `mstatus.VS`, for use when manipulating `mstatus` yourself:

| Macro | Meaning |
| --- | --- |
| `MSTATUS_VS` | Mask for the `VS` field |
| `MSTATUS_VS_OFF` | Off; using vector instructions raises an exception |
| `MSTATUS_VS_INIT` | On; the vector state is at its initial value |
| `MSTATUS_VS_CLEAN` | The vector state has not been modified |
| `MSTATUS_VS_DIRTY` | The vector state has been modified |

They normally do not need to be touched: `CONFIG_SUN252I_F101_RVV` already sets them at boot and when creating threads.

## Rules for use

1. <strong>Use `vsetvli` before vector instructions</strong>. In a thread that has not used vectors, the `vill` bit of `vtype` is set, and using vector instructions directly fails. Intrinsics add `vsetvli` automatically; inline assembly must write it yourself.
2. <strong>Do not let vector register values cross a function call, `k_sleep()` or `k_yield()`</strong>. They are caller-saved. To keep a value alive throughout a thread, have no calls in between and do not voluntarily yield. Passive preemption (interrupts, time slices) does not lose it.
3. <strong>Interrupt handlers can use the vector unit</strong>; after the handler returns, the vector registers the interrupted code sees are unchanged.
4. <strong>The stack must be large enough</strong>. Each level of interrupt occupies one more frame (544 bytes when VLEN = 128). If a thread stack is too small, an interrupt corrupts the data after the stack.
5. <strong>`CONFIG_SUN252I_F101_VLEN` must match the hardware</strong>; it determines the size of the stack frame and of the array that holds the vector registers.

## Example: vector addition and dot product

Below is a complete Zephyr application. `vec_add_u32()` adds two arrays element by element, and `vec_dot_i32()` computes a dot product. Both functions use the strip-mining loop described above.

Directory structure:

```text
rvv-demo/
├── CMakeLists.txt
├── prj.conf
└── src/main.c
```

`CMakeLists.txt`:

```cmake
cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(rvv_demo)

target_sources(app PRIVATE src/main.c)
```

`prj.conf`:

```text
CONFIG_SUN252I_F101_RVV=y
```

`src/main.c`:

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

Build it; the meaning of the arguments is in [Build and run](zephyr-build-run.md):

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/rvv-demo /path/to/rvv-demo
```

This application compiles for `yuzukineko`, and in the disassembly the loop body of `vec_add_u32()` is `vsetvli`, two `vle32.v`, `vadd.vv` and `vse32.v`:

```text
vsetvli  a5,a3,e32,m8,ta,ma
vle32.v  v8,(a1)
vle32.v  v16,(a2)
vadd.vv  v8,v8,v16
vse32.v  v8,(a0)
```

For the steps to download and run it, see [Build and run](zephyr-build-run.md). When the program is correct, the serial port should print `VLENB = 16` and `add: 0 wrong elements`, and the two numbers `dot` and `expected` are the same.

## Example: whether vector state survives interrupts and thread switches

`samples/drivers/rvv` in the repository is a self-check program that verifies whether the points made earlier under "RVV support in Zephyr" hold:

- Whether the result of vector addition is correct, and whether `vlenb` and `CONFIG_SUN252I_F101_VLEN` agree.
- A 300 µs timer interrupt handler <strong>deliberately overwrites</strong> `v8` and the vector CSRs; `v8` in the interrupted thread must be completely unchanged.
- Three threads of equal priority (`main` and two worker threads) take turns by time slice, each putting a different value in `v8`; with no function call in the loop, the value must still be there when they come back. The threads also perform floating-point arithmetic at the same time, sharing context with the FPU.

Its `prj.conf` is:

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

The interrupt handler overwrites `v8` with inline assembly:

```c
static void tick_fn(struct k_timer *t)
{
	/* the interrupt handler trashes v8 and the vector CSRs too */
	rvv_set_v8(0xdeadbeef);
	ticks++;
}
```

A thread places the value, loops, then checks:

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

Build it:

```sh
west build -b yuzukineko -d build/rvv zephyr/samples/drivers/rvv
```

When all checks pass, the last output line is `RVV: all checks passed`, and the example's `sample.yaml` uses that line to decide whether the test passed. The example's `sample.yaml` lists the evaluation board `f101_evb` in `platform_allow`; `yuzukineko` is also an F101, and the example has been compiled for `yuzukineko`, but it has not been run on the board.

## Common problems

| Symptom | Possible cause |
| --- | --- |
| The build reports that `riscv_vector.h` cannot be found | The toolchain is not XuanTie 900's GCC, or `CONFIG_SUN252I_F101_RVV` is not enabled so `-march` has no `v` |
| Using a vector instruction immediately raises an exception | `vsetvli` was not executed first, or it runs in a context where `mstatus.VS` is off |
| The system hangs or data is corrupted as soon as an interrupt arrives | The thread stack is too small to hold one frame of vector registers. Increase the thread stack by at least 544 bytes when VLEN = 128 |
| An assertion fails at boot, reporting `SUN252I_F101_VLEN does not match the vector unit` | `CONFIG_SUN252I_F101_VLEN` disagrees with the hardware's `vlenb × 8` |
| The values in the vector registers change after calling a function | They are caller-saved, and vector code inside the function overwrites them. If they must be kept, store them to memory before the call |
