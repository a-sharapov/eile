<!-- @component
„Heute geöffnet bis …“: rechnet der Browser aus den Öffnungszeiten (studioHours) in der Zeitzone des Studios (studioTimeZone, sonst Europe/Berlin) aus. Ohne JavaScript oder ohne erkannte Zeiten erscheint nichts.
-->
<script lang="ts">
import Icon from '$components/Icon';
import { facts, openToday, timeZone } from '$components/Studio';

const week = openToday(facts().hours);
const zone = timeZone();
const known = week !== '{}';
// Тег строкой: страница в кэше, «сейчас» знает только браузер; закрывающий тег собран из частей.
const _TAG = 'script';
const _SCRIPT = `<${_TAG}>(()=>{const N=['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'],D={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6},t=s=>{const[h,i]=s.split(':');return+h*60+ +i};document.querySelectorAll('[data-today]:not([data-done])').forEach(e=>{e.dataset.done='';const w=JSON.parse(e.dataset.today);let p;try{p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:e.dataset.zone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]))}catch{return}const day=D[p.weekday],m=+p.hour*60+ +p.minute,r=w[day]||[],o=r.find(x=>m<t(x[1]));let s;if(o)s=m>=t(o[0])?'Heute geöffnet bis '+o[1]+' Uhr':(r.indexOf(o)>0?'Jetzt geschlossen · ab ':'Heute ab ')+o[0]+' Uhr geöffnet';else for(let k=1;k<8&&!s;k++){const n=(day+k)%7,x=w[n];if(x&&x.length)s=(r.length?'Jetzt':'Heute')+' geschlossen · '+(k===1?'morgen':N[n])+' ab '+x[0][0]+' Uhr'}if(s){e.querySelector('span').textContent=s;e.hidden=false}})})()</${_TAG}>`;
</script>

{#if known}
  <p class="today" data-today={week} data-zone={zone} hidden><Icon name="uhr" /><span></span></p>
  {@html _SCRIPT}
{/if}

<style>
  .today {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
  }

  .today[hidden] {
    display: none;
  }
</style>
