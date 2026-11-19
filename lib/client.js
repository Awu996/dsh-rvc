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

    const PRIMARY = 'var(--dsw-alias-state-business-primary, #4d6bfe)'
    const BORDER = '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3))'
    const S = {
      wrap: { padding: '12px 14px 24px', fontSize: 13, lineHeight: 1.7, background: 'var(--dsw-alias-bg-layer-1, transparent)', border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.15))', borderRadius: 12 },
      h1: { fontSize: 15, fontWeight: 600, margin: '2px 0 4px' },
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

    function separateNote(props) {
      const v = props.st.settings
      if (props.checking) return { kind: 'dim', text: '正在检查容语…' }
      const r = props.status && props.status.rvc
      if (!r) return null
      if (!r.configured) return { kind: 'warn', text: '还没填容语的连接串，填好后才能分离。' }
      if (!r.reachable) return { kind: 'warn', text: '现在连不上容语。分离时需要开着容语。' }
      if (r.edition === 'full') return { kind: 'warn', text: '当前连接的是容语完整版，完整版暂时不支持人声分离，请用容语轻量版。' }
      if (!r.separate) return { kind: 'warn', text: '当前容语版本不支持人声分离，请把容语轻量版升级到最新版本。' }
      return { kind: 'ok', text: v.separate.enabled ? '当前容语支持人声分离。' : '当前容语支持人声分离，打开开关就能用。' }
    }

    function SeparateCard(props) {
      const v = props.st.settings.separate
      const [busy, setBusy] = useState(false)
      const [msg, setMsg] = useState(null)
      const save = async (on) => {
        setBusy(true)
        setMsg(null)
        const r = await call('/settings', { body: { separate: { enabled: on } } })
        setBusy(false)
        if (!r.ok) return setMsg({ kind: 'err', text: r.message })
        props.onSaved(r, true)
      }
      return h(
        'div',
        { style: S.card },
        h('div', { style: S.head }, h('span', { style: S.title }, '人声分离'), h(Switch, { on: v.enabled, disabled: busy, onChange: save })),
        h('div', { style: S.hint }, '打开后，大肥鱼可以用 rvc_separate 把一首歌分成人声和伴奏两个 WAV 文件。需要开着支持人声分离的容语轻量版，并且在容语里选的是 2026 版 RVC 整合包。'),
        h(
          'div',
          null,
          '怎么用：跟大肥鱼说「把 D:\\音乐\\晴天.mp3 的人声和伴奏分开」或「提取 D:\\音乐\\晴天.mp3 的人声」，它会把人声和伴奏分别存成 WAV 文件，并告诉你两个文件在哪。想要伴奏（去人声）也这么说。默认用「去伴奏（激进）」，说「用去伴奏分离」或「用提主旋律分离」可以换处理方式。分离完可以接着说「把人声变声」。',
        ),
        h(Note, { msg: separateNote(props) }),
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
        h('div', { style: S.hint }, v.keep ? '生成的 WAV 会一直留在下面的文件夹里，需要你自己清理。' : '默认用完就删：生成的 WAV 过一段时间自动删除。打开开关就会一直保留。'),
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
        h('div', { style: S.hint }, '把音频或视频文件用容语（RVC）变声，或者把歌曲分成人声和伴奏，生成 WAV 文件。'),
        st.ffmpeg ? null : h('div', { style: S.err }, '插件自带的 ffmpeg 不见了，除了 WAV 和 SILK 以外的格式都转不了。请重新安装插件。'),
        h('div', { style: S.card }, h('div', { style: S.title }, '使用说明'), h('div', null, '大肥鱼调用 rvc_convert（变声）或 rvc_separate（人声分离）、其它插件调用 rvc 服务时，传入本机的音频或视频文件，得到生成的 WAV 文件路径。这个插件只生成文件，不收发任何消息。')),
        h(RvcCard, { st: st, status: status, checking: checking, onSaved: onSaved, onCheck: check }),
        h(SeparateCard, { st: st, status: status, checking: checking, onSaved: onSaved }),
        h(OutputCard, { st: st, onSaved: onSaved }),
      )
    }

    function MainSection() {
      const [version, setVersion] = useState('')
      return h(
        'div',
        { style: S.wrap },
        h('div', { style: S.head }, h('div', { style: S.h1 }, 'RVC变声'), version ? h('span', { style: S.dim }, 'v' + version) : null),
        h(RvcPanel, { onVersion: setVersion }),
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
