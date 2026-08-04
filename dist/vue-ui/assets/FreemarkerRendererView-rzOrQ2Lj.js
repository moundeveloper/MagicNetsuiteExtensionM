import{Ft as e,I as t,J as n,P as r,Y as i,_ as a,c as o,d as s,g as c,i as l,j as u,l as ee,ot as d,pt as f,s as p,t as te,u as m,y as h}from"./_plugin-vue_export-helper-DAFnlxWz.js";import{c as ne}from"./runtime-dom.esm-bundler-v-CUawBb.js";import"./basecomponent-CJ747krd.js";import"./service-C_x5nE-v.js";import{t as re}from"./inputtext-C2EVA17r.js";import"./import-wrapper-prod-CnvY9lw1.js";import{I as g,P as _,_ as v,at as ie,q as y,s as ae,y as b}from"./main-DVaY_Hz9.js";import"./estree-DJje_-BP.js";import"./editor.api-DYq6exN2.js";import"./monaco.contribution-DM5S_-N_.js";import{t as oe}from"./MCard-CccaYS96.js";import{t as se}from"./MExpandableSidebar-DYKYwOIL.js";import{t as ce}from"./MonacoCodeEditor-CzTEvJUO.js";import{t as le}from"./ServerComponentsPanel-DHe1Ok7e.js";var ue=[`disabled`,`title`],de={class:`sidebar-section`},fe={class:`flex-1 text-left`},pe={class:`sidebar-section`},me={class:`context-mode-grid`},he={class:`flex gap-2`},ge={key:0,class:`text-xs text-slate-500`},_e={key:1,class:`text-xs text-red-500`},ve={key:0,class:`sidebar-section`},ye={class:`section-title-row`},be={class:`history-list`},xe=[`title`,`onClick`],Se={class:`sidebar-section`},Ce={class:`sidebar-section`},we={class:`workspace`},Te={class:`pane`},Ee={class:`pane`},De={class:`pane-toolbar`},Oe={key:0,class:`muted`},ke={key:0,class:`render-error`},Ae={key:1,class:`preview-empty`},je=[`src`],x=`freemarkerRendererTemplate`,S=`freemarkerRendererContextMode`,C=`freemarkerRendererState`,w=`freemarkerRendererHistory`,Me=8,T=`<?xml version="1.0"?>
<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
<pdf>
  <head>
    <style>
      body { font-size: 10pt; }
      table { font-size: 9pt; table-layout: fixed; width: 100%; }
      th { font-weight: bold; font-size: 8pt; padding: 6px; background-color: #e3e3e3; color: #333333; }
      td { padding: 4px 6px; }
      .title { font-size: 24pt; }
    </style>
  </head>
  <body size="Letter">
    <table>
      <tr>
        <td><span class="title">FreeMarker Preview</span></td>
        <td align="right">\${.now?string("yyyy-MM-dd HH:mm:ss")}</td>
      </tr>
    </table>
    <br />
    <table>
      <tr>
        <th>Example</th>
        <th>Value</th>
      </tr>
      <#list ["One", "Two", "Three"] as row>
        <tr>
          <td>\${row}</td>
          <td>\${row_index + 1}</td>
        </tr>
      </#list>
    </table>
  </body>
</pdf>`,Ne=`<?xml version="1.0"?>
<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
<pdf>
  <head>
    <style>
      table { font-size: 9pt; table-layout: fixed; width: 100%; }
      th { font-weight: bold; font-size: 8pt; padding: 6px; background-color: #e3e3e3; color: #333333; }
      td { padding: 4px 6px; }
      b { font-weight: bold; color: #333333; }
    </style>
  </head>
  <body size="Letter">
    <table style="width: 100%; font-size: 10pt;">
      <tr>
        <td>
          <span style="font-size: 20pt;">\${record@title}</span>
        </td>
      </tr>
    </table>
    <br />
    <table>
      <tr>
        <td><b>\${record.id@label}</b></td>
        <td>\${record.id}</td>
        <td><b>\${record.name@label}</b></td>
        <td>\${record.name}</td>
      </tr>
      <tr>
        <td><b>\${record.externalid@label}</b></td>
        <td>\${record.externalid}</td>
        <td><b>\${record.isinactive@label}</b></td>
        <td>\${record.isinactive}</td>
      </tr>
    </table>
    <#if record.usernotes?has_content>
      <br />
      <table>
        <#list record.usernotes as note>
          <#if note_index == 0>
            <thead>
              <tr>
                <th>\${note.title@label}</th>
                <th>\${note.note@label}</th>
                <th>\${note.notedate@label}</th>
              </tr>
            </thead>
          </#if>
          <tr>
            <td>\${note.title}</td>
            <td>\${note.note}</td>
            <td>\${note.notedate}</td>
          </tr>
        </#list>
      </table>
    </#if>
  </body>
</pdf>`,Pe=`<?xml version="1.0"?>
<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
<pdf>
  <head>
    <style>
      table { font-size: 9pt; table-layout: fixed; width: 100%; }
      th { font-weight: bold; font-size: 8pt; padding: 6px; background-color: #e3e3e3; color: #333333; }
      td { padding: 4px 6px; }
      .title { font-size: 24pt; }
      .total { font-size: 18pt; background-color: #e3e3e3; }
    </style>
  </head>
  <body size="Letter">
    <table>
      <tr>
        <td><span class="title">\${record@title}</span></td>
        <td align="right">#\${record.tranid}<br />\${record.trandate}</td>
      </tr>
    </table>
    <br />
    <table>
      <tr>
        <th>\${record.entity@label}</th>
        <th>\${record.trandate@label}</th>
        <th>\${record.total@label}</th>
      </tr>
      <tr>
        <td>\${record.entity}</td>
        <td>\${record.trandate}</td>
        <td class="total" align="right">\${record.total}</td>
      </tr>
    </table>
    <#if record.item?has_content>
      <br />
      <table>
        <#list record.item as item>
          <#if item_index == 0>
            <thead>
              <tr>
                <th>\${item.quantity@label}</th>
                <th>\${item.item@label}</th>
                <th>\${item.rate@label}</th>
                <th>\${item.amount@label}</th>
              </tr>
            </thead>
          </#if>
          <tr>
            <td>\${item.quantity}</td>
            <td>\${item.item}<br />\${item.description}</td>
            <td align="right">\${item.rate}</td>
            <td align="right">\${item.amount}</td>
          </tr>
        </#list>
      </table>
    </#if>
  </body>
</pdf>`,E=te(h({__name:`FreemarkerRendererView`,setup(te){let h=T,E={cashsale:`CashSale`,creditmemo:`CustCred`,customerdeposit:`CustDep`,customerpayment:`CustPymt`,estimate:`Estimate`,invoice:`CustInvc`,itemfulfillment:`ItemShip`,journalentry:`Journal`,opportunity:`Opprtnty`,purchaseorder:`PurchOrd`,returnauthorization:`RtnAuth`,salesorder:`SalesOrd`,vendorbill:`VendBill`,vendorcredit:`VendCred`},Fe=[{id:`estimate`,name:`Estimate`},{id:`salesorder`,name:`Sales Order`},{id:`invoice`,name:`Invoice`},{id:`cashsale`,name:`Cash Sale`},{id:`creditmemo`,name:`Credit Memo`},{id:`customerpayment`,name:`Customer Payment`},{id:`purchaseorder`,name:`Purchase Order`},{id:`vendorbill`,name:`Vendor Bill`},{id:`itemfulfillment`,name:`Item Fulfillment`},{id:`journalentry`,name:`Journal Entry`},{id:`opportunity`,name:`Opportunity`}],D=d(h),O=d(``),k=d(``),A=d(!1),j=d(``),Ie=ie(),M=d(`freestyle`),N=d([]),P=d(null),F=d(null),I=d(``),L=d([]),R=d(!1),z=d(!1),B=d(``),V=p({get:()=>P.value?.id||null,set:e=>{P.value=G.value.find(t=>t.id===String(e||``))||null,F.value=null,L.value=[],P.value&&$()}}),H=p({get:()=>F.value?.id||null,set:e=>{F.value=L.value.find(t=>t.id===String(e||``))||null}}),U=d(null),W=d([]),G=p(()=>M.value===`transaction`?Fe:N.value),K=(e,t)=>{if(!e)return t;try{return JSON.parse(e)}catch{return t}},Le=()=>({contextMode:M.value,recordType:P.value,record:F.value,recordSearch:I.value,renderedPdfUrl:O.value,lastRenderedAt:j.value}),q=()=>{try{localStorage.setItem(C,JSON.stringify(Le())),localStorage.setItem(S,M.value)}catch{}},Re=()=>{try{localStorage.setItem(w,JSON.stringify(W.value))}catch{let e=W.value.map(e=>({...e,renderedPdfUrl:``}));localStorage.setItem(w,JSON.stringify(e))}},ze=()=>{if(M.value===`freestyle`)return`Freestyle template`;let e=P.value?.name||P.value?.id||`Record`,t=F.value?.label||F.value?.id||``;return`${e}${t?` #${t}`:``}`},Be=()=>{let e=Le(),t={...e,id:`${Date.now()}:${e.recordType?.id??`freestyle`}:${e.record?.id??`none`}`,title:ze(),template:D.value,renderedAt:Date.now(),recordLabel:e.record?.label||e.record?.id||``};W.value=[t,...W.value.filter(e=>e.template!==t.template||e.contextMode!==t.contextMode||e.recordType?.id!==t.recordType?.id||e.record?.id!==t.record?.id)].slice(0,Me),Re()},Ve=e=>{M.value=e.contextMode,D.value=e.template,P.value=e.recordType,F.value=e.record,I.value=e.recordSearch||``,L.value=e.record?[e.record]:[],O.value=e.renderedPdfUrl||``,j.value=e.lastRenderedAt||J(e.renderedAt),k.value=``,q()},He=()=>{W.value=[],localStorage.removeItem(w)},J=e=>{let t=new Date(e);return Number.isNaN(t.getTime())?`recently`:t.toLocaleString()},Y=async()=>{if(!D.value.trim()){k.value=`Template is empty.`;return}if(M.value!==`freestyle`&&(!P.value||!F.value)){k.value=`Select a record type and record, or switch to Freestyle.`;return}A.value=!0,k.value=``;try{let e=await b(_.RENDER_FREEMARKER_TEMPLATE,{template:D.value,recordType:M.value===`freestyle`?void 0:P.value?.id,recordId:M.value===`freestyle`?void 0:F.value?.id},v.NORMAL),t=e?.message||e;if(!t?.success){k.value=t?.error||`Template rendering failed.`;return}O.value=t.pdf?`data:${t.mimeType||`application/pdf`};base64,${t.pdf}`:``,j.value=new Date().toLocaleTimeString(),q(),Be(),await U.value?.check()}catch(e){k.value=e?.message||String(e),Ie.add({severity:`error`,summary:`Render Failed`,detail:k.value,life:5e3})}finally{A.value=!1}},Ue=()=>{window.open(`https://freemarker.apache.org/docs/index.html`,`_blank`)},We=()=>{ae(`/template-studio`,{label:`Template Studio`,reuseExisting:!0})},X=e=>{M.value=e,P.value=null,F.value=null,L.value=[],B.value=``,localStorage.setItem(S,e),q(),D.value=e===`transaction`?Pe:e===`customrecord`?Ne:T,e===`customrecord`&&N.value.length===0&&Z()},Ge=e=>{let t=String(e.id??e.ID??e.scriptId??``).trim(),n=String(e.name??e.Name??t).trim();return!t||!n||!t.toLowerCase().startsWith(`customrecord`)?null:{id:t.toLowerCase(),name:n}},Z=async()=>{R.value=!0,B.value=``;try{let e=await b(_.GET_ALL_RECORD_TYPES);N.value=(Array.isArray(e.message)?e.message:[]).map(e=>Ge(e)).filter(e=>e!==null).sort((e,t)=>e.name.localeCompare(t.name))}catch(e){B.value=e?.message||String(e)}finally{R.value=!1}},Ke=e=>e.replace(/'/g,`''`),qe=e=>{let t=e?.message;return Array.isArray(t)?t:Array.isArray(t?.results)?t.results:[]},Je=async(e,t=100)=>{let n=await b(_.RUN_SUITEQL_QUERY,{sql:e,limit:t},v.NORMAL);return qe(n)},Ye=e=>/^\d+$/.test(e.trim()),Q=e=>{let t=I.value.trim();if(!t)return``;let n=[];Ye(t)&&n.push(`id = ${Number(t)}`);for(let r of e)n.push(`LOWER(${r}) LIKE LOWER('%${Ke(t)}%')`);return n.length?` AND (${n.join(` OR `)})`:``},Xe=e=>e.map(e=>{let t=String(e.id??e.ID??``),n=String(e.name??e.entityid??e.altname??e.tranid??e.scriptid??``).trim()||`#${t}`,r=Object.entries(e).filter(([e,t])=>e.toLowerCase()!==`id`&&t!=null&&t!==``).slice(0,3).map(([e,t])=>`${e}: ${String(t)}`).join(` | `);return{id:t,label:n,meta:r,raw:e}}).filter(e=>e.id),Ze=e=>{let t=E[e];if(t)return[`SELECT id, tranid, BUILTIN.DF(entity) AS entity, trandate FROM transaction WHERE type = '${t}'${Q([`tranid`])} ORDER BY id DESC`];let n=e.replace(/[^a-z0-9_]/gi,``);return[`SELECT id, name FROM ${n} WHERE 1 = 1${Q([`name`])} ORDER BY id DESC`,`SELECT id, entityid, altname FROM ${n} WHERE 1 = 1${Q([`entityid`,`altname`])} ORDER BY id DESC`,`SELECT id, scriptid, name FROM ${n} WHERE 1 = 1${Q([`scriptid`,`name`])} ORDER BY id DESC`,`SELECT id FROM ${n} ORDER BY id DESC`].map(e=>e.replace(/\s+/g,` `).trim())},$=async()=>{if(P.value){z.value=!0,B.value=``,F.value=null;try{let e=[],t=``;for(let n of Ze(P.value.id))try{if(e=await Je(n,100),e.length>0||n.includes(`SELECT id FROM`))break}catch(e){t=e?.message||String(e)}e.length===0&&t&&(B.value=t),L.value=Xe(e)}finally{z.value=!1}}};return n(D,e=>{localStorage.setItem(x,e),q()}),n(M,()=>{G.value.includes(P.value)||(P.value=null),q()}),n([P,F,I,O],()=>{q()}),u(async()=>{let e=localStorage.getItem(x);e&&(D.value=e),W.value=K(localStorage.getItem(w),[]);let t=K(localStorage.getItem(C),{}),n=t.contextMode||localStorage.getItem(S);(n===`freestyle`||n===`transaction`||n===`customrecord`)&&(M.value=n),await Z(),t.recordType&&(P.value=t.recordType),t.record&&(F.value=t.record,L.value=[t.record]),t.recordSearch&&(I.value=t.recordSearch),t.renderedPdfUrl&&(O.value=t.renderedPdfUrl),t.lastRenderedAt&&(j.value=t.lastRenderedAt)}),(n,u)=>(r(),ee(oe,{flex:``,autoHeight:``,direction:`row`,gap:`0.5`,padding:``,outlined:``,elevated:``,style:{height:`90vh`}},{default:i(()=>[a(se,null,{collapsed:i(()=>[o(`button`,{class:`p-2 rounded bg-slate-600 hover:bg-slate-500 transition-colors text-[var(--p-slate-50)]`,disabled:A.value,title:A.value?`Rendering...`:`Render`,onClick:Y},[...u[7]||=[o(`i`,{class:`pi pi-play text-sm`},null,-1)]],8,ue)]),default:i(()=>[o(`div`,de,[u[11]||=o(`h4`,null,`Actions`,-1),a(f(y),{class:`w-full`,severity:`secondary`,outlined:``,onClick:We,title:`Open collaborative Template Studio`},{default:i(()=>[...u[8]||=[o(`i`,{class:`pi pi-sparkles font-medium`},null,-1),o(`span`,{class:`flex-1 text-left`},`Template Studio`,-1)]]),_:1}),a(f(y),{class:`w-full`,loading:A.value,disabled:A.value,onClick:Y,title:`Render (Ctrl+Enter)`},{default:i(()=>[u[9]||=o(`i`,{class:`pi pi-play font-medium`},null,-1),o(`span`,fe,e(A.value?`Rendering...`:`Render`),1),u[10]||=o(`kbd`,{class:`render-kbd`},`Ctrl+↵`,-1)]),_:1},8,[`loading`,`disabled`])]),o(`div`,pe,[u[15]||=o(`h4`,null,`Record Context`,-1),o(`div`,me,[a(f(y),{size:`small`,severity:M.value===`freestyle`?`primary`:`secondary`,outlined:M.value!==`freestyle`,onClick:u[0]||=e=>X(`freestyle`)},{default:i(()=>[...u[12]||=[c(` Freestyle `,-1)]]),_:1},8,[`severity`,`outlined`]),a(f(y),{size:`small`,severity:M.value===`transaction`?`primary`:`secondary`,outlined:M.value!==`transaction`,onClick:u[1]||=e=>X(`transaction`)},{default:i(()=>[...u[13]||=[c(` Transaction `,-1)]]),_:1},8,[`severity`,`outlined`]),a(f(y),{size:`small`,severity:M.value===`customrecord`?`primary`:`secondary`,outlined:M.value!==`customrecord`,onClick:u[2]||=e=>X(`customrecord`)},{default:i(()=>[...u[14]||=[c(` Custom `,-1)]]),_:1},8,[`severity`,`outlined`])]),M.value===`freestyle`?m(``,!0):(r(),s(l,{key:0},[a(g,{modelValue:V.value,"onUpdate:modelValue":u[3]||=e=>V.value=e,options:G.value,"option-label":`name`,"option-value":`id`,placeholder:`Record type`,size:`small`,class:`w-full`,loading:R.value,searchable:``},null,8,[`modelValue`,`options`,`loading`]),o(`div`,he,[a(f(re),{modelValue:I.value,"onUpdate:modelValue":u[4]||=e=>I.value=e,size:`small`,class:`flex-1 min-w-0`,placeholder:`Search records`,onKeydown:ne($,[`enter`])},null,8,[`modelValue`]),a(f(y),{size:`small`,icon:`pi pi-search`,loading:z.value,onClick:$},null,8,[`loading`])]),a(g,{modelValue:H.value,"onUpdate:modelValue":u[5]||=e=>H.value=e,options:L.value,"option-label":`label`,"option-value":`id`,placeholder:`Record`,size:`small`,class:`w-full`,loading:z.value,searchable:``},null,8,[`modelValue`,`options`,`loading`]),F.value?(r(),s(`div`,ge,e(F.value.meta||`ID: ${F.value.id}`),1)):m(``,!0)],64)),B.value?(r(),s(`div`,_e,e(B.value),1)):m(``,!0)]),W.value.length?(r(),s(`div`,ve,[o(`div`,ye,[u[16]||=o(`h4`,null,`Recent Prints`,-1),a(f(y),{size:`small`,severity:`secondary`,text:``,icon:`pi pi-trash`,title:`Clear print history`,onClick:He})]),o(`div`,be,[(r(!0),s(l,null,t(W.value,t=>(r(),s(`button`,{key:t.id,type:`button`,class:`history-entry`,title:t.title,onClick:e=>Ve(t)},[o(`span`,null,[o(`strong`,null,e(t.title),1),o(`small`,null,e(t.recordLabel||t.contextMode)+` · `+e(J(t.renderedAt)),1)]),u[17]||=o(`i`,{class:`pi pi-history`},null,-1)],8,xe))),128))])])):m(``,!0),o(`div`,Se,[a(le,{ref_key:`serverComponentsPanelRef`,ref:U,title:`Server`,"show-all-ready":!1,"show-deploy":!1,"auto-check":``},null,512)]),o(`div`,Ce,[u[19]||=o(`h4`,null,`Reference`,-1),a(f(y),{size:`small`,severity:`secondary`,outlined:``,class:`w-full`,onClick:Ue},{default:i(()=>[...u[18]||=[o(`i`,{class:`pi pi-external-link`},null,-1),o(`span`,{class:`flex-1 text-left`},`FreeMarker Docs`,-1)]]),_:1})])]),_:1}),o(`div`,we,[o(`div`,Te,[u[20]||=o(`div`,{class:`pane-toolbar`},[o(`span`,null,`Template`),o(`span`,{class:`muted`},`Advanced PDF/HTML FreeMarker`)],-1),a(ce,{modelValue:D.value,"onUpdate:modelValue":u[6]||=e=>D.value=e,language:`xml`,readonly:A.value,config:{autoSizing:!0,minimap:!0,validateTags:!1},onCtrlEnter:Y},null,8,[`modelValue`,`readonly`])]),o(`div`,Ee,[o(`div`,De,[u[21]||=o(`span`,null,`PDF Preview`,-1),j.value?(r(),s(`span`,Oe,e(j.value),1)):m(``,!0)]),k.value?(r(),s(`div`,ke,e(k.value),1)):O.value?(r(),s(`iframe`,{key:2,class:`render-frame`,title:`Rendered FreeMarker PDF`,src:O.value},null,8,je)):(r(),s(`div`,Ae,` Run the template to generate a PDF preview. `))])])]),_:1}))}}),[[`__scopeId`,`data-v-994b43c6`]]);export{E as default};