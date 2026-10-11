# 制作 .uf2

## 制作 `.uf2`

用 `tools/mkuf2.py` 从镜像生成：

```sh
tools/mkuf2.py app build/gba/zephyr/zephyr.bin -o gba.uf2        # 应用，Flash 0x200000
tools/mkuf2.py system build/uf2/zephyr/zephyr.bin -o dl.uf2      # 下载器自身，Flash 0x30000
tools/mkuf2.py loader boot.img -o loader.uf2                     # 加载器，Flash 0
```

| 类型 | UF2 family | 可写范围 |
| --- | --- | --- |
| `app` | `0x31303146` | 仅应用区（偏移 ≥ `0x200000`） |
| `system`、`loader` | `0x31303147` | 任意位置 |

!> `system` 和 `loader` 文件可以写入任何位置，写坏了会让板子没有加载器，那时只有 <strong>FEL</strong> 能救。只拖放你信任的文件。
