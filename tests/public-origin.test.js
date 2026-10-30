import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import path from 'node:path';
import {startServer} from '../server.js';

test('production origin template follows the confirmed external port 800',()=>{
 const source=readFileSync('deployment/221.224.86.238/service-environment.template','utf8');
 assert.equal(source.match(/^PUBLIC_BASE_URL=(.+)$/m)?.[1].trim(),'http://221.224.86.238:800');
});

test('public origin with port 800 supports login and save independent of forwarded client IP while rejecting foreign origins',async t=>{
 mkdirSync('tests/.tmp',{recursive:true});const publicBaseUrl='http://221.224.86.238:800',app=await startServer({dataDir:mkdtempSync(path.resolve('tests/.tmp/public-origin-')),demo:true,publicBaseUrl});
 t.after(async()=>{app.server.closeAllConnections();await app.close();});
 const send=(route,data,headers={})=>fetch(app.baseUrl+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:publicBaseUrl,...headers},body:JSON.stringify(data)});
 for(const origin of ['http://221.224.86.238','http://unrelated.example']){const denied=await send('/api/login',{username:'alex',password:'JackeryAlex!2026'},{Origin:origin});assert.equal(denied.status,403);assert.equal((await denied.json()).error.code,'CSRF');}
 const login=await send('/api/login',{username:'alex',password:'JackeryAlex!2026'},{'X-Forwarded-For':'103.151.172.39'});assert.equal(login.status,200);const session=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];assert.equal(session.user.username,'alex');
 const missing=await send('/api/records',{sn:'ORIGIN-MISSING-CSRF',modelId:1},{Cookie:cookie});assert.equal(missing.status,403);
 const created=await send('/api/records',{sn:'PUBLIC-800-SAVE',modelId:1},{Cookie:cookie,'X-CSRF-Token':session.csrfToken,'X-Forwarded-For':'8.8.8.8'});assert.equal(created.status,201);assert.equal((await created.json()).record.sn,'PUBLIC-800-SAVE');
});
