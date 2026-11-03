/** Адрес маячка целей: POST с началом адреса ссылки-цели текстом. */
export var GOAL_PATH = '/_cms/goal';

// Клик (и средняя кнопка — ссылка в новой вкладке) по ссылке, адрес которой начинается с цели, — один
// sendBeacon с этим началом. Ни cookie, ни localStorage: только сам факт перехода, остальное знает сервер.
const _SCRIPT = `(()=>{const g=__GOALS__,n=x=>/^(mailto|tel):/i.test(x)?x:new URL(x,location.origin).href,f=e=>{if(e.type==="auxclick"&&e.button!==1)return;const a=e.target.closest&&e.target.closest("a[href]");if(!a)return;const h=new URL(a.getAttribute("href"),document.baseURI).href,p=g.find(x=>h.startsWith(n(x)));p&&navigator.sendBeacon&&navigator.sendBeacon(${JSON.stringify(GOAL_PATH)},p)};addEventListener("click",f,true);addEventListener("auxclick",f,true)})()`;

/** Маячок для конца `<body>`: пустой список целей — маячка нет. */
export var beaconHtml = (links: readonly string[]): string =>
  links.length === 0
    ? ''
    : `<script>${_SCRIPT.replace('__GOALS__', () => JSON.stringify(links).replaceAll('<', '\\u003c'))}</script>`;
