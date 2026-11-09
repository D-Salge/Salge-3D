import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
const require=createRequire(import.meta.url)
const code=ts.transpileModule(readFileSync(new URL('../app/components/ThemeToggle.tsx',import.meta.url),'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},
}).outputText
function mount(){
 let theme='dark',busy=false,finish,tree;const calls=[]
 const mocks={react:{useState:()=>[busy,value=>{busy=value}],useSyncExternalStore:()=>theme},'@/public/theme-transition.mjs':{
  getTheme:()=>theme,subscribeTheme:()=>()=>{},changeTheme:next=>{calls.push(next);return new Promise(resolve=>{finish=()=>{theme=next;resolve()}})},
 }}
 const context=vm.createContext({exports:{},require:name=>mocks[name]??require(name)})
 new vm.Script(code).runInContext(context)
 const render=()=>tree=context.exports.ThemeToggle()
 render()
 return {calls,render,finish:()=>finish(),button:()=>tree}
}
test('ícone animado alterna o tema, informa a próxima ação e bloqueia cliques durante a transição',async()=>{
 const ui=mount()
 assert.equal(ui.button().props['data-theme'],'dark')
 assert.equal(ui.button().props['aria-label'],'Ativar modo claro')
 const changing=ui.button().props.onClick();ui.render()
 assert.equal(ui.button().props.disabled,true)
 assert.equal(ui.button().props['aria-busy'],true)
 await ui.button().props.onClick();assert.deepEqual(ui.calls,['light'])
 ui.finish();await changing;ui.render()
 assert.equal(ui.button().props['data-theme'],'light')
 assert.equal(ui.button().props['aria-label'],'Ativar modo escuro')
 assert.equal(ui.button().props.disabled,false)
 const back=ui.button().props.onClick();ui.finish();await back;ui.render()
 assert.equal(ui.button().props['data-theme'],'dark')
 assert.equal(ui.button().props['aria-label'],'Ativar modo claro')
 assert.deepEqual(ui.calls,['light','dark'])
})
