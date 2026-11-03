# RVC变声（dsh-rvc）

DeepSeek Harness（DSH）插件。让大肥鱼把你的声音用容语（RongYu，RVC 变声）变声后，发给你想发给的人。

插件有两部分，在 DSH 设置的「RVC变声」页里用标签页切换：

- **RVC变声**：把常见格式的音频或视频转成标准 WAV，再交给容语，变成容语里当前模型的声音。
- **QQ语音桥**：通过本机的 NapCat 取回你在 QQ 里发的语音，再把变声后的音频作为语音条发出去。这是一个临时的桥接工具，等 QQ 聊天插件开放音频接口后会去掉。

## 怎么用

给大肥鱼的 QQ 直接发一条语音。它会问你发给谁，你直接告诉它就行，比如「发给张三」「发到测试群」「发给我自己」。

大肥鱼会依次调用三个工具：

1. `qqvoice_get`：取回你在这个聊天里发的那条语音。
2. `rvc_convert`：交给容语变声。
3. `qqvoice_send`：把变声后的语音发给你说的人或群。

需要注意：

- 回答「发给谁」时打字、发语音都可以。用语音回答时，最新一条语音就是这个回答，大肥鱼会跳过它，取前一条要变声的语音。
- 名字对上好几个，或者只对上一部分时不会直接发，大肥鱼会列出候选，问你发给哪一个。
- 默认只有在你和机器人的私聊里才能指定发给谁，见下面的「只有在你和机器人的私聊里才能指定发给谁」。

## 环境要求

- Windows 10/11 x64
- DeepSeek Harness 0.2.1-rc.3 或更新版本
- 容语（RongYu）开着，并且在「设置 → 语音接口」里打开了接口。没接容语时，`rvc_convert` 只转格式，不变声。
- 用 QQ语音桥还需要：
  - NapCat 和 DSH 在同一台电脑上，并且在 NapCat 的「网络配置」里开了 WebSocket 服务器（正向 WS）；
  - 装了 QQ 聊天插件 dsh-qq-onebot。QQ语音桥靠它的会话记录（`%USERPROFILE%\.dsh\dsh-qq\session-state.json`）认出当前是哪个 QQ 聊天。

## 安装

插件没有发布到 npm 和插件市场，用本机文件夹安装：

1. 把插件文件夹放在一个固定位置，比如 `D:\DSH-plugins\dsh-rvc`。DSH 直接使用这个文件夹，装好后不要移动或删除它。文件夹里要带着 `node_modules`（插件依赖 silk-wasm 和 ws）；没有的话，在插件文件夹里执行一次 `npm install --omit=dev --registry=https://registry.npmmirror.com`。
2. 在 DSH 的插件页点「添加插件」，在「包名或地址」里填插件文件夹的完整路径，安装。
3. 完全退出 DSH（托盘图标右键退出），再重新打开。设置里会多出「RVC变声」页。

更新插件时，替换文件夹里的文件，再完全退出并重新打开 DSH。

## 设置

### RVC变声 页

- **容语变声（RVC）**：在容语「设置 → 语音接口」点「复制」，把连接串粘贴过来，点「保存并测试」。连接串只能指向本机（127.0.0.1）。开关打开时，传进来的音频都会交给容语变声；关掉时只转格式。「重新检查」会重新测试和容语的连接。
- **保留生成的文件**：默认生成的 WAV 过 10 分钟自动删除，可以改成 1 到 1440 分钟。打开开关后会一直保存在你指定的文件夹里（不填就存到插件自己的 `kept` 文件夹），需要自己清理。

变声用的是容语里当前选中的模型和设置。想换声音或者调音调，在容语里改。

### QQ语音桥 页

- **连接 NapCat**：地址默认 `ws://127.0.0.1:3001`，只能填本机地址；access token 和 NapCat 里 WebSocket 服务器的 Token 一致，NapCat 没设就留空。
- **主人**：你自己的 QQ 号。`qqvoice_get` 只会取这个号发的语音。没填主人时，`qqvoice_get` 和 `qqvoice_send` 都不会出现。
- **保存并测试**：保存后连一次 NapCat，显示机器人的 QQ 号和主人的昵称，并检查主人在不在机器人的好友列表里。
- **从 dsh-qq 读取**：只在点的时候读一次 dsh-qq-onebot 的设置文件，填入地址、token 和主人 QQ。dsh-qq-onebot 里设了多个主人时用第一个。

#### 只有在你和机器人的私聊里才能指定发给谁

默认打开，切换后马上生效。

打开时：

- 在你和机器人的私聊里，可以让大肥鱼把语音发给机器人的任何好友或群。
- 在群聊和别人跟机器人的私聊里，只能发回当前聊天。
- 在 DSH 窗口和其它不是 QQ 的对话里，不能指定发给谁。
- 发给你自己不受限制：`to` 填「主人」「我」「自己」或者你的 QQ 号时，都发到你和机器人的私聊。
- 被拦下时不会返回候选名单，别人没法借这个工具打听机器人有哪些好友和群。

关掉后，在哪里都能指定发给谁，别人在群里或者私聊里也能让机器人把语音发到它的好友和群里。

## 大肥鱼能用的工具

