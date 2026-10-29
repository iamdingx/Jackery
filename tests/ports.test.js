import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { isBlockedWebPort, listenForBrowser } from '../src/ports.js';

class FakeServer extends EventEmitter {
  constructor(ports){super();this.ports=[...ports];this.attempts=0;this.closes=0;}
  listen(port,host,callback){this.port=this.ports[this.attempts++];queueMicrotask(callback);return this;}
  address(){return {port:this.port};}
  close(callback){this.closes++;queueMicrotask(()=>callback());}
}
test('browser-blocked service ports are rejected before binding',async()=>{
  assert.equal(isBlockedWebPort(6000),true);assert.equal(isBlockedWebPort(10080),true);assert.equal(isBlockedWebPort(4310),false);
  const server=new FakeServer([6000]);await assert.rejects(()=>listenForBrowser(server,6000,'127.0.0.1'),/blocked.*browser/i);assert.equal(server.attempts,0);
});
test('automatic allocation retries a browser-blocked ephemeral port',async()=>{
  const server=new FakeServer([10080,43123]);await listenForBrowser(server,0,'127.0.0.1');assert.equal(server.attempts,2);assert.equal(server.closes,1);assert.equal(server.address().port,43123);
});
