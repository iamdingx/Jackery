import {escapeHtml as e} from './state.js';

export const gradingZh={
  'Grade criteria':'成色标准',
  'Like New: at most {count} wear mark(s) of 1 cm or less and no visible stains.':'如新：不超过 {count} 处 ≤1 cm 的磨损点，整体无可见污渍。',
  'Good: no obvious damage larger than 1 cm and at most {count} wear marks of 1 cm or less.':'良好：无大于 1 cm 的明显损伤，且不超过 {count} 处 ≤1 cm 的磨损点。',
  'Like New: no visible stains.':'如新：整体无可见污渍。',
  'Good: no obvious damage larger than 1 cm.':'良好：无大于 1 cm 的明显损伤。',
  'The wear mark limits for this model have yet to be confirmed.':'该机型的磨损点数量标准待确认。',
  'Acceptable: appearance falls below Good, with normal function.':'可接受：外观未达到良好标准，功能无异常。',
  'Send units with functional faults for repair. For borderline appearance, judge from the customer’s perspective.':'功能异常的设备安排维修。外观难以判断时，请从客户视角判断。',
};

export function gradeCriteria(model,t){
  const code=String(model.baseModelCode||model.nameEn||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const limits={e500:[1,5],e1000v2:[1,5],e2000pro:[2,6],e3000:[3,7]}[code];
  const descriptions=limits?[
    t('Like New: at most {count} wear mark(s) of 1 cm or less and no visible stains.').replace('{count}',limits[0]),
    t('Good: no obvious damage larger than 1 cm and at most {count} wear marks of 1 cm or less.').replace('{count}',limits[1]),
  ]:[t('Like New: no visible stains.'),t('Good: no obvious damage larger than 1 cm.')];
  return `<section id="grade-criteria" class="grade-criteria" popover aria-labelledby="grade-heading">
    <div class="panel-head"><h3 id="grade-heading">${e(t('Grade criteria'))}</h3><button type="button" popovertarget="grade-criteria" popovertargetaction="hide" aria-label="${e(t('Close'))}">×</button></div>
    <ul>${[...descriptions,t('Acceptable: appearance falls below Good, with normal function.')].map(text=>`<li>${e(text)}</li>`).join('')}</ul>
    ${limits?'':`<p class="muted">${e(t('The wear mark limits for this model have yet to be confirmed.'))}</p>`}
    <p class="muted">${e(t('Send units with functional faults for repair. For borderline appearance, judge from the customer’s perspective.'))}</p>
  </section>`;
}

export function positionGradeCriteria(button,popup){
  button?.addEventListener('click',()=>{
    const bounds=button.closest('.outcome-group').getBoundingClientRect();
    popup.style.setProperty('--grade-left',Math.max(12,bounds.left)+'px');
    popup.style.setProperty('--grade-bottom',Math.max(12,window.innerHeight-bounds.top+8)+'px');
    popup.style.setProperty('--grade-height',Math.max(180,bounds.top-20)+'px');
  });
}
