const maxFileBytes=2*1024*1024;
const decoder=new TextDecoder();
const invalid=()=>{throw new Error('Use the stock template or a single-sheet XLSX file with two columns and no formulas.');};

function zipEntries(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u16=offset=>view.getUint16(offset,true),u32=offset=>view.getUint32(offset,true);
  let end=bytes.length-22;
  for(;end>=Math.max(0,bytes.length-65557);end--){
    if(u32(end)===0x06054b50&&end+22+u16(end+20)===bytes.length)break;
  }
  if(end<0||end<bytes.length-65557||u16(end+4)||u16(end+6)||u16(end+8)!==u16(end+10))invalid();
  const entries=new Map(),count=u16(end+10),start=u32(end+16);
  if(count>512||start+u32(end+12)!==end)invalid();
  let offset=start;
  for(let i=0;i<count;i++){
    if(offset+46>end||u32(offset)!==0x02014b50)invalid();
    const length=u16(offset+28),next=offset+46+length+u16(offset+30)+u16(offset+32);
    if(next>end)invalid();
    const name=decoder.decode(bytes.subarray(offset+46,offset+46+length));
    if(entries.has(name))invalid();
    entries.set(name,{method:u16(offset+10),compressed:u32(offset+20),size:u32(offset+24),header:u32(offset+42)});
    offset=next;
  }
  if(offset!==end)invalid();
  async function xml(name){
    const {method,compressed,size,header}=entries.get(name);
    if(size>maxFileBytes||header+30>start||u32(header)!==0x04034b50||u16(header+6)&1)invalid();
    const dataStart=header+30+u16(header+26)+u16(header+28);
    if(dataStart+compressed>start)invalid();
    const data=bytes.subarray(dataStart,dataStart+compressed);
    let text;
    if(method===0&&compressed===size)text=decoder.decode(data);
    else if(method===8){
      const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const unpacked=new Uint8Array(size);
      let written=0;
      try{
        for(;;){
          const {done,value}=await reader.read();
          if(done)break;
          if(written+value.length>size)invalid();
          unpacked.set(value,written);written+=value.length;
        }
      }finally{await reader.cancel().catch(()=>{});}
      if(written!==size)invalid();
      text=decoder.decode(unpacked);
    }else invalid();
    if(/<!DOCTYPE/i.test(text))invalid();
    const document=new DOMParser().parseFromString(text,'application/xml');
    if(document.getElementsByTagName('parsererror').length)invalid();
    return document;
  }
  return {entries,xml};
}

const children=(node,name)=>Array.from(node.children).filter(child=>child.localName===name);
const strings=node=>Array.from(node.getElementsByTagNameNS('*','t'),item=>item.textContent).join('');
const csvCell=value=>'"'+value.replaceAll('"','""')+'"';

async function worksheetCsv(file){
  const zip=zipEntries(new Uint8Array(await file.arrayBuffer()));
  const sheets=[...zip.entries.keys()].filter(name=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(name));
  if(sheets.length!==1)invalid();
  const sheet=await zip.xml(sheets[0]),data=children(sheet.documentElement,'sheetData')[0];
  if(!data)invalid();
  const shared=zip.entries.has('xl/sharedStrings.xml')?
    children((await zip.xml('xl/sharedStrings.xml')).documentElement,'si').map(strings):[];
  const lines=[];
  for(const row of children(data,'row')){
    const number=Number(row.getAttribute('r'));
    if(!Number.isInteger(number)||number<=lines.length||number>5001)invalid();
    const fields=['',''],seen=new Set();
    for(const cell of children(row,'c')){
      const type=cell.getAttribute('t')||'n',position=cell.getAttribute('r')??'';
      const value=children(cell,'v')[0]?.textContent??'',inline=children(cell,'is')[0];
      if(children(cell,'f').length)invalid();
      if(!value&&!inline)continue;
      const column=position.match(/^([AB])([1-9]\d*)$/);
      if(!column||Number(column[2])!==number||seen.has(column[1]))invalid();
      seen.add(column[1]);
      const index=column[1]==='A'?0:1;
      if(type==='s'){
        if(!/^\d+$/.test(value)||shared[Number(value)]===undefined)invalid();
        fields[index]=shared[Number(value)];
      }else if(type==='inlineStr'&&inline)fields[index]=strings(inline);
      else if(type==='n'||type==='str')fields[index]=value;
      else invalid();
    }
    while(lines.length<number-1)lines.push('');
    lines.push(fields.some(Boolean)?fields.map(csvCell).join(','):'');
  }
  return lines.join('\n');
}

export async function readStockFile(file){
  if(!/\.(?:xlsx|csv)$/i.test(file.name)||file.size>maxFileBytes)throw new Error('Choose an XLSX or UTF-8 CSV file up to 2 MiB.');
  if(/\.csv$/i.test(file.name))return file.text();
  try{return await worksheetCsv(file);}
  catch{invalid();}
}
