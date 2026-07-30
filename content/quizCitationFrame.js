(()=>{(()=>{let p="#magic-netsuite-quiz=";if(!window.location.hash.startsWith(p))return;let c=(t,n="")=>{window.parent.postMessage({source:"magic-netsuite-quiz-citation",status:t,detail:n},"*")},h=t=>String(t||"").replace(/!\[([^\]]*)\]\([^)]+\)/g,"$1").replace(/\[([^\]]+)\]\([^)]+\)/g,"$1").replace(/(`+)([\s\S]*?)\1/g,"$2").replace(/\*\*([^*]+)\*\*/g,"$1").replace(/__([^_]+)__/g,"$1").replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,;:!?])/g,"$1$2").replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,;:!?])/g,"$1$2").trim().replace(/^"([\s\S]*)"$/,"$1").replace(/^“([\s\S]*)”$/,"$1").replace(/^'([\s\S]*)'$/,"$1").replace(/^‘([\s\S]*)’$/,"$1"),u=t=>{let n=document.createTreeWalker(t,NodeFilter.SHOW_TEXT,{acceptNode(i){let o=i.parentElement;return!o||["SCRIPT","STYLE","NOSCRIPT"].includes(o.tagName)?NodeFilter.FILTER_REJECT:i.nodeValue?.trim()?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP}}),e=[],r="",a=!0,l;for(;l=n.nextNode();){let i=l.nodeValue||"";for(let o=0;o<i.length;o+=1){let s=i[o];/\s/.test(s)?(!a&&r&&(r+=" ",e.push({node:l,offset:o})),a=!0):(r+=s,e.push({node:l,offset:o}),a=!1)}}return r.endsWith(" ")&&(r=r.slice(0,-1),e.pop()),{normalized:r,positions:e}},m=t=>{let n=t,e=n.parentElement;for(;e&&([...e.children].forEach(a=>{a!==n&&a.style.setProperty("display","none","important")}),e!==document.body);)e.style.setProperty("min-width","0","important"),e.style.setProperty("max-width","100%","important"),e.style.setProperty("width","100%","important"),e.style.setProperty("margin","0","important"),e.style.setProperty("padding","0","important"),e.style.setProperty("border","0","important"),e.style.setProperty("background","transparent","important"),n=e,e=e.parentElement;let r=document.createElement("style");r.id="magic-netsuite-quiz-citation-style",r.textContent=`
      html, body {
        min-width: 0 !important;
        max-width: 100% !important;
      }
      #helpcenter_content,
      #helpcenter_body {
        height: 100% !important;
      }
      #nshelp a {
        pointer-events: none !important;
        color: inherit !important;
        cursor: text !important;
      }
      #nshelp .nshelp_relatedtopics,
      #nshelp .nshelp_navheader,
      #nshelp #nshelp_footer,
      #nshelp #helpcenter_feedback,
      .nshelp_relatedtopics,
      .nshelp_navheader,
      #nshelp_footer,
      #helpcenter_feedback {
        display: none !important;
      }
      ::highlight(magic-netsuite-citation) {
        color: #7c2d12;
        background: #fde68a;
        text-decoration: underline;
        text-decoration-color: #f59e0b;
        text-decoration-thickness: 2px;
      }
      mark[data-magic-netsuite-citation] {
        color: #7c2d12 !important;
        background: #fde68a !important;
        outline: 2px solid #f59e0b !important;
        scroll-margin-block: 48px;
      }
    `,document.head.appendChild(r)},g=t=>{t.querySelectorAll("a").forEach(e=>{e.setAttribute("aria-disabled","true"),e.setAttribute("tabindex","-1")});let n=e=>{let r=e.target instanceof Element?e.target.closest("a"):null;!r||!t.contains(r)||(e.preventDefault(),e.stopImmediatePropagation())};document.addEventListener("click",n,!0),document.addEventListener("auxclick",n,!0),document.addEventListener("keydown",e=>{e.key==="Enter"&&n(e)},!0)},f=()=>{document.querySelectorAll(".nshelp_relatedtopics, .nshelp_navheader, #nshelp_footer, #helpcenter_feedback").forEach(t=>t.remove())},y=(t,n)=>{let e=h(n).trim().replace(/\s+/g," ");if(!e)return null;let{normalized:r,positions:a}=u(t),l=r.toLocaleLowerCase().indexOf(e.toLocaleLowerCase());if(l<0)return null;let i=a[l],o=a[l+e.length-1];if(!i||!o)return null;let s=document.createRange();if(s.setStart(i.node,i.offset),s.setEnd(o.node,o.offset+1),globalThis.CSS?.highlights&&typeof globalThis.Highlight=="function")return CSS.highlights.set("magic-netsuite-citation",new Highlight(s)),{range:s,target:i.node.parentElement||t};let d=document.createElement("mark");return d.dataset.magicNetsuiteCitation="true",d.appendChild(s.extractContents()),s.insertNode(d),{range:null,target:d}},E=({range:t,target:n})=>{if(n.scrollIntoView({block:"center",inline:"nearest",behavior:"instant"}),!t)return;let e=t.getBoundingClientRect();!e.width&&!e.height||window.scrollBy({top:e.top-window.innerHeight*.35,behavior:"instant"})};try{let t=decodeURIComponent(window.location.hash.slice(p.length)),n=document.getElementById("nshelp");if(!n){c("error","The NetSuite page did not contain documentation.");return}m(n),f(),g(n);let e=y(n,t);if(!e){c("error","The cited quote was not found inside the documentation.");return}let r=()=>E(e);requestAnimationFrame(()=>{r(),c("ready"),window.setTimeout(r,150),window.setTimeout(r,700)})}catch(t){c("error",t instanceof Error?t.message:"The citation reader could not prepare this page.")}})();})();
