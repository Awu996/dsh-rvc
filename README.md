# RVC变声（dsh-rvc）

DeepSeek Harness（DSH）插件，一个中间工具：输入本机上的一个音频或视频文件，转成标准 WAV，交给容语（RongYu，RVC 变声）变成容语里当前模型的声音，输出新生成的 WAV 文件路径。

插件只生成文件，不收发任何消息。文件从哪里来、生成后交给谁，由调用它的一方决定。

## 工作方式

插件提供一个工具 `rvc_convert`（给大肥鱼用）和一个服务 `rvc`（给其它插件用）：

1. 调用方给出一个本机音频或视频文件的完整路径。
2. 插件把它转成标准 WAV；开着容语变声时，再交给容语变声。
3. 插件返回新生成的 WAV 文件路径。

## 环境要求

- Windows 10/11 x64
- DeepSeek Harness 0.2.1-rc.3 或更新版本
- 容语（RongYu）开着，并且在「设置 → 语音接口」里打开了接口。没接容语时，`rvc_convert` 只转格式，不变声。

## 安装

插件没有发布到 npm 和插件市场，用本机文件夹安装：

1. 把插件文件夹放在一个固定位置，比如 `D:\DSH-plugins\dsh-rvc`。DSH 直接使用这个文件夹，装好后不要移动或删除它。文件夹里要带着 `node_modules`（插件依赖 silk-wasm）；没有的话，在插件文件夹里执行一次 `npm install --omit=dev --registry=https://registry.npmmirror.com`。
2. 在 DSH 的插件页点「添加插件」，在「包名或地址」里填插件文件夹的完整路径，安装。
3. 完全退出 DSH（托盘图标右键退出），再重新打开。设置里会多出「RVC变声」页。

更新插件时，替换文件夹里的文件，再完全退出并重新打开 DSH。

## 设置

在 DSH 设置的「RVC变声」页里：

- **容语变声（RVC）**：在容语「设置 → 语音接口」点「复制」，把连接串粘贴过来，点「保存并测试」。连接串只能指向本机（127.0.0.1）。开关打开时，传进来的音频都会交给容语变声；关掉时只转格式。「重新检查」会重新测试和容语的连接。
- **保留生成的文件**：默认生成的 WAV 过 10 分钟自动删除，可以改成 1 到 1440 分钟。打开开关后会一直保存在你指定的文件夹里（不填就存到插件自己的 `kept` 文件夹），需要自己清理。

变声用的是容语里当前选中的模型和设置。想换声音或者调音调，在容语里改。

## 大肥鱼能用的工具

| 工具 | 参数 | 说明 |
|---|---|---|
| `rvc_convert` | `file`：本机音频或视频文件的完整路径 | 转成标准 WAV，开着容语变声时会变声。只生成文件 |

返回值：成功时是 `{ ok, path, seconds, sampleRate, expiresInMinutes }`，失败时是 `{ ok: false, message }`。

生成的文件会过期删除，调用方要在过期前用完。

## 给其它插件用

RVC变声提供一个名为 `rvc` 的服务：

```js
const rvc = ctx.get('rvc')
const a = await rvc.convert({ path: 'D:\\语音\\a.silk' })
const b = await rvc.toWav({ buffer })
await rvc.release(a.id)
```

- `convert({ path } 或 { buffer }, { rvc })`：`rvc: false` 表示这次不变声，不传就按设置。
- `toWav(input)`：只转格式。
- `status()`：容语的连接状态和排队数。
- `release(idOrPath)`：马上删除生成的临时文件，保留模式下不删。
- `version`：插件版本号。

返回值里有 `id`、`path`、`seconds`、`sampleRate`、`kept`、`expiresAt`、`steps`、`model`。

## 支持的格式

输出的标准 WAV：单声道、16 位 PCM，采样率保持原样，最高 48 kHz。

能读的格式：QQ/微信语音（SILK、AMR）、MP3、M4A/AAC、OGG/Opus、FLAC、WAV（各种位深和采样率）、WMA、AC3、AIFF、CAF、WavPack、TTA，以及 MP4、MKV/WebM、FLV、AVI、WMV、MPEG-TS 视频里的声音，B 站客户端缓存的 m4s 也能直接读。

## 限制

- 一次最多 600 秒音频、200 MB 文件。
- 超过容语单次上限（一般 120 秒）的音频，会在安静处切成小段分别变声，再拼回去。
- 同时最多排队 6 段，再多会提示稍后再试。
- 只处理本机文件。网络地址、`\\` 开头的共享路径一律拒绝。
- 设置页只能在本机打开的 DSH 里使用，局域网或远程访问 DSH 时这些接口会拒绝请求。

## 常见问题

**变声报「连不上容语」**：容语没开、语音接口没开，或者容语换了端口。容语提示端口变化时，重新复制一次连接串。

**生成的声音没变**：「容语变声（RVC）」的开关没打开，或者连接串没保存成功，这时只转格式。在设置页点「重新检查」看连接状态。

## 数据存放

全部在 `%USERPROFILE%\.dsh\dsh-rvc\`（设置了 `DSH_HOME` 时在它下面）：

- `settings.json`：设置，包含容语连接串里的 Key，只存在本机。
- `outputs\`：临时生成的 WAV，到期自动删除。
- `kept\`：保留模式的默认保存位置。
- `work\`：转换时的临时文件，30 分钟后自动删除。

## 第三方组件

- `bin/ffmpeg.exe`：FFmpeg 9.0.2，LGPL 2.1 或更新版本。只开了音频解码，静态链接，没有 GPL 组件。许可证见 `bin/ffmpeg-LICENSE.txt`，编译配置见 `bin/ffmpeg-BUILD.txt`。想自己从官方源码重新编译替换：下载 [ffmpeg-9.0.2.tar.xz](https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz) 解压，在 MSYS2 UCRT64 环境里执行 `SRC=解压目录 bash scripts/build-ffmpeg.sh`，结果会覆盖 `bin/ffmpeg.exe`。
- [silk-wasm](https://github.com/idranme/silk-wasm)：MIT，用来解码 QQ/微信的 SILK 语音。

## 许可

MIT，见 `LICENSE`。
