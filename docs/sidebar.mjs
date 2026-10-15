// Sidebar of the site. It was first generated from the old docsify _sidebar.md and is edited by hand now.
// Top-level groups are open by default, nested groups are collapsed.
//
// A `label` is written in the root locale (English); `translations` carries the other
// languages, keyed by the BCP-47 `lang` from the `locales` config in astro.config.mjs.
// Slugs are locale-relative, so one entry resolves to the page in either language:
// `hardware/pinout` is src/content/docs/hardware/pinout.md (English) and
// src/content/docs/zh/hardware/pinout.md (简体中文).
export const sidebar = [
  {
    "label": "Getting started",
    "translations": { "zh-CN": "入门" },
    "collapsed": false,
    "items": [
      {
        "label": "Overview",
        "translations": { "zh-CN": "项目简介" },
        "slug": "index"
      },
      {
        "label": "Quickstart",
        "translations": { "zh-CN": "上手指南" },
        "slug": "quickstart"
      }
    ]
  },
  {
    "label": "Hardware",
    "translations": { "zh-CN": "硬件" },
    "collapsed": false,
    "items": [
      {
        "label": "Board overview",
        "translations": { "zh-CN": "板卡概览" },
        "slug": "hardware/overview"
      },
      {
        "label": "Pinout",
        "translations": { "zh-CN": "引脚排布" },
        "slug": "hardware/pinout"
      },
      {
        "label": "Pin multiplexing (MUX)",
        "translations": { "zh-CN": "引脚复用 (MUX)" },
        "slug": "hardware/mux"
      },
      {
        "label": "Common peripheral groups",
        "translations": { "zh-CN": "常用外设引脚组合" },
        "slug": "hardware/groups"
      },
      {
        "label": "Errata and revision differences",
        "translations": { "zh-CN": "勘误与版本差异" },
        "slug": "hardware/errata"
      },
      {
        "label": "Hardware downloads",
        "translations": { "zh-CN": "硬件资料下载" },
        "slug": "hardware/download"
      },
      {
        "label": "Hardware files",
        "translations": { "zh-CN": "硬件文件说明" },
        "slug": "hardware/files"
      },
      {
        "label": "YuzukiCube-M base board",
        "translations": { "zh-CN": "YuzukiCube-M 底板" },
        "slug": "baseboard"
      }
    ]
  },
  {
    "label": "Boot and flashing",
    "translations": { "zh-CN": "启动与下载" },
    "collapsed": false,
    "items": [
      {
        "label": "FEL download mode and tools",
        "translations": { "zh-CN": "FEL 下载模式与工具" },
        "slug": "boot/fel"
      },
      {
        "label": "SPI NOR layout and backup",
        "translations": { "zh-CN": "SPI NOR 布局与备份" },
        "slug": "boot/flash-layout"
      }
    ]
  },
  {
    "label": "Quick start",
    "translations": { "zh-CN": "快速开始" },
    "collapsed": false,
    "items": [
      {
        "label": "Prebuilt Linux images",
        "translations": { "zh-CN": "Linux 预编译镜像" },
        "slug": "dev/linux/linux-prebuilt"
      },
      {
        "label": "RustSBI + Asterinas",
        "slug": "dev/asterinas/rustsbi-asterinas"
      }
    ]
  },
  {
    "label": "Zephyr development",
    "translations": { "zh-CN": "Zephyr 开发" },
    "collapsed": false,
    "items": [
      {
        "label": "Introduction",
        "translations": { "zh-CN": "简介" },
        "slug": "dev/zephyr"
      },
      {
        "label": "Setting up the build environment",
        "translations": { "zh-CN": "配置开发环境" },
        "slug": "dev/zephyr/zephyr-setup-env"
      },
      {
        "label": "Getting the Zephyr source",
        "translations": { "zh-CN": "获取 Zephyr 代码" },
        "slug": "dev/zephyr/zephyr-get-source"
      },
      {
        "label": "Building and running",
        "translations": { "zh-CN": "编译与运行" },
        "slug": "dev/zephyr/zephyr-build-run"
      },
      {
        "label": "UF2 drag-and-drop flashing",
        "translations": { "zh-CN": "UF2 拖放烧录" },
        "slug": "dev/zephyr/zephyr-uf2"
      },
      {
        "label": "RISC-V vector extension",
        "translations": { "zh-CN": "RISC-V 向量扩展" },
        "slug": "dev/zephyr/zephyr-riscv-vector"
      },
      {
        "label": "Zephyr applications",
        "translations": { "zh-CN": "Zephyr 应用" },
        "collapsed": true,
        "items": [
          {
            "label": "NekoBox - media and game box",
            "translations": { "zh-CN": "NekoBox - 媒体与游戏盒" },
            "slug": "dev/zephyr/apps/nekobox"
          },
          {
            "label": "Bilibili - video client",
            "translations": { "zh-CN": "Bilibili - 视频客户端" },
            "slug": "dev/zephyr/apps/bilibili"
          },
          {
            "label": "MP4 Player - video player",
            "translations": { "zh-CN": "MP4 Player - 视频播放器" },
            "slug": "dev/zephyr/apps/mp4-player"
          },
          {
            "label": "MicroPython - Python REPL and scripts",
            "translations": { "zh-CN": "MicroPython - Python REPL 与脚本" },
            "slug": "dev/zephyr/apps/micropython"
          },
          {
            "label": "ncnn - neural-network inference",
            "translations": { "zh-CN": "ncnn - 神经网络推理" },
            "slug": "dev/zephyr/apps/ncnn"
          },
          {
            "label": "Doom - the classic shooter",
            "translations": { "zh-CN": "Doom - 毁灭战士游戏" },
            "slug": "dev/zephyr/apps/doom"
          },
          {
            "label": "mGBA - Game Boy Advance emulator",
            "translations": { "zh-CN": "mGBA - GBA 模拟器" },
            "slug": "dev/zephyr/apps/mgba"
          },
          {
            "label": "gpSP - GBA emulator (dynarec)",
            "translations": { "zh-CN": "gpSP - GBA 模拟器（动态重编译）" },
            "slug": "dev/zephyr/apps/gpsp"
          },
          {
            "label": "NES - NES/Famicom emulator",
            "translations": { "zh-CN": "NES - FC 模拟器" },
            "slug": "dev/zephyr/apps/nes"
          },
          {
            "label": "HTML renderer - LiteHTML",
            "translations": { "zh-CN": "HTML 渲染器 - LiteHTML" },
            "slug": "dev/zephyr/apps/html"
          },
          {
            "label": "Android mirroring - scrcpy",
            "translations": { "zh-CN": "安卓投屏 - Scrcpy" },
            "slug": "dev/zephyr/apps/android-mirror"
          },
          {
            "label": "iOS mirroring - AirPlay",
            "translations": { "zh-CN": "iOS 投屏 - AirPlay" },
            "slug": "dev/zephyr/apps/ios-mirror"
          },
          {
            "label": "Windows 95 - Bochs x86 emulation",
            "translations": { "zh-CN": "Win95 - Bochs x86 模拟" },
            "slug": "dev/zephyr/apps/win95"
          },
          {
            "label": "LVGL - graphical interface",
            "translations": { "zh-CN": "LVGL - 图形界面" },
            "slug": "dev/zephyr/apps/lvgl"
          },
          {
            "label": "USB display - PC secondary screen",
            "translations": { "zh-CN": "USB 副屏 - 电脑扩展屏" },
            "slug": "dev/zephyr/apps/usb-display"
          }
        ]
      },
      {
        "label": "Zephyr drivers",
        "translations": { "zh-CN": "Zephyr 驱动" },
        "collapsed": true,
        "items": [
          {
            "label": "GPIO - general-purpose I/O",
            "translations": { "zh-CN": "GPIO - 通用输入输出" },
            "slug": "dev/zephyr/drivers/gpio"
          },
          {
            "label": "I2C - the I²C bus",
            "translations": { "zh-CN": "I2C - I²C 总线" },
            "slug": "dev/zephyr/drivers/i2c"
          },
          {
            "label": "SPI - serial peripheral interface",
            "translations": { "zh-CN": "SPI - 串行外设接口" },
            "slug": "dev/zephyr/drivers/spi"
          },
          {
            "label": "PWM - pulse-width modulation",
            "translations": { "zh-CN": "PWM - 脉宽调制" },
            "slug": "dev/zephyr/drivers/pwm"
          },
          {
            "label": "PWM-BL - analog backlight",
            "translations": { "zh-CN": "PWM-BL - 模拟背光" },
            "slug": "dev/zephyr/drivers/pwm-bl"
          },
          {
            "label": "DISPLAY - display controller",
            "translations": { "zh-CN": "DISPLAY - 显示控制器" },
            "slug": "dev/zephyr/drivers/display"
          },
          {
            "label": "SDHC - SD/MMC host controller",
            "translations": { "zh-CN": "SDHC - 多媒体卡控制器" },
            "slug": "dev/zephyr/drivers/sdhc"
          },
          {
            "label": "AUDIO - audio",
            "translations": { "zh-CN": "AUDIO - 音频" },
            "slug": "dev/zephyr/drivers/audio"
          },
          {
            "label": "UART - serial communication",
            "translations": { "zh-CN": "UART - 串行通信" },
            "slug": "dev/zephyr/drivers/uart"
          },
          {
            "label": "USB - universal serial bus",
            "translations": { "zh-CN": "USB - 通用串行总线" },
            "slug": "dev/zephyr/drivers/usb"
          },
          {
            "label": "G2D - 2D graphics acceleration",
            "translations": { "zh-CN": "G2D - 图形加速" },
            "slug": "dev/zephyr/drivers/g2d"
          },
          {
            "label": "VDEC - video decoding",
            "translations": { "zh-CN": "VDEC - 视频解码" },
            "slug": "dev/zephyr/drivers/vdec"
          }
        ]
      },
      {
        "label": "Zephyr components",
        "translations": { "zh-CN": "Zephyr 组件" },
        "collapsed": true,
        "items": [
          {
            "label": "CherryUSB - USB stack",
            "translations": { "zh-CN": "CherryUSB - USB 协议栈" },
            "slug": "dev/zephyr/components/cherryusb"
          },
          {
            "label": "SD - SD card stack",
            "translations": { "zh-CN": "SD - SD 卡协议栈" },
            "slug": "dev/zephyr/components/sd"
          },
          {
            "label": "AIC8800 WIFI - wireless driver",
            "translations": { "zh-CN": "AIC8800 WIFI - 无线网卡驱动" },
            "slug": "dev/zephyr/components/aic8800-wifi"
          },
          {
            "label": "AIC8800 Bluetooth - Bluetooth driver",
            "translations": { "zh-CN": "AIC8800 蓝牙 - 蓝牙驱动" },
            "slug": "dev/zephyr/components/aic8800-bt"
          },
          {
            "label": "AAC - AAC decoder",
            "translations": { "zh-CN": "AAC - AAC 解码器" },
            "slug": "dev/zephyr/components/aac"
          },
          {
            "label": "MP4 - MP4 demuxing",
            "translations": { "zh-CN": "MP4 - MP4 解封装" },
            "slug": "dev/zephyr/components/mp4"
          }
        ]
      }
    ]
  },
  {
    "label": "Linux development",
    "translations": { "zh-CN": "Linux 开发" },
    "collapsed": false,
    "items": [
      {
        "label": "Introduction",
        "translations": { "zh-CN": "简介" },
        "slug": "dev/linux"
      },
      {
        "label": "Manual build",
        "translations": { "zh-CN": "手动构建" },
        "slug": "dev/linux/linux-manual"
      },
      {
        "label": "Manual build for RV64I",
        "translations": { "zh-CN": "手动构建 RV64I" },
        "slug": "dev/linux/linux-manual-rv64"
      },
      {
        "label": "Linux + Buildroot",
        "slug": "dev/linux/linux-buildroot"
      }
    ]
  },
  {
    "label": "Asterinas development",
    "translations": { "zh-CN": "Asterinas 开发" },
    "collapsed": false,
    "items": [
      {
        "label": "Build from source",
        "translations": { "zh-CN": "从源码构建" },
        "slug": "dev/asterinas/asterinas-build"
      }
    ]
  },
  {
    "label": "Enclosure",
    "translations": { "zh-CN": "外壳" },
    "collapsed": false,
    "items": [
      {
        "label": "3D-printed enclosure",
        "translations": { "zh-CN": "3D 打印外壳" },
        "slug": "shell"
      }
    ]
  },
  {
    "label": "Reference",
    "translations": { "zh-CN": "参考" },
    "collapsed": false,
    "items": [
      {
        "label": "FAQ",
        "translations": { "zh-CN": "常见问题" },
        "slug": "faq"
      },
      {
        "label": "License",
        "translations": { "zh-CN": "许可证" },
        "slug": "license"
      },
      {
        "label": "Contributing",
        "translations": { "zh-CN": "参与贡献" },
        "slug": "contributing"
      }
    ]
  }
];