| 工具 | 参数 | 说明 |
|---|---|---|
| `rvc_convert` | `file`：本机音频或视频文件的完整路径 | 转成标准 WAV，开着容语变声时会变声。一直可用 |
| `qqvoice_get` | `skip`：跳过主人最新的几条语音，0 到 5，可以不填 | 在当前 QQ 聊天最近 30 条消息里，取主人发的语音，存成 WAV。不填 `skip` 取最新一条；主人用语音回答了「发给谁」时填 1，取前一条。填了主人 QQ 才会出现 |
| `qqvoice_send` | `file`：音频文件的完整路径；`to`：发给谁，可以不填 | 作为语音条发出去。不填 `to` 发回当前聊天；`to` 可以填 QQ 号、群号、好友备注或昵称、群名，或者「主人」。填了主人 QQ 才会出现 |

返回值：

- `rvc_convert`：`{ ok, path, seconds, sampleRate, expiresInMinutes }`
- `qqvoice_get`：`{ ok, path, seconds, sentSecondsAgo, skipped, chat, expiresInMinutes }`
- `qqvoice_send`：`{ ok, chat }`。没发出去时是 `{ ok: false, message }`，名字对上多个时还带 `candidates`（最多 10 个）。

生成和取回的文件都会过期删除，要在过期前用完。

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

QQ语音桥不提供服务，只提供上面的两个工具。

## 支持的格式

输出的标准 WAV：单声道、16 位 PCM，采样率保持原样，最高 48 kHz。

能读的格式：QQ/微信语音（SILK、AMR）、MP3、M4A/AAC、OGG/Opus、FLAC、WAV（各种位深和采样率）、WMA、AC3、AIFF、CAF、WavPack、TTA，以及 MP4、MKV/WebM、FLV、AVI、WMV、MPEG-TS 视频里的声音，B 站客户端缓存的 m4s 也能直接读。

## 限制

- 一次最多 600 秒音频、200 MB 文件。
- 超过容语单次上限（一般 120 秒）的音频，会在安静处切成小段分别变声，再拼回去。
- 同时最多排队 6 段，再多会提示稍后再试。
- 只处理本机文件。网络地址、`\\` 开头的共享路径一律拒绝。
- `qqvoice_send` 只发 20 MB 以内的 wav、mp3、silk、amr、ogg、opus、m4a、aac、flac 文件；往同一个人或群，一分钟最多发 6 条。
- `qqvoice_get` 只看当前聊天最近 30 条消息，最多往前跳过 5 条主人的语音；取回的语音 30 分钟后自动删除。
- NapCat 只能连本机（127.0.0.1 或 localhost），因为发语音时 NapCat 直接读本机文件。
- 设置页只能在本机打开的 DSH 里使用，局域网或远程访问 DSH 时这些接口会拒绝请求。

## 安全提醒

- `qqvoice_send` 能把本机上任何一个符合上面格式的音频文件发出去，发什么由大肥鱼判断。dsh-qq-onebot 的私聊设成「全都接」（`privateMode: open`）时，陌生人也能私聊机器人，让它把本机的音频文件发回给他。不需要陌生人私聊的话，把 dsh-qq-onebot 的私聊改成「只接名单里的」。
- 「只有在你和机器人的私聊里才能指定发给谁」只管发给别人，发回当前聊天不受它限制。

## 常见问题

**大肥鱼说「确认不了当前是哪个 QQ 聊天」**：QQ语音桥靠 dsh-qq-onebot 的会话记录认出聊天。DSH 窗口里的对话、子代理，以及其它渠道（比如 QQ 官方机器人桥接）的会话都认不出来。这时取不了语音，不填 `to` 也发不了。

**取到的不是想要的那条语音**：`qqvoice_get` 默认取你在当前聊天里最近发的一条语音，你用语音回答「发给谁」时，它会跳过这条回答取前一条。还是取错了，直接告诉大肥鱼要的是前面第几条语音。

**测试提示主人不在机器人的好友列表里**：私聊里取不到你的语音，也发不了私聊语音给你。先在 QQ 里加机器人为好友。

**变声报「连不上容语」**：容语没开、语音接口没开，或者容语换了端口。容语提示端口变化时，重新复制一次连接串。

**群里让它发给别人，它说没有发送**：开着「只有在你和机器人的私聊里才能指定发给谁」。到你和机器人的私聊里再说一次，或者在 QQ语音桥 页关掉这个开关。

## 数据存放

全部在 `%USERPROFILE%\.dsh\dsh-rvc\`（设置了 `DSH_HOME` 时在它下面）：

- `settings.json`：RVC变声的设置，包含容语连接串里的 Key，只存在本机。
- `outputs\`：临时生成的 WAV，到期自动删除。
- `kept\`：保留模式的默认保存位置。
- `work\`：转换时的临时文件，30 分钟后自动删除。
- `qq-voice\settings.json`：QQ语音桥的设置，包含 NapCat 的 token，只存在本机。
- `qq-voice\voices\`：取回的 QQ 语音，30 分钟后自动删除。

## 第三方组件

- `bin/ffmpeg.exe`：FFmpeg 9.0.2，LGPL 2.1 或更新版本。只开了音频解码，静态链接，没有 GPL 组件。许可证见 `bin/ffmpeg-LICENSE.txt`，编译配置见 `bin/ffmpeg-BUILD.txt`。想自己从官方源码重新编译替换：下载 [ffmpeg-9.0.2.tar.xz](https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz) 解压，在 MSYS2 UCRT64 环境里执行 `SRC=解压目录 bash scripts/build-ffmpeg.sh`，结果会覆盖 `bin/ffmpeg.exe`。
- [silk-wasm](https://github.com/idranme/silk-wasm)：MIT，用来解码 QQ/微信的 SILK 语音。
- [ws](https://github.com/websockets/ws)：MIT，用来连 NapCat 的 WebSocket 服务器。

## 许可

MIT，见 `LICENSE`。
