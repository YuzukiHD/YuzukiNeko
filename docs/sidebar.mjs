// Sidebar of the site. It was first generated from the old docsify _sidebar.md and is edited by hand now.
// Top-level groups are open by default, nested groups are collapsed.
export const sidebar = [
  {
    "label": "入门",
    "collapsed": false,
    "items": [
      {
        "label": "项目简介",
        "slug": "index"
      },
      {
        "label": "上手指南",
        "slug": "quickstart"
      }
    ]
  },
  {
    "label": "硬件",
    "collapsed": false,
    "items": [
      {
        "label": "板卡概览",
        "slug": "hardware/overview"
      },
      {
        "label": "引脚排布",
        "slug": "hardware/pinout"
      },
      {
        "label": "引脚复用 (MUX)",
        "slug": "hardware/mux"
      },
      {
        "label": "常用外设引脚组合",
        "slug": "hardware/groups"
      },
      {
        "label": "勘误与版本差异",
        "slug": "hardware/errata"
      },
      {
        "label": "硬件文件说明",
        "slug": "hardware/files"
      },
      {
        "label": "YuzukiCube-M 底板",
        "slug": "baseboard"
      }
    ]
  },
  {
    "label": "启动与下载",
    "collapsed": false,
    "items": [
      {
        "label": "FEL 下载模式与工具",
        "slug": "boot/fel"
      },
      {
        "label": "SPI NOR 布局与备份",
        "slug": "boot/flash-layout"
      }
    ]
  },
  {
    "label": "快速开始",
    "collapsed": false,
    "items": [
      {
        "label": "Linux 预编译镜像",
        "slug": "dev/linux/linux-prebuilt"
      },
      {
        "label": "RustSBI + Asterinas",
        "slug": "dev/asterinas/rustsbi-asterinas"
      }
    ]
  },
  {
    "label": "Zephyr 开发",
    "collapsed": false,
    "items": [
      {
        "label": "简介",
        "slug": "dev/zephyr"
      },
      {
        "label": "配置开发环境",
        "slug": "dev/zephyr/zephyr-setup-env"
      },
      {
        "label": "获取 Zephyr 代码",
        "slug": "dev/zephyr/zephyr-get-source"
      },
      {
        "label": "编译与运行",
        "slug": "dev/zephyr/zephyr-build-run"
      },
      {
        "label": "UF2 拖放烧录",
        "slug": "dev/zephyr/zephyr-uf2"
      },
      {
        "label": "RISC-V 向量扩展",
        "slug": "dev/zephyr/zephyr-riscv-vector"
      },
      {
        "label": "Zephyr 应用",
        "collapsed": true,
        "items": [
          {
            "label": "MP4 播放器",
            "slug": "dev/zephyr/apps/mp4-player"
          }
        ]
      },
      {
        "label": "Zephyr 驱动",
        "collapsed": true,
        "items": [
          {
            "label": "GPIO - 通用输入输出",
            "slug": "dev/zephyr/drivers/gpio"
          },
          {
            "label": "I2C - I²C 总线",
            "slug": "dev/zephyr/drivers/i2c"
          },
          {
            "label": "SPI - 串行外设接口",
            "slug": "dev/zephyr/drivers/spi"
          },
          {
            "label": "PWM - 脉宽调制",
            "slug": "dev/zephyr/drivers/pwm"
          },
          {
            "label": "PWM-BL - 模拟背光",
            "slug": "dev/zephyr/drivers/pwm-bl"
          },
          {
            "label": "DISPLAY - 显示控制器",
            "slug": "dev/zephyr/drivers/display"
          },
          {
            "label": "SDHC - 多媒体卡控制器",
            "slug": "dev/zephyr/drivers/sdhc"
          },
          {
            "label": "AUDIO - 音频",
            "slug": "dev/zephyr/drivers/audio"
          },
          {
            "label": "UART - 串行通信",
            "slug": "dev/zephyr/drivers/uart"
          },
          {
            "label": "USB - 通用串行总线",
            "slug": "dev/zephyr/drivers/usb"
          },
          {
            "label": "G2D - 图形加速",
            "slug": "dev/zephyr/drivers/g2d"
          },
          {
            "label": "VDEC - 视频解码",
            "slug": "dev/zephyr/drivers/vdec"
          }
        ]
      },
      {
        "label": "Zephyr 组件",
        "collapsed": true,
        "items": [
          {
            "label": "CherryUSB - USB 协议栈",
            "slug": "dev/zephyr/components/cherryusb"
          },
          {
            "label": "SD - SD 卡协议栈",
            "slug": "dev/zephyr/components/sd"
          },
          {
            "label": "AIC8800 WIFI - 无线网卡驱动",
            "slug": "dev/zephyr/components/aic8800-wifi"
          },
          {
            "label": "AIC8800 蓝牙 - 蓝牙驱动",
            "slug": "dev/zephyr/components/aic8800-bt"
          },
          {
            "label": "AAC - AAC 解码器",
            "slug": "dev/zephyr/components/aac"
          },
          {
            "label": "MP4 - MP4 解封装",
            "slug": "dev/zephyr/components/mp4"
          }
        ]
      }
    ]
  },
  {
    "label": "Linux 开发",
    "collapsed": false,
    "items": [
      {
        "label": "简介",
        "slug": "dev/linux"
      },
      {
        "label": "手动构建",
        "slug": "dev/linux/linux-manual"
      },
      {
        "label": "手动构建 RV64I",
        "slug": "dev/linux/linux-manual-rv64"
      },
      {
        "label": "Linux + Buildroot",
        "slug": "dev/linux/linux-buildroot"
      }
    ]
  },
  {
    "label": "外壳",
    "collapsed": false,
    "items": [
      {
        "label": "3D 打印外壳",
        "slug": "shell"
      }
    ]
  },
  {
    "label": "参考",
    "collapsed": false,
    "items": [
      {
        "label": "常见问题",
        "slug": "faq"
      },
      {
        "label": "许可证",
        "slug": "license"
      },
      {
        "label": "参与贡献",
        "slug": "contributing"
      }
    ]
  }
];
