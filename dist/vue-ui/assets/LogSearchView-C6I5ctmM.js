import{r as e,t}from"./chunk-CQeTWI2k.js";import{E as n,Ft as r,J as i,L as a,P as o,Pt as s,Y as c,_ as l,c as u,d,g as f,i as p,it as m,j as h,k as g,ot as _,pt as v,s as y,t as b,y as x}from"./_plugin-vue_export-helper-DAFnlxWz.js";import"./runtime-dom.esm-bundler-v-CUawBb.js";import{n as S,t as C}from"./basecomponent-CJ747krd.js";import{t as w}from"./datepicker-R6VHYF5_.js";import"./inputicon-CzgWme0G.js";import"./service-C_x5nE-v.js";import{t as T}from"./multiselect-BMR6vhk6.js";import{t as E}from"./inputtext-C2EVA17r.js";import"./checkbox-DB7VhxGr.js";import"./api-q9O50XRw.js";import{t as D}from"./tag-B9_YsII3.js";import"./import-wrapper-prod-CnvY9lw1.js";import{F as O,L as k,P as A,q as j,y as M}from"./main-CQkMK8rK.js";import{t as N}from"./MCard-CccaYS96.js";import"./MContextMenu-xX-GNXr4.js";import{n as P,t as F}from"./MTableColumn-DIqr3-fv.js";var I=S.extend({name:`inputgroup`,style:`
    .p-inputgroup,
    .p-inputgroup .p-iconfield,
    .p-inputgroup .p-floatlabel,
    .p-inputgroup .p-iftalabel {
        display: flex;
        align-items: stretch;
        width: 100%;
    }

    .p-inputgroup .p-floatlabel .p-inputwrapper,
    .p-inputgroup .p-iftalabel .p-inputwrapper {
        display: inline-flex;
    }

    .p-inputgroup .p-inputtext,
    .p-inputgroup .p-inputwrapper {
        flex: 1 1 auto;
        width: 1%;
    }

    .p-inputgroupaddon {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: dt('inputgroup.addon.padding');
        background: dt('inputgroup.addon.background');
        color: dt('inputgroup.addon.color');
        border-block-start: 1px solid dt('inputgroup.addon.border.color');
        border-block-end: 1px solid dt('inputgroup.addon.border.color');
        min-width: dt('inputgroup.addon.min.width');
    }

    .p-inputgroupaddon:first-child,
    .p-inputgroupaddon + .p-inputgroupaddon {
        border-inline-start: 1px solid dt('inputgroup.addon.border.color');
    }

    .p-inputgroupaddon:last-child {
        border-inline-end: 1px solid dt('inputgroup.addon.border.color');
    }

    .p-inputgroupaddon:has(.p-button) {
        padding: 0;
        overflow: hidden;
    }

    .p-inputgroupaddon .p-button {
        border-radius: 0;
    }

    .p-inputgroup > .p-component,
    .p-inputgroup > .p-inputwrapper > .p-component,
    .p-inputgroup > .p-iconfield > .p-component,
    .p-inputgroup > .p-floatlabel > .p-component,
    .p-inputgroup > .p-floatlabel > .p-inputwrapper > .p-component,
    .p-inputgroup > .p-iftalabel > .p-component,
    .p-inputgroup > .p-iftalabel > .p-inputwrapper > .p-component {
        border-radius: 0;
        margin: 0;
    }

    .p-inputgroupaddon:first-child,
    .p-inputgroup > .p-component:first-child,
    .p-inputgroup > .p-inputwrapper:first-child > .p-component,
    .p-inputgroup > .p-iconfield:first-child > .p-component,
    .p-inputgroup > .p-floatlabel:first-child > .p-component,
    .p-inputgroup > .p-floatlabel:first-child > .p-inputwrapper > .p-component,
    .p-inputgroup > .p-iftalabel:first-child > .p-component,
    .p-inputgroup > .p-iftalabel:first-child > .p-inputwrapper > .p-component {
        border-start-start-radius: dt('inputgroup.addon.border.radius');
        border-end-start-radius: dt('inputgroup.addon.border.radius');
    }

    .p-inputgroupaddon:last-child,
    .p-inputgroup > .p-component:last-child,
    .p-inputgroup > .p-inputwrapper:last-child > .p-component,
    .p-inputgroup > .p-iconfield:last-child > .p-component,
    .p-inputgroup > .p-floatlabel:last-child > .p-component,
    .p-inputgroup > .p-floatlabel:last-child > .p-inputwrapper > .p-component,
    .p-inputgroup > .p-iftalabel:last-child > .p-component,
    .p-inputgroup > .p-iftalabel:last-child > .p-inputwrapper > .p-component {
        border-start-end-radius: dt('inputgroup.addon.border.radius');
        border-end-end-radius: dt('inputgroup.addon.border.radius');
    }

    .p-inputgroup .p-component:focus,
    .p-inputgroup .p-component.p-focus,
    .p-inputgroup .p-inputwrapper-focus,
    .p-inputgroup .p-component:focus ~ label,
    .p-inputgroup .p-component.p-focus ~ label,
    .p-inputgroup .p-inputwrapper-focus ~ label,
    .p-inputgroup .p-floatlabel .p-inputwrapper ~ label,
    .p-inputgroup .p-iftalabel .p-inputwrapper ~ label {
        z-index: 1;
    }

    .p-inputgroup > .p-button:not(.p-button-icon-only) {
        width: auto;
    }

    .p-inputgroup .p-iconfield + .p-iconfield .p-inputtext {
        border-inline-start: 0;
    }
`,classes:{root:`p-inputgroup`}}),L={name:`InputGroup`,extends:{name:`BaseInputGroup`,extends:C,style:I,provide:function(){return{$pcInputGroup:this,$parentInstance:this}}},inheritAttrs:!1};function R(e,t,r,i,s,c){return o(),d(`div`,n({class:e.cx(`root`)},e.ptmi(`root`)),[a(e.$slots,`default`)],16)}L.render=R;var z=S.extend({name:`inputgroupaddon`,classes:{root:`p-inputgroupaddon`}}),B={name:`InputGroupAddon`,extends:{name:`BaseInputGroupAddon`,extends:C,style:z,provide:function(){return{$pcInputGroupAddon:this,$parentInstance:this}}},inheritAttrs:!1};function V(e,t,r,i,s,c){return o(),d(`div`,n({class:e.cx(`root`)},e.ptmi(`root`)),[a(e.$slots,`default`)],16)}B.render=V;var H=t(((e,t)=>{function n(e){var t=typeof e;return e!=null&&(t==`object`||t==`function`)}t.exports=n})),U=t(((e,t)=>{t.exports=typeof global==`object`&&global&&global.Object===Object&&global})),W=t(((e,t)=>{var n=U(),r=typeof self==`object`&&self&&self.Object===Object&&self;t.exports=n||r||Function(`return this`)()})),G=t(((e,t)=>{var n=W();t.exports=function(){return n.Date.now()}})),K=t(((e,t)=>{var n=/\s/;function r(e){for(var t=e.length;t--&&n.test(e.charAt(t)););return t}t.exports=r})),q=t(((e,t)=>{var n=K(),r=/^\s+/;function i(e){return e&&e.slice(0,n(e)+1).replace(r,``)}t.exports=i})),J=t(((e,t)=>{t.exports=W().Symbol})),Y=t(((e,t)=>{var n=J(),r=Object.prototype,i=r.hasOwnProperty,a=r.toString,o=n?n.toStringTag:void 0;function s(e){var t=i.call(e,o),n=e[o];try{e[o]=void 0;var r=!0}catch{}var s=a.call(e);return r&&(t?e[o]=n:delete e[o]),s}t.exports=s})),X=t(((e,t)=>{var n=Object.prototype.toString;function r(e){return n.call(e)}t.exports=r})),Z=t(((e,t)=>{var n=J(),r=Y(),i=X(),a=`[object Null]`,o=`[object Undefined]`,s=n?n.toStringTag:void 0;function c(e){return e==null?e===void 0?o:a:s&&s in Object(e)?r(e):i(e)}t.exports=c})),Q=t(((e,t)=>{function n(e){return typeof e==`object`&&!!e}t.exports=n})),$=t(((e,t)=>{var n=Z(),r=Q(),i=`[object Symbol]`;function a(e){return typeof e==`symbol`||r(e)&&n(e)==i}t.exports=a})),ee=t(((e,t)=>{var n=q(),r=H(),i=$(),a=NaN,o=/^[-+]0x[0-9a-f]+$/i,s=/^0b[01]+$/i,c=/^0o[0-7]+$/i,l=parseInt;function u(e){if(typeof e==`number`)return e;if(i(e))return a;if(r(e)){var t=typeof e.valueOf==`function`?e.valueOf():e;e=r(t)?t+``:t}if(typeof e!=`string`)return e===0?e:+e;e=n(e);var u=s.test(e);return u||c.test(e)?l(e.slice(2),u?2:8):o.test(e)?a:+e}t.exports=u})),te=e(t(((e,t)=>{var n=H(),r=G(),i=ee(),a=`Expected a function`,o=Math.max,s=Math.min;function c(e,t,c){var l,u,d,f,p,m,h=0,g=!1,_=!1,v=!0;if(typeof e!=`function`)throw TypeError(a);t=i(t)||0,n(c)&&(g=!!c.leading,_=`maxWait`in c,d=_?o(i(c.maxWait)||0,t):d,v=`trailing`in c?!!c.trailing:v);function y(t){var n=l,r=u;return l=u=void 0,h=t,f=e.apply(r,n),f}function b(e){return h=e,p=setTimeout(C,t),g?y(e):f}function x(e){var n=e-m,r=e-h,i=t-n;return _?s(i,d-r):i}function S(e){var n=e-m,r=e-h;return m===void 0||n>=t||n<0||_&&r>=d}function C(){var e=r();if(S(e))return w(e);p=setTimeout(C,x(e))}function w(e){return p=void 0,v&&l?y(e):(l=u=void 0,f)}function T(){p!==void 0&&clearTimeout(p),h=0,l=m=u=p=void 0}function E(){return p===void 0?f:w(r())}function D(){var e=r(),n=S(e);if(l=arguments,u=this,m=e,n){if(p===void 0)return b(m);if(_)return clearTimeout(p),p=setTimeout(C,t),y(m)}return p===void 0&&(p=setTimeout(C,t)),f}return D.cancel=T,D.flush=E,D}t.exports=c}))()),ne={class:`grid grid-cols-1 md:grid-cols-3 gap-4`},re={class:`grid grid-cols-1 md:grid-cols-3 gap-4`},ie={class:`flex justify-center`},ae=b(x({__name:`LogSearchView`,props:{vhOffset:{}},setup(e){let t=_([]),n=_(!1),a=_([]),b=_([]),x=_([]),S=_([]),C=[{id:`DEBUG`,label:`Debug`},{id:`AUDIT`,label:`Audit`},{id:`ERROR`,label:`Error`},{id:`EMERGENCY`,label:`Emergency`}],I=m({query:{startDate:null,endDate:null,scriptIds:[],deploymentIds:[],scriptTypes:[]},quick:{global:null,startDate:null,endDate:null,scriptTypes:[],logLevels:[]},quickOptions:{caseSensitive:!1,wholeWord:!1,regex:!1}}),R=_(``),z=async(e,t)=>{if(t===`script`){console.log(`addToQueryFilters called with context: script, row:`,e);let t=Number(e.scriptId);if(console.log(`scriptId extracted:`,t,`row.scriptId:`,e.scriptId),!isNaN(t)){let e=[...I.query.scriptIds];e.includes(t)||e.push(t),I.query.scriptIds=e,console.log(`scriptIds after update:`,I.query.scriptIds),J()}}else if(t===`deployment`&&e.scriptId&&e.deploymentId){console.log(`addToQueryFilters called with context: deployment, row:`,e);let t=Number(e.scriptId),n=Number(e.deploymentId);console.log(`scriptId:`,t,`deploymentId:`,n);let r=[...I.query.scriptIds];r.includes(t)||r.push(t),I.query.scriptIds=r,console.log(`scriptIds after update:`,I.query.scriptIds),J();let i=()=>b.value.find(e=>e.id===n)?(I.query.deploymentIds.includes(n)||(I.query.deploymentIds=[...I.query.deploymentIds,n]),!0):!1;if(!i()){let e=setInterval(()=>{i()&&clearInterval(e)},100);setTimeout(()=>{clearInterval(e)},5e3)}}},V=[{label:`Add Script to Query Filters`,icon:`pi pi-filter`,action:e=>z(e,`script`)},{label:`Go to Script`,icon:`pi pi-external-link`,action:e=>U(e.scriptId)}],H=[{label:`Add Deployment to Query Filters`,icon:`pi pi-filter`,action:e=>z(e,`deployment`)}],U=async e=>{if(!e)return;let t=await M(A.SCRIPT_URL,{scriptId:e})||{};if(!t)return;let{message:n}=t;window.open(n,`_blank`)},W=y(()=>{let e=[...t.value],n=R.value?.trim();if(n){let{caseSensitive:t,wholeWord:r,regex:i}=I.quickOptions,a=t?`g`:`gi`,o;try{o=i?new RegExp(n,a):r?RegExp(`\\b${n}\\b`,a):new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`),a)}catch{o=/$^/}e=e.filter(e=>[`message`,`scriptName`,`deploymentName`,`level`,`scriptType`,`title`].some(t=>o.test(e[t])))}if(I.quick.scriptTypes.length&&(e=e.filter(e=>I.quick.scriptTypes.includes(e.scriptType))),I.quick.logLevels.length&&(e=e.filter(e=>I.quick.logLevels.includes(e.level.toUpperCase().trim()))),I.quick.startDate||I.quick.endDate){let t=I.quick.startDate?I.quick.startDate.getTime():-1/0,n=I.quick.endDate?(()=>{let e=new Date(I.quick.endDate);return e.setSeconds(59,999),e.getTime()})():1/0;e=e.filter(e=>{let r=Date.parse(e.datetime);return r>=t&&r<=n})}return e}),G=e=>(e instanceof Date?e:new Date(e)).toLocaleString(void 0,{year:`numeric`,month:`short`,day:`2-digit`,hour:`2-digit`,minute:`2-digit`,second:`2-digit`}),K=async()=>{try{let{message:e}=await M(A.SCRIPT_TYPES)||{};Array.isArray(e)&&(x.value=e),Array.isArray(e)&&(S.value=e.map(({label:e})=>({id:e,label:e})))}catch(e){console.error(`getScriptTypes error:`,e)}},q=async()=>{try{let{message:e}=await M(A.SCRIPTS)||{};if(!Array.isArray(e))return;a.value=e.map(({id:e,name:t})=>({id:e,label:t}))}catch(e){console.error(`getScripts error:`,e)}},J=async()=>{try{let{message:e}=await M(A.SCRIPT_DEPLOYMENTS,{scriptIds:I.query.scriptIds})||{};if(!Array.isArray(e))return;b.value=e.map(({primarykey:e,scriptid:t,scriptname:n})=>({id:Number(e),label:`${t.toUpperCase()} (${n})`}))}catch(e){console.error(`getDeployments error:`,e)}},Y=async()=>{n.value=!0;try{let{message:e}=await M(A.LOGS,{startDate:I.query.startDate,endDate:I.query.endDate,scriptIds:I.query.scriptIds,deploymentIds:I.query.deploymentIds,scriptTypes:I.query.scriptTypes})||{};t.value=Array.isArray(e)?e.map(e=>({id:e.internalid,datetime:e.datetime,title:e.title,level:e.type,message:e.detail,scriptId:e[`script.internalid`],deploymentId:e[`scriptDeployment.internalid`],scriptType:e.scripttype,scriptName:e[`script.name`],deploymentName:e[`scriptDeployment.scriptid`]})):[]}catch(e){console.error(`getLogs error:`,e)}finally{n.value=!1}},X=e=>{e.target.closest(`.p-contextmenu`)&&(e.preventDefault(),e.stopPropagation())};i(()=>I.query.scriptIds,()=>J(),{deep:!0});let Z=(0,te.default)(e=>{R.value=e||``},150);i(()=>I.quick.global,e=>Z(e)),h(()=>{document.addEventListener(`contextmenu`,X,!0),Q()});let Q=async()=>{await Y(),await K(),await q()};return g(()=>{document.removeEventListener(`contextmenu`,X,!0)}),(t,i)=>(o(),d(p,null,[l(k,{outline:``,toggleable:``,"box-shadow":``,header:`Query Filters`},{header:c(()=>[l(v(j),{onClick:Y,class:`h-full bg-[var(--p-slate-300)] !rounded-md ml-auto`},{default:c(()=>[...i[13]||=[u(`i`,{class:`pi pi-search text-white`},null,-1),f(` Run Search`,-1)]]),_:1})]),default:c(()=>[u(`div`,ne,[u(`div`,null,[i[14]||=u(`label`,{class:`font-bold block mb-2`},`Start Datetime`,-1),l(v(w),{modelValue:I.query.startDate,"onUpdate:modelValue":i[0]||=e=>I.query.startDate=e,showTime:``,hourFormat:`24`,fluid:``},null,8,[`modelValue`])]),u(`div`,null,[i[15]||=u(`label`,{class:`font-bold block mb-2`},`End Datetime`,-1),l(v(w),{modelValue:I.query.endDate,"onUpdate:modelValue":i[1]||=e=>I.query.endDate=e,showTime:``,hourFormat:`24`,fluid:``},null,8,[`modelValue`])]),u(`div`,null,[i[16]||=u(`label`,{class:`font-bold block mb-2`},`Script Types`,-1),l(v(T),{modelValue:I.query.scriptTypes,"onUpdate:modelValue":i[2]||=e=>I.query.scriptTypes=e,options:x.value,virtualScrollerOptions:{itemSize:44},optionLabel:`label`,optionValue:`id`,filter:``,class:`w-full`,placeholder:`Script Types`},null,8,[`modelValue`,`options`])]),u(`div`,null,[i[17]||=u(`label`,{class:`font-bold block mb-2`},`Script`,-1),l(v(T),{modelValue:I.query.scriptIds,"onUpdate:modelValue":i[3]||=e=>I.query.scriptIds=e,virtualScrollerOptions:{itemSize:44},options:a.value,optionLabel:`label`,optionValue:`id`,filter:``,class:`w-full`,placeholder:`Select Scripts`},null,8,[`modelValue`,`options`])]),u(`div`,null,[i[18]||=u(`label`,{class:`font-bold block mb-2`},`Deployment`,-1),l(v(T),{modelValue:I.query.deploymentIds,"onUpdate:modelValue":i[4]||=e=>I.query.deploymentIds=e,options:b.value,optionLabel:`label`,optionValue:`id`,filter:``,class:`w-full`,placeholder:`Select Deployments`},null,8,[`modelValue`,`options`])])])]),_:1}),l(k,{outline:``,toggleable:``,header:`Quick Filters (Current Results)`,"box-shadow":``},{header:c(()=>[l(v(L),{class:`!w-[40rem] ml-8`},{default:c(()=>[l(v(B),{class:`flex-1`},{default:c(()=>[l(v(E),{modelValue:I.quick.global,"onUpdate:modelValue":i[5]||=e=>I.quick.global=e,placeholder:`Search...`,class:`w-full`},null,8,[`modelValue`])]),_:1}),l(v(B),null,{default:c(()=>[u(`div`,{style:s({backgroundColor:I.quickOptions.caseSensitive?`var(--p-slate-300)`:`var(--p-slate-100)`}),onClick:i[6]||=e=>I.quickOptions.caseSensitive=!I.quickOptions.caseSensitive,class:`w-full h-full text-color-slate-600 flex items-center justify-center cursor-pointer select-none`,title:`Case Sensitive`},` Aa `,4)]),_:1}),l(v(B),null,{default:c(()=>[u(`div`,{style:s({backgroundColor:I.quickOptions.wholeWord?`var(--p-slate-300)`:`var(--p-slate-100)`}),onClick:i[7]||=e=>I.quickOptions.wholeWord=!I.quickOptions.wholeWord,class:`w-full h-full text-color-slate-600 flex items-center justify-center cursor-pointer select-none`,title:`Whole Word`},` "W" `,4)]),_:1}),l(v(B),null,{default:c(()=>[u(`div`,{style:s({backgroundColor:I.quickOptions.regex?`var(--p-slate-300)`:`var(--p-slate-100)`}),onClick:i[8]||=e=>I.quickOptions.regex=!I.quickOptions.regex,class:`w-full h-full text-color-slate-600 flex items-center justify-center cursor-pointer select-none`,title:`Regex`},` .* `,4)]),_:1})]),_:1})]),default:c(()=>[u(`div`,re,[u(`div`,null,[i[19]||=u(`label`,{class:`font-bold block mb-2`},`Start Datetime`,-1),l(v(w),{modelValue:I.quick.startDate,"onUpdate:modelValue":i[9]||=e=>I.quick.startDate=e,showTime:``,hourFormat:`24`,fluid:``},null,8,[`modelValue`])]),u(`div`,null,[i[20]||=u(`label`,{class:`font-bold block mb-2`},`End Datetime`,-1),l(v(w),{modelValue:I.quick.endDate,"onUpdate:modelValue":i[10]||=e=>I.quick.endDate=e,showTime:``,hourFormat:`24`,fluid:``},null,8,[`modelValue`])]),u(`div`,null,[i[21]||=u(`label`,{class:`font-bold block mb-2`},`Script Types`,-1),l(v(T),{modelValue:I.quick.scriptTypes,"onUpdate:modelValue":i[11]||=e=>I.quick.scriptTypes=e,options:S.value,optionLabel:`label`,optionValue:`id`,filter:``,class:`w-full`},null,8,[`modelValue`,`options`])]),u(`div`,null,[i[22]||=u(`label`,{class:`font-bold block mb-2`},`Log Levels`,-1),l(v(T),{modelValue:I.quick.logLevels,"onUpdate:modelValue":i[12]||=e=>I.quick.logLevels=e,options:C,optionLabel:`label`,optionValue:`id`,class:`w-full`},null,8,[`modelValue`])])])]),_:1}),l(v(D),{severity:`info`,value:`${W.value.length} Limited to 6000 for performance reasons.`,class:`w-fit`},null,8,[`value`]),l(N,{flex:``,direction:`column`,autoHeight:``,outlined:``,elevated:``,style:s({height:`${e.vhOffset}vh`})},{default:c(({contentHeight:e})=>[l(P,{rows:W.value,height:`${e}px`,loading:n.value,"search-placeholder":`Search logs...`,collapsible:``,"collapsible-key":`log-search-view`,"auto-row-height":!0},{loading:c(()=>[u(`div`,ie,[l(O)])]),empty:c(()=>[...i[23]||=[u(`div`,{class:`flex flex-col items-center justify-center p-8 gap-4`},[u(`i`,{class:`pi pi-inbox text-4xl text-[var(--p-slate-400)]`}),u(`p`,{class:`text-[var(--p-slate-500)]`},`No logs found.`)],-1)]]),default:c(()=>[l(F,{label:`Id`,field:`id`,width:`1fr`}),l(F,{label:`Date / Time`,field:`datetime`,width:`180px`},{default:c(({value:e})=>[f(r(G(e)),1)]),_:1}),l(F,{label:`Title`,field:`title`,width:`1fr`}),l(F,{label:`Level`,field:`level`,width:`100px`}),l(F,{label:`Script Type`,field:`scriptType`,width:`150px`}),l(F,{label:`Script`,field:`scriptName`,width:`1fr`,"context-menu":V}),l(F,{label:`Deployment`,field:`deploymentName`,width:`1fr`,"context-menu":H}),l(F,{label:`Message`,field:`message`,width:`2fr`})]),_:1},8,[`rows`,`height`,`loading`])]),_:1},8,[`style`])],64))}}),[[`__scopeId`,`data-v-ab4f5e47`]]);export{ae as default};