import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const root = 'D:/deepseek_harness_project/general/plugins/dsh-element-ref'
const pkg = JSON.parse(await readFile(root + '/package.json', 'utf8'))
console.log('package json ok; exports:', JSON.stringify(pkg.exports), 'client:', JSON.stringify(pkg.dsh && pkg.dsh.client))

const bundle = await readFile(root + '/' + (pkg.exports['./client'] || './lib/client.js'), 'utf8')

// Mirror the host module table: a classic script registers one factory; require only
// reaches the platform seed words or modules this bundle already loaded.
const seen = []
const seed = new Map([
  [
    'react',
    {
      createElement: (type, props, ...children) => ({ type, props, children }),
      useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
      useEffect: () => {},
      useRef: (value) => ({ current: value }),
      useCallback: (fn) => fn,
      useMemo: (fn) => fn(),
    },
  ],
  ['react/jsx-runtime', {}],
  ['react-dom', {}],
  ['react-dom/client', { createRoot: () => ({ render() {}, unmount() {} }) }],
])

let factory = null
const sandbox = {
  window: {
    __ModuleLoader__: {
      load(entry) {
        seen.push(entry.id)
        factory = entry.factory
      },
    },
  },
  document: undefined,
  console,
}
const context = vm.createContext(sandbox)
new vm.Script(bundle, { filename: 'client.js' }).runInContext(context)
console.log('factory registered:', seen)

const require = (spec) => {
  if (seed.has(spec)) return seed.get(spec)
  throw new Error(`client-modules: require("${spec}") missed the module table`)
}
const plugin = factory(require)
console.log('plugin keys:', Object.keys(plugin), 'inject:', JSON.stringify(plugin.inject))
