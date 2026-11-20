import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import path from 'node:path';
import {request} from 'node:http';
import {startServer} from '../server.js';

test('production origin template follows the confirmed external port 800',()=>{
 const source=readFileSync('deployment/221.224.86.238/service-environment.template','utf8');
 assert.equal(source.match(/^PUBLIC_BASE_URL=(.+)$/m)?.[1].trim(),'https://huabao.dkmyfamily.com');
 assert.equal(source.match(/^LEGACY_PUBLIC_ORIGIN=(.+)$/m)?.[1].trim(),'http://221.224.86.238:800');
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

test('HTTPS and legacy HTTP use compatible sessions and reject cross-origin requests',async t=>{
 const legacy='http://221.224.86.238:800', canonical='https://huabao.dkmyfamily.com';
 const dataDir=mkdtempSync(path.resolve('tests/.tmp/dual-origin-'));
 let app=await startServer({dataDir,demo:true,publicBaseUrl:legacy});
 t.after(async()=>{app.server.closeAllConnections();await app.close();});
 const credentials={username:'alex',password:'JackeryAlex!2026'};
 const send=(route,{url=legacy,host=new URL(url).host,method='POST',data,headers={}}={})=>
   new Promise((resolve,reject)=>{
     const body=data===undefined?undefined:JSON.stringify(data);
     const req=request(app.baseUrl+route,{method,headers:{Host:host,Origin:url,'Content-Type':'application/json',...headers}},res=>{
       const chunks=[];
       res.on('data',chunk=>chunks.push(chunk));
       res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
       res.on('error',reject);
     });
     req.on('error',reject);
     req.end(body);
   });
 const prior=await send('/api/login',{data:credentials});
 assert.equal(prior.status,200);
 const priorData=await prior.json(), priorCookie=prior.headers.get('set-cookie').split(';')[0];
 await app.close();
 app=await startServer({dataDir,demo:true,publicBaseUrl:canonical,legacyPublicOrigin:legacy});
 const priorSave=await send('/api/records',{data:{sn:'PREVIOUS-HTTP-SESSION',modelId:1},headers:{Cookie:priorCookie,'X-CSRF-Token':priorData.csrfToken}});
 assert.equal(priorSave.status,201);
 for(const url of [legacy,canonical]){
   const login=await send('/api/login',{url,data:credentials});
   assert.equal(login.status,200);
   const cookie=login.headers.get('set-cookie');
   assert.equal(/; Secure(?:;|$)/i.test(cookie),url===canonical);
   const session=await login.json(),headers={Cookie:cookie.split(';')[0],'X-CSRF-Token':session.csrfToken};
   assert.equal((await send('/api/records',{url,method:'GET',headers})).status,200);
   assert.equal((await send('/api/records',{url,data:{sn:'DUPLEX-'+new URL(url).protocol,modelId:1},headers})).status,201);
   assert.equal((await send('/api/records',{url,data:{sn:'NO-CSRF',modelId:1},headers:{Cookie:headers.Cookie}})).status,403);
   const logout=await send('/api/logout',{url,headers});
   assert.equal(logout.status,200);
   assert.equal(/; Secure(?:;|$)/i.test(logout.headers.get('set-cookie')),url===canonical);
 }
 for(const [url,host] of [[canonical,new URL(legacy).host],[legacy,new URL(canonical).host],['https://other.example',new URL(canonical).host],[canonical,'other.example']]){
   assert.equal((await send('/api/login',{url,host,data:credentials})).status,403);
 }
});
