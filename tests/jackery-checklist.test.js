import test from 'node:test';
import assert from 'node:assert/strict';
import {formatChecklist,parseChecklist} from '../public/state.js';
test('Source checklist maintenance round-trips multiline labels, pipe and slash literals and provenance',()=>{
 const items=[{code:'AC',labelEn:'',labelZh:'AC输出\nAC频率 | 原文 \\n',source:{row:8}},{code:'USB',labelEn:'USB output',labelZh:'USB输出',source:{row:5}}];
 const text=formatChecklist(items);assert.equal(text.split('\n').length,2);assert.deepEqual(parseChecklist(text,items),items);
 const changed=parseChecklist(text.replace('USB output','USB output test'),items);assert.equal(changed[1].labelEn,'USB output test');assert.deepEqual(changed[1].source,{row:5});
 assert.deepEqual(parseChecklist('power|Power on|开机'),[{code:'power',labelEn:'Power on',labelZh:'开机'}]);
});
