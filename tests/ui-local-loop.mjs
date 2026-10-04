// UI scenario uses browser inputs/clicks; LocalWorker alone talks to worker protocol.
import {chromium,expect} from '@playwright/test'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn,execFileSync} from 'node:child_process'
import {once} from 'node:events'
import {randomBytes} from 'node:crypto'
import {LocalWorker} from '../local-worker/local-worker.mjs'
const dir=mkdtempSync(join(tmpdir(),'dq-ui-')),repo=join(dir,'repo'),token=randomBytes(32).toString('hex'),base='http://127.0.0.1:3192'
let browser,server
const screenshots=[]
async function snapshot(page,name){await page.screenshot({path:`artifacts/ui/${name}.png`,fullPage:true});screenshots.push(name)}
try{
 // Fail early if browser system libraries unavailable; no screenshots are synthesized.
 browser=await chromium.launch({headless:true})
 mkdirSync(join(repo,'src'),{recursive:true});mkdirSync(join(repo,'test'))
 writeFileSync(join(repo,'package.json'),JSON.stringify({name:'dev-queue-disposable-fixture',type:'module',scripts:{test:'node --test test/*.test.mjs'}}))
 writeFileSync(join(repo,'src/calculator.mjs'),'// Fixture\n');writeFileSync(join(repo,'test/calculator.test.mjs'),"import test from 'node:test';import assert from 'node:assert/strict';import * as c from '../src/calculator.mjs';test('add',()=>assert.equal(c.add(2,3),5))")
 execFileSync('git',['init',repo])
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3192'],{env:{...process.env,DEV_QUEUE_LOCAL_DATA_PATH:join(dir,'state'),DEV_QUEUE_WORKER_TOKEN:token},stdio:'ignore'})
 for(let i=0;i<120;i++){try{if((await fetch(base)).ok)break}catch{}await new Promise(r=>setTimeout(r,500))}
 const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto(base)
 await page.getByLabel('name',{exact:true}).fill('UI calculator');await page.getByLabel('goal',{exact:true}).fill('Browser scenario');await page.getByLabel('repositoryPath',{exact:true}).fill(repo)
 await page.getByRole('button',{name:'Create Project',exact:true}).click();await expect(page.getByText('No PRs in this project.',{exact:true})).toBeVisible()
 const projectId=await page.getByLabel('Project',{exact:true}).inputValue()
 await snapshot(page,'01-projects');await snapshot(page,'02-empty-queue')
 for(let i=1;i<=3;i++){
 await page.getByLabel('title',{exact:true}).fill(['Add','Subtract','Multiply'][i-1]);await page.getByLabel('objective',{exact:true}).fill('Execute deterministic fixture')
 await page.getByLabel('Specification — implementation requested',{exact:true}).fill('fixture:'+['add','subtract','multiply'][i-1]);await page.getByLabel('Acceptance criteria — separate gates (empty means no criteria defined)',{exact:true}).fill('npm test')
 await page.getByLabel('dependencies (one per line)',{exact:true}).fill(i>1?String(i-1):'');await page.getByLabel('position',{exact:true}).fill(String(i-1));await page.getByLabel('PR number (optional at creation)',{exact:true}).fill(String(i))
 await snapshot(page,'04-pr-editor');await page.getByRole('button',{name:'Save task',exact:true}).click();await expect(page.getByRole('heading',{name:new RegExp('#'+i+' ')})).toBeVisible()
 }
 await snapshot(page,'03-populated-queue')
 const worker=new LocalWorker(base,token,repo),claim=await worker.claim(projectId);const running=worker.startTask(claim.taskPacket)
 await page.getByRole('button',{name:'Inspect project execution'}).click()
 await snapshot(page,'05-running')
 for(let i=0;i<60;i++){await page.getByRole('button',{name:'Inspect project execution'}).click();if(await page.getByText('ATTENTION REQUIRED',{exact:true}).isVisible())break;await page.waitForTimeout(250)}
 await expect(page.getByText('ATTENTION REQUIRED',{exact:true})).toBeVisible();await snapshot(page,'06-attention')
 await page.setViewportSize({width:390,height:844});await snapshot(page,'16-mobile-attention');await page.setViewportSize({width:1440,height:1000})
 page.once('dialog',dialog=>dialog.accept('Follow direct exports'));await page.getByRole('button',{name:'Answer',exact:true}).click();await running
 await page.getByRole('button',{name:'Inspect project execution'}).click();await snapshot(page,'07-answer-submitted');await snapshot(page,'08-activity')
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Run acceptance gates'}).click();await expect(page.getByRole('heading',{name:'#1 Add — done',exact:true})).toBeVisible({timeout:30000})
 await snapshot(page,'11-acceptance');await snapshot(page,'12-done');await snapshot(page,'14-session')
 const second=new LocalWorker(base,token,repo);const next=await second.claim(projectId);if(next.taskPacket.pr.number!==2)throw new Error('Wrong next task');await page.getByRole('button',{name:'Inspect project execution'}).click();await snapshot(page,'13-next-task')
 await page.setViewportSize({width:390,height:844});await snapshot(page,'15-mobile-queue')
 writeFileSync('artifacts/ui/inventory.json',JSON.stringify({browser:await browser.version(),screenshots,coverage:'core browser path only; not all exposed actions'},null,2))
 console.log('PASS core browser path; full every-action coverage not claimed')
}finally{if(browser)await browser.close();if(server&&server.exitCode===null){server.kill('SIGTERM');await once(server,'exit')}rmSync(dir,{recursive:true,force:true})}
