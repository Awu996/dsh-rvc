window.__ModuleLoader__.load({
  id: 'dsh-rvc',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const h = React.createElement
    const useState = React.useState
    const useEffect = React.useEffect
    const useRef = React.useRef
    const inject = ['slots']
    const API = '/dsh-rvc/api'
    const QQ_API = '/dsh-rvc/qq/api'

    async function call(path, opts) {
      const o = opts || {}
      const init = { method: o.body !== undefined ? 'POST' : 'GET', headers: { 'x-dsh-rvc': '1' }, cache: 'no-store' }
      if (o.body !== undefined) {
        init.headers['content-type'] = 'application/json'
        init.body = JSON.stringify(o.body)
      }
      let res
      try {
        res = await fetch(API + path, init)
      } catch (e) {
        return { ok: false, message: '连不上 RVC变声 的插件接口，请关掉设置再打开试试' }
      }
      let data = null
      try {
        data = await res.json()
      } catch (e) {}
      if (!data) return { ok: false, message: '插件接口返回了 ' + res.status + '，可能是插件没加载成功' }
      return data
    }

    async function callQq(path, body) {
      const init = { method: body === undefined ? 'GET' : 'POST', headers: { 'x-qqvoice': '1' }, cache: 'no-store' }
      if (body !== undefined) {
        init.headers['content-type'] = 'application/json'
        init.body = JSON.stringify(body)
      }
      let res
      try {
        res = await fetch(QQ_API + path, init)
      } catch (e) {
        return { ok: false, message: '连不上 QQ语音桥 的插件接口，请关掉设置再打开试试' }
      }
      let data = null
      try {
        data = await res.json()
      } catch (e) {}
      if (!data) return { ok: false, message: '插件接口返回了 ' + res.status + '，可能是插件没加载成功' }
      return data
    }

    const PRIMARY = 'var(--dsw-alias-state-business-primary, #4d6bfe)'
    const BORDER = '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3))'
    const S = {
      wrap: { padding: '12px 14px 24px', fontSize: 13, lineHeight: 1.7, background: 'var(--dsw-alias-bg-layer-1, transparent)', border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.15))', borderRadius: 12 },
      h1: { fontSize: 15, fontWeight: 600, margin: '2px 0 4px' },
      tabs: { display: 'flex', gap: 20, borderBottom: BORDER, margin: '6px 0 12px' },
      tab: { borderWidth: '0 0 2px', borderStyle: 'solid', borderColor: 'transparent', marginBottom: -1, padding: '6px 2px', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 13, fontWeight: 400, opacity: 0.7 },
      tabOn: { borderWidth: '0 0 2px', borderStyle: 'solid', borderColor: PRIMARY, marginBottom: -1, padding: '6px 2px', background: 'transparent', color: PRIMARY, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: 1 },
      card: { border: BORDER, borderRadius: 8, padding: '10px 12px', marginBottom: 10 },
      head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 },
      title: { fontWeight: 600, fontSize: 13.5 },
      dim: { opacity: 0.65, fontSize: 12, whiteSpace: 'pre-wrap' },
      hint: { opacity: 0.65, fontSize: 12, margin: '2px 0 6px' },
      row: { display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0', flexWrap: 'wrap' },
      lab: { minWidth: 96, fontSize: 12.5, opacity: 0.85 },
      input: { border: BORDER, borderRadius: 6, padding: '4px 8px', background: 'transparent', color: 'inherit', fontSize: 12.5, flex: '1 1 240px', minWidth: 180, boxSizing: 'border-box' },
      small: { border: BORDER, borderRadius: 6, padding: '4px 8px', background: 'transparent', color: 'inherit', fontSize: 12.5, width: 90, boxSizing: 'border-box' },
      btn: { border: BORDER, borderRadius: 6, padding: '4px 12px', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 12.5 },
      btnOn: { border: '1px solid ' + PRIMARY, borderRadius: 6, padding: '4px 12px', background: PRIMARY, color: '#fff', cursor: 'pointer', fontSize: 12.5 },
      ok: { color: '#1e9e5a', fontSize: 12.5, margin: '4px 0', whiteSpace: 'pre-wrap' },
      err: { color: '#d14343', fontSize: 12.5, margin: '4px 0', whiteSpace: 'pre-wrap' },
      warn: { color: '#c47f00', fontSize: 12.5, margin: '4px 0', whiteSpace: 'pre-wrap' },
    }

    function Switch(props) {
      const on = Boolean(props.on)
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': on,
          disabled: props.disabled,
          onClick: () => props.onChange(!on),
          style: { width: 38, height: 22, borderRadius: 11, border: 'none', padding: 2, cursor: props.disabled ? 'default' : 'pointer', background: on ? PRIMARY : 'rgba(127,127,127,.35)', opacity: props.disabled ? 0.6 : 1, flex: '0 0 auto' },
        },
        h('span', { style: { display: 'block', width: 18, height: 18, borderRadius: 9, background: '#fff', transform: on ? 'translateX(16px)' : 'translateX(0)', transition: 'transform .15s' } }),
      )
    }

    function Note(props) {
      const m = props.msg
      if (!m || !m.text) return null
      const style = m.kind === 'err' ? S.err : m.kind === 'warn' ? S.warn : m.kind === 'dim' ? S.dim : S.ok
      return h('div', { style: style }, m.text)
    }

    function StatusLine(props) {
      const s = props.s
      if (props.loading) return h('div', { style: S.dim }, '正在检查连接…')
      if (!s) return null
      return h('div', { style: s.ready ? S.ok : S.warn }, s.message)
    }

    function RvcCard(props) {
      const v = props.st.settings.rvc
      const [conn, setConn] = useState('')
      const [busy, setBusy] = useState(false)
      const [msg, setMsg] = useState(null)
      const save = async (patch) => {
        setBusy(true)
        setMsg(null)
        const r = await call('/settings', { body: { rvc: patch } })
        setBusy(false)
        if (!r.ok) return setMsg({ kind: 'err', text: r.message })
        if (patch.connection !== undefined) setConn('')
        props.onSaved(r)
      }
      return h(
        'div',
        { style: S.card },
        h('div', { style: S.head }, h('span', { style: S.title }, '容语变声（RVC）'), h(Switch, { on: v.enabled, disabled: busy, onChange: (on) => save({ enabled: on }) })),
        h('div', { style: S.hint }, '打开后，传进来的音频都会再交给容语，变成容语里当前模型的声音。需要容语开着，并且打开了「语音接口」。'),
        v.configured ? h('div', { style: S.dim }, '已保存的连接：127.0.0.1:' + v.port + '，Key ' + v.keyMasked) : null,
        h(
          'div',
          { style: S.row },
          h('input', { style: S.input, value: conn, placeholder: '在容语「设置 → 语音接口」点「复制」，粘贴到这里', onChange: (e) => setConn(e.target.value) }),
          h('button', { style: S.btnOn, disabled: busy || !conn.trim(), onClick: () => save({ connection: conn, enabled: true }) }, '保存并测试'),
          v.configured ? h('button', { style: S.btn, disabled: busy, onClick: () => save({ connection: '', enabled: false }) }, '清除') : null,
        ),
        h(
          'div',
          { style: S.head },
          h(StatusLine, { s: props.status && props.status.rvc, loading: props.checking }),
          h('button', { style: S.btn, disabled: props.checking, onClick: props.onCheck }, '重新检查'),
        ),
        h(Note, { msg: msg }),
      )
    }

    function OutputCard(props) {
      const v = props.st.settings.output
      const [dir, setDir] = useState(v.dir)
      const [ttl, setTtl] = useState(String(v.ttlMinutes))
      const [busy, setBusy] = useState(false)
      const [msg, setMsg] = useState(null)
      useEffect(() => setDir(v.dir), [v.dir])
      useEffect(() => setTtl(String(v.ttlMinutes)), [v.ttlMinutes])
      const save = async (patch, note) => {
        setBusy(true)
        setMsg(null)
        const r = await call('/settings', { body: { output: patch } })
        setBusy(false)
        if (!r.ok) return setMsg({ kind: 'err', text: r.message })
        if (note) setMsg({ kind: 'ok', text: note })
        props.onSaved(r, true)
      }
      return h(
        'div',
        { style: S.card },
        h('div', { style: S.head }, h('span', { style: S.title }, '保留生成的文件'), h(Switch, { on: v.keep, disabled: busy, onChange: (on) => save({ keep: on }) })),
        h('div', { style: S.hint }, v.keep ? '生成的 WAV 会一直留在下面的文件夹里，需要你自己清理。' : '默认发完就删：生成的 WAV 过一段时间自动删除。打开开关就会一直保留。'),
        v.keep
          ? h(
              'div',
              { style: S.row },
              h('span', { style: S.lab }, '保存到'),
              h('input', { style: S.input, value: dir, placeholder: '不填就存到插件自己的 kept 文件夹', onChange: (e) => setDir(e.target.value) }),
              h('button', { style: S.btn, disabled: busy || dir === v.dir, onClick: () => save({ dir: dir }, '已保存') }, '保存'),
            )
          : h(
              'div',
              { style: S.row },
              h('span', { style: S.lab }, '多久后删除'),
              h('input', { style: S.small, type: 'number', min: 1, max: 1440, value: ttl, onChange: (e) => setTtl(e.target.value) }),
              h('span', { style: S.dim }, '分钟（1 到 1440）'),
              h('button', { style: S.btn, disabled: busy || ttl === String(v.ttlMinutes), onClick: () => save({ ttlMinutes: Number(ttl) }, '已保存') }, '保存'),
            ),
        h(Note, { msg: msg }),
      )
    }

    function RvcPanel(props) {
      const [st, setSt] = useState(null)
      const [status, setStatus] = useState(null)
      const [checking, setChecking] = useState(false)
      const [err, setErr] = useState('')
      const seq = useRef(0)
      const check = async () => {
        const id = ++seq.current
        setChecking(true)
        const r = await call('/status')
        if (id !== seq.current) return
        setChecking(false)
        if (r.ok) setStatus(r.status)
      }
      const load = async () => {
        const r = await call('/state')
        if (!r.ok) return setErr(r.message)
        setErr('')
        setSt(r)
        if (props.onVersion) props.onVersion(r.version)
        check()
      }
      useEffect(() => {
        load()
      }, [])
      const onSaved = (r, quiet) => {
        if (r && r.settings) setSt(r)
        if (!quiet) check()
      }
      if (err) return h('div', { style: S.err }, err)
      if (!st) return h('div', { style: S.dim }, '正在读取设置…')
      return h(
        'div',
        null,
        h('div', { style: S.hint }, '让大肥鱼将你的声音用RVC变声后发给你想发给的人。'),
        st.ffmpeg ? null : h('div', { style: S.err }, '插件自带的 ffmpeg 不见了，除了 WAV 和 SILK 以外的格式都转不了。请重新安装插件。'),
        h('div', { style: S.card }, h('div', { style: S.title }, '使用说明'), h('div', null, '给你的大肥鱼QQ直接发语音，它会问你发给谁，你直接告诉他发给谁就行了。')),
        h(RvcCard, { st: st, status: status, checking: checking, onSaved: onSaved, onCheck: check }),
        h(OutputCard, { st: st, onSaved: onSaved }),
      )
    }

    function testText(t) {
      const lines = ['已连上 NapCat。机器人：' + (t.bot.nickname || '（没有昵称）') + '（' + t.bot.id + '）']
      let kind = 'ok'
      if (t.owner) {
        let line = '主人：' + (t.owner.nickname || '（没查到昵称）') + '（' + t.owner.id + '）'
        if (t.owner.isBot) {
          line += '。这个号就是机器人自己，请填你自己的 QQ 号'
          kind = 'warn'
        } else if (!t.owner.friend) {
          line += '。这个号不在机器人的好友列表里，私聊里取不到语音'
          kind = 'warn'
        }
        lines.push(line)
      }
      return { kind: kind, text: lines.join('\n') }
    }

    function QqPanel(props) {
      const [st, setSt] = useState(null)
      const [err, setErr] = useState('')
      const [url, setUrl] = useState('')
      const [token, setToken] = useState('')
      const [owner, setOwner] = useState('')
      const [busy, setBusy] = useState(false)
      const [msg, setMsg] = useState(null)
      const [test, setTest] = useState(null)
      const [swBusy, setSwBusy] = useState(false)
      const [swMsg, setSwMsg] = useState(null)
      const seq = useRef(0)

      const fill = (r) => {
        setSt(r)
        setUrl(r.settings.url)
        setOwner(r.settings.owner)
        setToken('')
      }

      const runTest = async () => {
        const id = ++seq.current
        setTest({ kind: 'dim', text: '正在连接 NapCat…' })
        const r = await callQq('/test', {})
        if (id !== seq.current) return
        if (!r.ok) return setTest({ kind: 'err', text: r.message })
        setTest(testText(r.test))
      }

      useEffect(() => {
        ;(async () => {
          const r = await callQq('/state')
          if (!r.ok) return setErr(r.message)
          setErr('')
          fill(r)
          if (props.onVersion) props.onVersion(r.version)
          if (r.ready) runTest()
        })()
      }, [])

      const save = async () => {
        setBusy(true)
        setMsg(null)
        const body = { url: url, owner: owner }
        if (token.trim()) body.token = token
        const r = await callQq('/settings', body)
        setBusy(false)
        if (!r.ok) return setMsg({ kind: 'err', text: r.message })
        fill(r)
        setMsg({ kind: 'ok', text: '已保存' })
        runTest()
      }

      const toggle = async (on) => {
        setSwBusy(true)
        setSwMsg(null)
        const r = await callQq('/settings', { ownerChatOnly: on })
        setSwBusy(false)
        if (!r.ok) return setSwMsg({ kind: 'err', text: r.message })
        setSt(r)
      }

      const clearToken = async () => {
        setBusy(true)
        setMsg(null)
        const r = await callQq('/settings', { token: '' })
        setBusy(false)
        if (!r.ok) return setMsg({ kind: 'err', text: r.message })
        fill(r)
        setMsg({ kind: 'ok', text: '已清除 token' })
      }

      const importQq = async () => {
        setBusy(true)
        setMsg(null)
        const r = await callQq('/import', {})
        setBusy(false)
        if (!r.ok) return setMsg({ kind: 'err', text: r.message })
        fill(r)
        const got = []
        if (r.imported.url) got.push('地址')
        if (r.imported.token) got.push('token')
        if (r.imported.owner) got.push('主人 QQ')
        let text = got.length ? '已从 dsh-qq 读取：' + got.join('、') : 'dsh-qq 的设置里没有能用的内容，请手动填写'
        if (r.imported.owners > 1) text += '。dsh-qq 里设了 ' + r.imported.owners + ' 个主人，这里用了第一个，需要的话可以改'
        setMsg({ kind: got.length ? 'ok' : 'warn', text: text })
        if (got.length && r.ready) runTest()
      }

      if (err) return h('div', { style: S.err }, err)
      if (!st) return h('div', { style: S.dim }, '正在读取设置…')
      const v = st.settings
      return h(
        'div',
        null,
        h('div', { style: S.hint }, '这是一个临时桥接工具，期待其它插件作者开放音频端口后将取消这个桥接工具。'),
        h(
          'div',
          { style: S.card },
          h('div', { style: S.head }, h('span', { style: S.title }, '连接 NapCat')),
          h('div', { style: S.hint }, '在 NapCat 的「网络配置」里看 WebSocket 服务器的端口和 Token。'),
          h(
            'div',
            { style: S.row },
            h('span', { style: S.lab }, '地址'),
            h('input', { style: S.input, value: url, placeholder: 'ws://127.0.0.1:3001', onChange: (e) => setUrl(e.target.value) }),
          ),
          h(
            'div',
            { style: S.row },
            h('span', { style: S.lab }, 'access token'),
            h('input', {
              style: S.input,
              type: 'password',
              autoComplete: 'off',
              value: token,
              placeholder: v.hasToken ? '已保存 ' + v.tokenMasked + '，不改就留空' : '和 NapCat 里的 Token 一致，NapCat 没设就留空',
              onChange: (e) => setToken(e.target.value),
            }),
            v.hasToken ? h('button', { style: S.btn, disabled: busy, onClick: clearToken }, '清除') : null,
          ),
        ),
        h(
          'div',
          { style: S.card },
          h('div', { style: S.head }, h('span', { style: S.title }, '主人')),
          h('div', { style: S.hint }, '只会取这个 QQ 号发的语音，别人发的语音不会被取走。'),
          h(
            'div',
            { style: S.row },
            h('span', { style: S.lab }, '主人 QQ'),
            h('input', { style: S.input, value: owner, inputMode: 'numeric', placeholder: '你自己的 QQ 号', onChange: (e) => setOwner(e.target.value) }),
          ),
        ),
        h(
          'div',
          { style: S.row },
          h('button', { style: S.btnOn, disabled: busy, onClick: save }, '保存并测试'),
          h('button', { style: S.btn, disabled: busy, onClick: importQq }, '从 dsh-qq 读取'),
          st.ready ? h('button', { style: S.btn, disabled: busy, onClick: runTest }, '重新测试') : null,
        ),
        h('div', { style: S.hint }, '「从 dsh-qq 读取」只在你点的时候读一次 dsh-qq 的设置文件，取地址、token 和主人 QQ。'),
        h(Note, { msg: msg }),
        h(Note, { msg: test }),
        st.ready ? null : h('div', { style: S.warn }, '填好主人 QQ 并保存后，agent 才能用这两个工具。'),
        h(
          'div',
          { style: Object.assign({}, S.card, { marginTop: 10 }) },
          h('div', { style: S.head }, h('span', { style: S.title }, '只有在你和机器人的私聊里才能指定发给谁'), h(Switch, { on: v.ownerChatOnly, disabled: swBusy, onChange: toggle })),
          h(
            'div',
            { style: S.hint },
            v.ownerChatOnly
              ? '在群聊和别人的私聊里只能把语音发回当前聊天，在 DSH 窗口里也不能指定发给谁。发给你自己不受这个开关限制。'
              : '在群聊、别人的私聊和 DSH 窗口里也能指定发给谁，别人也能让机器人把语音发到它的好友和群里。',
          ),
          h(Note, { msg: swMsg }),
        ),
      )
    }

    const TABS = [
      { id: 'rvc', label: 'RVC变声' },
      { id: 'qq', label: 'QQ语音桥' },
    ]
    let lastTab = 'rvc'

    function Tabs(props) {
      return h(
        'div',
        { role: 'tablist', style: S.tabs },
        TABS.map((t) => {
          const on = props.active === t.id
          return h('button', { key: t.id, type: 'button', role: 'tab', 'aria-selected': on, style: on ? S.tabOn : S.tab, onClick: () => props.onChange(t.id) }, t.label)
        }),
      )
    }

    function MainSection() {
      const [tab, setTab] = useState(lastTab)
      const [opened, setOpened] = useState(() => ({ [lastTab]: true }))
      const [version, setVersion] = useState('')
      const pick = (id) => {
        lastTab = id
        setTab(id)
        setOpened((o) => (o[id] ? o : Object.assign({}, o, { [id]: true })))
      }
      return h(
        'div',
        { style: S.wrap },
        h('div', { style: S.head }, h('div', { style: S.h1 }, 'RVC变声'), version ? h('span', { style: S.dim }, 'v' + version) : null),
        h(Tabs, { active: tab, onChange: pick }),
        TABS.map((t) =>
          opened[t.id]
            ? h('div', { key: t.id, role: 'tabpanel', style: tab === t.id ? null : { display: 'none' } }, t.id === 'qq' ? h(QqPanel, { onVersion: setVersion }) : h(RvcPanel, { onVersion: setVersion }))
            : null,
        ),
      )
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('settings.section', () =>
        slots.register({ name: 'settings.section', id: 'dsh-rvc', order: 54, label: () => 'RVC变声' }, MainSection),
      )
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
