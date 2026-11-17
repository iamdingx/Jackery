const germanClock=new Intl.DateTimeFormat('en-GB',{
  timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23',
});

export function germanWorkTime(now=new Date()){
  const parts=Object.fromEntries(germanClock.formatToParts(now).map(({type,value})=>[type,value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function displayWorkTime(record){
  return record.workTime?.replace('T',' ')??record.workDate??'';
}
