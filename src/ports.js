// Fetch Standard port blocking, checked against the tested Node 24 runtime.
// https://fetch.spec.whatwg.org/#bad-port
const blocked=new Set([0,1,7,9,11,13,15,17,19,20,21,22,23,25,37,42,43,53,69,77,79,87,95,101,102,103,104,109,110,111,113,115,117,119,123,135,137,139,143,161,179,389,427,465,512,513,514,515,526,530,531,532,540,548,554,556,563,587,601,636,989,990,993,995,1719,1720,1723,2049,3659,4045,4190,5060,5061,6000,6566,6665,6666,6667,6668,6669,6679,6697,10080]);
export const isBlockedWebPort=port=>blocked.has(port);
export async function listenForBrowser(server,port,host){
  if(!Number.isInteger(port)||port<0||port>65535)throw new Error('PORT must be 0–65535');
  if(port!==0&&isBlockedWebPort(port))throw new Error('This PORT is blocked by browser safety rules; choose 4310 or another web-safe port');
  for(let attempt=0;attempt<5;attempt++){
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolve();});});
    if(!isBlockedWebPort(server.address().port))return;
    await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
  throw new Error('Unable to allocate a browser-safe local port');
}
