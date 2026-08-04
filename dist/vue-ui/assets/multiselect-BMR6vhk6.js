import{B as e,E as t,Ft as n,I as r,L as i,Mt as a,Nt as o,P as s,R as c,X as l,Y as u,_ as d,c as f,d as p,g as m,i as h,l as g,m as _,u as v,z as y}from"./_plugin-vue_export-helper-DAFnlxWz.js";import{t as b}from"./runtime-dom.esm-bundler-v-CUawBb.js";import{B as x,Et as S,M as C,T as ee,U as w,W as T,_ as E,bt as D,et as O,lt as k,n as A,nt as j,rt as M,t as N,tt as P,ut as F,wt as I,x as te,xt as ne}from"./basecomponent-CJ747krd.js";import{a as re,i as ie,n as ae,o as oe,r as se,t as ce}from"./inputicon-CzgWme0G.js";import{n as le,t as ue}from"./inputtext-C2EVA17r.js";import{t as de}from"./checkbox-DB7VhxGr.js";import{r as fe}from"./api-q9O50XRw.js";import{$ as L,K as R,Q as z,X as B,Y as V,Z as pe,ct as H,nt as me}from"./main-CQkMK8rK.js";var he=A.extend({name:`chip`,style:`
    .p-chip {
        display: inline-flex;
        align-items: center;
        background: dt('chip.background');
        color: dt('chip.color');
        border-radius: dt('chip.border.radius');
        padding-block: dt('chip.padding.y');
        padding-inline: dt('chip.padding.x');
        gap: dt('chip.gap');
    }

    .p-chip-icon {
        color: dt('chip.icon.color');
        font-size: dt('chip.icon.size');
        width: dt('chip.icon.size');
        height: dt('chip.icon.size');
    }

    .p-chip-image {
        border-radius: 50%;
        width: dt('chip.image.width');
        height: dt('chip.image.height');
        margin-inline-start: calc(-1 * dt('chip.padding.y'));
    }

    .p-chip:has(.p-chip-remove-icon) {
        padding-inline-end: dt('chip.padding.y');
    }

    .p-chip:has(.p-chip-image) {
        padding-block-start: calc(dt('chip.padding.y') / 2);
        padding-block-end: calc(dt('chip.padding.y') / 2);
    }

    .p-chip-remove-icon {
        cursor: pointer;
        font-size: dt('chip.remove.icon.size');
        width: dt('chip.remove.icon.size');
        height: dt('chip.remove.icon.size');
        color: dt('chip.remove.icon.color');
        border-radius: 50%;
        transition:
            outline-color dt('chip.transition.duration'),
            box-shadow dt('chip.transition.duration');
        outline-color: transparent;
    }

    .p-chip-remove-icon:focus-visible {
        box-shadow: dt('chip.remove.icon.focus.ring.shadow');
        outline: dt('chip.remove.icon.focus.ring.width') dt('chip.remove.icon.focus.ring.style') dt('chip.remove.icon.focus.ring.color');
        outline-offset: dt('chip.remove.icon.focus.ring.offset');
    }
`,classes:{root:`p-chip p-component`,image:`p-chip-image`,icon:`p-chip-icon`,label:`p-chip-label`,removeIcon:`p-chip-remove-icon`}}),U={name:`Chip`,extends:{name:`BaseChip`,extends:N,props:{label:{type:[String,Number],default:null},icon:{type:String,default:null},image:{type:String,default:null},removable:{type:Boolean,default:!1},removeIcon:{type:String,default:void 0}},style:he,provide:function(){return{$pcChip:this,$parentInstance:this}}},inheritAttrs:!1,emits:[`remove`],data:function(){return{visible:!0}},methods:{onKeydown:function(e){(e.key===`Enter`||e.key===`Backspace`)&&this.close(e)},close:function(e){this.visible=!1,this.$emit(`remove`,e)}},computed:{dataP:function(){return M({removable:this.removable})}},components:{TimesCircleIcon:B}},ge=[`aria-label`,`data-p`],_e=[`src`];function ve(r,a,o,c,l,u){return l.visible?(s(),p(`div`,t({key:0,class:r.cx(`root`),"aria-label":r.label},r.ptmi(`root`),{"data-p":u.dataP}),[i(r.$slots,`default`,{},function(){return[r.image?(s(),p(`img`,t({key:0,src:r.image},r.ptm(`image`),{class:r.cx(`image`)}),null,16,_e)):r.$slots.icon?(s(),g(e(r.$slots.icon),t({key:1,class:r.cx(`icon`)},r.ptm(`icon`)),null,16,[`class`])):r.icon?(s(),p(`span`,t({key:2,class:[r.cx(`icon`),r.icon]},r.ptm(`icon`)),null,16)):v(``,!0),r.label===null?v(``,!0):(s(),p(`div`,t({key:3,class:r.cx(`label`)},r.ptm(`label`)),n(r.label),17))]}),r.removable?i(r.$slots,`removeicon`,{key:0,removeCallback:u.close,keydownCallback:u.onKeydown},function(){return[(s(),g(e(r.removeIcon?`span`:`TimesCircleIcon`),t({class:[r.cx(`removeIcon`),r.removeIcon],onClick:u.close,onKeydown:u.onKeydown},r.ptm(`removeIcon`)),null,16,[`class`,`onClick`,`onKeydown`]))]}):v(``,!0)],16,ge)):v(``,!0)}U.render=ve;var ye=A.extend({name:`multiselect`,style:`
    .p-multiselect {
        display: inline-flex;
        cursor: pointer;
        position: relative;
        user-select: none;
        background: dt('multiselect.background');
        border: 1px solid dt('multiselect.border.color');
        transition:
            background dt('multiselect.transition.duration'),
            color dt('multiselect.transition.duration'),
            border-color dt('multiselect.transition.duration'),
            outline-color dt('multiselect.transition.duration'),
            box-shadow dt('multiselect.transition.duration');
        border-radius: dt('multiselect.border.radius');
        outline-color: transparent;
        box-shadow: dt('multiselect.shadow');
    }

    .p-multiselect:not(.p-disabled):hover {
        border-color: dt('multiselect.hover.border.color');
    }

    .p-multiselect:not(.p-disabled).p-focus {
        border-color: dt('multiselect.focus.border.color');
        box-shadow: dt('multiselect.focus.ring.shadow');
        outline: dt('multiselect.focus.ring.width') dt('multiselect.focus.ring.style') dt('multiselect.focus.ring.color');
        outline-offset: dt('multiselect.focus.ring.offset');
    }

    .p-multiselect.p-variant-filled {
        background: dt('multiselect.filled.background');
    }

    .p-multiselect.p-variant-filled:not(.p-disabled):hover {
        background: dt('multiselect.filled.hover.background');
    }

    .p-multiselect.p-variant-filled.p-focus {
        background: dt('multiselect.filled.focus.background');
    }

    .p-multiselect.p-invalid {
        border-color: dt('multiselect.invalid.border.color');
    }

    .p-multiselect.p-disabled {
        opacity: 1;
        background: dt('multiselect.disabled.background');
    }

    .p-multiselect-dropdown {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        background: transparent;
        color: dt('multiselect.dropdown.color');
        width: dt('multiselect.dropdown.width');
        border-start-end-radius: dt('multiselect.border.radius');
        border-end-end-radius: dt('multiselect.border.radius');
    }

    .p-multiselect-clear-icon {
        align-self: center;
        color: dt('multiselect.clear.icon.color');
        inset-inline-end: dt('multiselect.dropdown.width');
    }

    .p-multiselect-label-container {
        overflow: hidden;
        flex: 1 1 auto;
        cursor: pointer;
    }

    .p-multiselect-label {
        white-space: nowrap;
        cursor: pointer;
        overflow: hidden;
        text-overflow: ellipsis;
        padding: dt('multiselect.padding.y') dt('multiselect.padding.x');
        color: dt('multiselect.color');
    }

    .p-multiselect-display-chip .p-multiselect-label {
        display: flex;
        align-items: center;
        gap: calc(dt('multiselect.padding.y') / 2);
    }

    .p-multiselect-label.p-placeholder {
        color: dt('multiselect.placeholder.color');
    }

    .p-multiselect.p-invalid .p-multiselect-label.p-placeholder {
        color: dt('multiselect.invalid.placeholder.color');
    }

    .p-multiselect.p-disabled .p-multiselect-label {
        color: dt('multiselect.disabled.color');
    }

    .p-multiselect-label-empty {
        overflow: hidden;
        visibility: hidden;
    }

    .p-multiselect-overlay {
        position: absolute;
        top: 0;
        left: 0;
        background: dt('multiselect.overlay.background');
        color: dt('multiselect.overlay.color');
        border: 1px solid dt('multiselect.overlay.border.color');
        border-radius: dt('multiselect.overlay.border.radius');
        box-shadow: dt('multiselect.overlay.shadow');
        min-width: 100%;
    }

    .p-multiselect-header {
        display: flex;
        align-items: center;
        padding: dt('multiselect.list.header.padding');
    }

    .p-multiselect-header .p-checkbox {
        margin-inline-end: dt('multiselect.option.gap');
    }

    .p-multiselect-filter-container {
        flex: 1 1 auto;
    }

    .p-multiselect-filter {
        width: 100%;
    }

    .p-multiselect-list-container {
        overflow: auto;
    }

    .p-multiselect-list {
        margin: 0;
        padding: 0;
        list-style-type: none;
        padding: dt('multiselect.list.padding');
        display: flex;
        flex-direction: column;
        gap: dt('multiselect.list.gap');
    }

    .p-multiselect-option {
        cursor: pointer;
        font-weight: normal;
        white-space: nowrap;
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        gap: dt('multiselect.option.gap');
        padding: dt('multiselect.option.padding');
        border: 0 none;
        color: dt('multiselect.option.color');
        background: transparent;
        transition:
            background dt('multiselect.transition.duration'),
            color dt('multiselect.transition.duration'),
            border-color dt('multiselect.transition.duration'),
            box-shadow dt('multiselect.transition.duration'),
            outline-color dt('multiselect.transition.duration');
        border-radius: dt('multiselect.option.border.radius');
    }

    .p-multiselect-option:not(.p-multiselect-option-selected):not(.p-disabled).p-focus {
        background: dt('multiselect.option.focus.background');
        color: dt('multiselect.option.focus.color');
    }

    .p-multiselect-option:not(.p-multiselect-option-selected):not(.p-disabled):hover {
        background: dt('multiselect.option.focus.background');
        color: dt('multiselect.option.focus.color');
    }

    .p-multiselect-option.p-multiselect-option-selected {
        background: dt('multiselect.option.selected.background');
        color: dt('multiselect.option.selected.color');
    }

    .p-multiselect-option.p-multiselect-option-selected.p-focus {
        background: dt('multiselect.option.selected.focus.background');
        color: dt('multiselect.option.selected.focus.color');
    }

    .p-multiselect-option-group {
        cursor: auto;
        margin: 0;
        padding: dt('multiselect.option.group.padding');
        background: dt('multiselect.option.group.background');
        color: dt('multiselect.option.group.color');
        font-weight: dt('multiselect.option.group.font.weight');
    }

    .p-multiselect-empty-message {
        padding: dt('multiselect.empty.message.padding');
    }

    .p-multiselect-label .p-chip {
        padding-block-start: calc(dt('multiselect.padding.y') / 2);
        padding-block-end: calc(dt('multiselect.padding.y') / 2);
        border-radius: dt('multiselect.chip.border.radius');
    }

    .p-multiselect-label:has(.p-chip) {
        padding: calc(dt('multiselect.padding.y') / 2) calc(dt('multiselect.padding.x') / 2);
    }

    .p-multiselect-fluid {
        display: flex;
        width: 100%;
    }

    .p-multiselect-sm .p-multiselect-label {
        font-size: dt('multiselect.sm.font.size');
        padding-block: dt('multiselect.sm.padding.y');
        padding-inline: dt('multiselect.sm.padding.x');
    }

    .p-multiselect-sm .p-multiselect-dropdown .p-icon {
        font-size: dt('multiselect.sm.font.size');
        width: dt('multiselect.sm.font.size');
        height: dt('multiselect.sm.font.size');
    }

    .p-multiselect-lg .p-multiselect-label {
        font-size: dt('multiselect.lg.font.size');
        padding-block: dt('multiselect.lg.padding.y');
        padding-inline: dt('multiselect.lg.padding.x');
    }

    .p-multiselect-lg .p-multiselect-dropdown .p-icon {
        font-size: dt('multiselect.lg.font.size');
        width: dt('multiselect.lg.font.size');
        height: dt('multiselect.lg.font.size');
    }

    .p-floatlabel-in .p-multiselect-filter {
        padding-block-start: dt('multiselect.padding.y');
        padding-block-end: dt('multiselect.padding.y');
    }
`,classes:{root:function(e){var t=e.instance,n=e.props;return[`p-multiselect p-component p-inputwrapper`,{"p-multiselect-display-chip":n.display===`chip`,"p-disabled":n.disabled,"p-invalid":t.$invalid,"p-variant-filled":t.$variant===`filled`,"p-focus":t.focused,"p-inputwrapper-filled":t.$filled,"p-inputwrapper-focus":t.focused||t.overlayVisible,"p-multiselect-open":t.overlayVisible,"p-multiselect-fluid":t.$fluid,"p-multiselect-sm p-inputfield-sm":n.size===`small`,"p-multiselect-lg p-inputfield-lg":n.size===`large`}]},labelContainer:`p-multiselect-label-container`,label:function(e){var t=e.instance,n=e.props;return[`p-multiselect-label`,{"p-placeholder":t.label===n.placeholder,"p-multiselect-label-empty":!n.placeholder&&!t.$filled}]},clearIcon:`p-multiselect-clear-icon`,chipItem:`p-multiselect-chip-item`,pcChip:`p-multiselect-chip`,chipIcon:`p-multiselect-chip-icon`,dropdown:`p-multiselect-dropdown`,loadingIcon:`p-multiselect-loading-icon`,dropdownIcon:`p-multiselect-dropdown-icon`,overlay:`p-multiselect-overlay p-component`,header:`p-multiselect-header`,pcFilterContainer:`p-multiselect-filter-container`,pcFilter:`p-multiselect-filter`,listContainer:`p-multiselect-list-container`,list:`p-multiselect-list`,optionGroup:`p-multiselect-option-group`,option:function(e){var t=e.instance,n=e.option,r=e.index,i=e.getItemOptions,a=e.props;return[`p-multiselect-option`,{"p-multiselect-option-selected":t.isSelected(n)&&a.highlightOnSelect,"p-focus":t.focusedOptionIndex===t.getOptionIndex(r,i),"p-disabled":t.isOptionDisabled(n)}]},emptyMessage:`p-multiselect-empty-message`},inlineStyles:{root:function(e){return{position:e.props.appendTo===`self`?`relative`:void 0}}}}),be={name:`BaseMultiSelect`,extends:le,props:{options:Array,optionLabel:null,optionValue:null,optionDisabled:null,optionGroupLabel:null,optionGroupChildren:null,scrollHeight:{type:String,default:`14rem`},placeholder:String,inputId:{type:String,default:null},panelClass:{type:String,default:null},panelStyle:{type:null,default:null},overlayClass:{type:String,default:null},overlayStyle:{type:null,default:null},dataKey:null,showClear:{type:Boolean,default:!1},clearIcon:{type:String,default:void 0},resetFilterOnClear:{type:Boolean,default:!1},filter:Boolean,filterPlaceholder:String,filterLocale:String,filterMatchMode:{type:String,default:`contains`},filterFields:{type:Array,default:null},appendTo:{type:[String,Object],default:`body`},display:{type:String,default:`comma`},selectedItemsLabel:{type:String,default:null},maxSelectedLabels:{type:Number,default:null},selectionLimit:{type:Number,default:null},showToggleAll:{type:Boolean,default:!0},loading:{type:Boolean,default:!1},checkboxIcon:{type:String,default:void 0},dropdownIcon:{type:String,default:void 0},filterIcon:{type:String,default:void 0},loadingIcon:{type:String,default:void 0},removeTokenIcon:{type:String,default:void 0},chipIcon:{type:String,default:void 0},selectAll:{type:Boolean,default:null},resetFilterOnHide:{type:Boolean,default:!1},virtualScrollerOptions:{type:Object,default:null},autoOptionFocus:{type:Boolean,default:!1},autoFilterFocus:{type:Boolean,default:!1},focusOnHover:{type:Boolean,default:!0},highlightOnSelect:{type:Boolean,default:!1},filterMessage:{type:String,default:null},selectionMessage:{type:String,default:null},emptySelectionMessage:{type:String,default:null},emptyFilterMessage:{type:String,default:null},emptyMessage:{type:String,default:null},tabindex:{type:Number,default:0},ariaLabel:{type:String,default:null},ariaLabelledby:{type:String,default:null}},style:ye,provide:function(){return{$pcMultiSelect:this,$parentInstance:this}}};function W(e){"@babel/helpers - typeof";return W=typeof Symbol==`function`&&typeof Symbol.iterator==`symbol`?function(e){return typeof e}:function(e){return e&&typeof Symbol==`function`&&e.constructor===Symbol&&e!==Symbol.prototype?`symbol`:typeof e},W(e)}function G(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(e);t&&(r=r.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),n.push.apply(n,r)}return n}function K(e){for(var t=1;t<arguments.length;t++){var n=arguments[t]==null?{}:arguments[t];t%2?G(Object(n),!0).forEach(function(t){q(e,t,n[t])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):G(Object(n)).forEach(function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(n,t))})}return e}function q(e,t,n){return(t=xe(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function xe(e){var t=Se(e,`string`);return W(t)==`symbol`?t:t+``}function Se(e,t){if(W(e)!=`object`||!e)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var r=n.call(e,t);if(W(r)!=`object`)return r;throw TypeError(`@@toPrimitive must return a primitive value.`)}return(t===`string`?String:Number)(e)}function J(e){return Ee(e)||Te(e)||we(e)||Ce()}function Ce(){throw TypeError(`Invalid attempt to spread non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function we(e,t){if(e){if(typeof e==`string`)return Y(e,t);var n={}.toString.call(e).slice(8,-1);return n===`Object`&&e.constructor&&(n=e.constructor.name),n===`Map`||n===`Set`?Array.from(e):n===`Arguments`||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)?Y(e,t):void 0}}function Te(e){if(typeof Symbol<`u`&&e[Symbol.iterator]!=null||e[`@@iterator`]!=null)return Array.from(e)}function Ee(e){if(Array.isArray(e))return Y(e)}function Y(e,t){(t==null||t>e.length)&&(t=e.length);for(var n=0,r=Array(t);n<t;n++)r[n]=e[n];return r}var X={name:`MultiSelect`,extends:be,inheritAttrs:!1,emits:[`change`,`focus`,`blur`,`before-show`,`before-hide`,`show`,`hide`,`filter`,`selectall-change`],inject:{$pcFluid:{default:null}},outsideClickListener:null,scrollHandler:null,resizeListener:null,overlay:null,list:null,virtualScroller:null,startRangeIndex:-1,searchTimeout:null,searchValue:``,selectOnFocus:!1,data:function(){return{clicked:!1,focused:!1,focusedOptionIndex:-1,filterValue:null,overlayVisible:!1}},watch:{options:function(){this.autoUpdateModel()}},mounted:function(){this.autoUpdateModel()},beforeUnmount:function(){this.unbindOutsideClickListener(),this.unbindResizeListener(),this.scrollHandler&&=(this.scrollHandler.destroy(),null),this.overlay&&=(H.clear(this.overlay),null)},methods:{getOptionIndex:function(e,t){return this.virtualScrollerDisabled?e:t&&t(e).index},getOptionLabel:function(e){return this.optionLabel?I(e,this.optionLabel):e},getOptionValue:function(e){return this.optionValue?I(e,this.optionValue):e},getOptionRenderKey:function(e,t){return this.dataKey?I(e,this.dataKey):this.getOptionLabel(e)+`_${t}`},getHeaderCheckboxPTOptions:function(e){return this.ptm(e,{context:{selected:this.allSelected}})},getCheckboxPTOptions:function(e,t,n,r){return this.ptm(r,{context:{selected:this.isSelected(e),focused:this.focusedOptionIndex===this.getOptionIndex(n,t),disabled:this.isOptionDisabled(e)}})},isOptionDisabled:function(e){return this.maxSelectionLimitReached&&!this.isSelected(e)?!0:this.optionDisabled?I(e,this.optionDisabled):!1},isOptionGroup:function(e){return!!(this.optionGroupLabel&&e.optionGroup&&e.group)},getOptionGroupLabel:function(e){return I(e,this.optionGroupLabel)},getOptionGroupChildren:function(e){return I(e,this.optionGroupChildren)},getAriaPosInset:function(e){var t=this;return(this.optionGroupLabel?e-this.visibleOptions.slice(0,e).filter(function(e){return t.isOptionGroup(e)}).length:e)+1},show:function(e){this.$emit(`before-show`),this.overlayVisible=!0,this.focusedOptionIndex=this.focusedOptionIndex===-1?this.autoOptionFocus?this.findFirstFocusedOptionIndex():this.findSelectedOptionIndex():this.focusedOptionIndex,e&&T(this.$refs.focusInput)},hide:function(e){var t=this,n=function(){t.$emit(`before-hide`),t.overlayVisible=!1,t.clicked=!1,t.focusedOptionIndex=-1,t.searchValue=``,t.resetFilterOnHide&&(t.filterValue=null),e&&T(t.$refs.focusInput)};setTimeout(function(){n()},0)},onFocus:function(e){this.disabled||(this.focused=!0,this.overlayVisible&&(this.focusedOptionIndex=this.focusedOptionIndex===-1?this.autoOptionFocus?this.findFirstFocusedOptionIndex():this.findSelectedOptionIndex():this.focusedOptionIndex,!this.autoFilterFocus&&this.scrollInView(this.focusedOptionIndex)),this.$emit(`focus`,e))},onBlur:function(e){var t,n;this.clicked=!1,this.focused=!1,this.focusedOptionIndex=-1,this.searchValue=``,this.$emit(`blur`,e),(t=(n=this.formField).onBlur)==null||t.call(n)},onKeyDown:function(e){var t=this;if(this.disabled){e.preventDefault();return}var n=e.metaKey||e.ctrlKey;switch(e.code){case`ArrowDown`:this.onArrowDownKey(e);break;case`ArrowUp`:this.onArrowUpKey(e);break;case`Home`:this.onHomeKey(e);break;case`End`:this.onEndKey(e);break;case`PageDown`:this.onPageDownKey(e);break;case`PageUp`:this.onPageUpKey(e);break;case`Enter`:case`NumpadEnter`:case`Space`:this.onEnterKey(e);break;case`Escape`:this.onEscapeKey(e);break;case`Tab`:this.onTabKey(e);break;case`ShiftLeft`:case`ShiftRight`:this.onShiftKey(e);break;default:if(e.code===`KeyA`&&n){var r=this.visibleOptions.filter(function(e){return t.isValidOption(e)}).map(function(e){return t.getOptionValue(e)});this.updateModel(e,r),e.preventDefault();break}!n&&k(e.key)&&(!this.overlayVisible&&this.show(),this.searchOptions(e),e.preventDefault());break}this.clicked=!1},onContainerClick:function(e){this.disabled||this.loading||e.target.tagName===`INPUT`||e.target.getAttribute(`data-pc-section`)===`clearicon`||e.target.closest(`[data-pc-section="clearicon"]`)||((!this.overlay||!this.overlay.contains(e.target))&&(this.overlayVisible?this.hide(!0):this.show(!0)),this.clicked=!0)},onClearClick:function(e){this.updateModel(e,[]),this.resetFilterOnClear&&(this.filterValue=null)},onFirstHiddenFocus:function(e){var t=e.relatedTarget===this.$refs.focusInput?P(this.overlay,`:not([data-p-hidden-focusable="true"])`):this.$refs.focusInput;T(t)},onLastHiddenFocus:function(e){var t=e.relatedTarget===this.$refs.focusInput?ee(this.overlay,`:not([data-p-hidden-focusable="true"])`):this.$refs.focusInput;T(t)},onOptionSelect:function(e,t){var n=this,r=arguments.length>2&&arguments[2]!==void 0?arguments[2]:-1,i=arguments.length>3&&arguments[3]!==void 0?arguments[3]:!1;if(!(this.disabled||this.isOptionDisabled(t))){var a=this.isSelected(t),o=null;o=a?this.d_value.filter(function(e){return!D(e,n.getOptionValue(t),n.equalityKey)}):[].concat(J(this.d_value||[]),[this.getOptionValue(t)]),this.updateModel(e,o),r!==-1&&(this.focusedOptionIndex=r),i&&T(this.$refs.focusInput)}},onOptionMouseMove:function(e,t){this.focusOnHover&&this.changeFocusedOptionIndex(e,t)},onOptionSelectRange:function(e){var t=this,n=arguments.length>1&&arguments[1]!==void 0?arguments[1]:-1,r=arguments.length>2&&arguments[2]!==void 0?arguments[2]:-1;if(n===-1&&(n=this.findNearestSelectedOptionIndex(r,!0)),r===-1&&(r=this.findNearestSelectedOptionIndex(n)),n!==-1&&r!==-1){var i=Math.min(n,r),a=Math.max(n,r),o=this.visibleOptions.slice(i,a+1).filter(function(e){return t.isValidOption(e)}).map(function(e){return t.getOptionValue(e)});this.updateModel(e,o)}},onFilterChange:function(e){var t=e.target.value;this.filterValue=t,this.focusedOptionIndex=-1,this.$emit(`filter`,{originalEvent:e,value:t}),!this.virtualScrollerDisabled&&this.virtualScroller.scrollToIndex(0)},onFilterKeyDown:function(e){switch(e.code){case`ArrowDown`:this.onArrowDownKey(e);break;case`ArrowUp`:this.onArrowUpKey(e,!0);break;case`ArrowLeft`:case`ArrowRight`:this.onArrowLeftKey(e,!0);break;case`Home`:this.onHomeKey(e,!0);break;case`End`:this.onEndKey(e,!0);break;case`Enter`:case`NumpadEnter`:this.onEnterKey(e);break;case`Escape`:this.onEscapeKey(e);break;case`Tab`:this.onTabKey(e,!0);break}},onFilterBlur:function(){this.focusedOptionIndex=-1},onFilterUpdated:function(){this.overlayVisible&&this.alignOverlay()},onOverlayClick:function(e){re.emit(`overlay-click`,{originalEvent:e,target:this.$el})},onOverlayKeyDown:function(e){switch(e.code){case`Escape`:this.onEscapeKey(e);break}},onArrowDownKey:function(e){if(!this.overlayVisible)this.show();else{var t=this.focusedOptionIndex===-1?this.clicked?this.findFirstOptionIndex():this.findFirstFocusedOptionIndex():this.findNextOptionIndex(this.focusedOptionIndex);e.shiftKey&&this.onOptionSelectRange(e,this.startRangeIndex,t),this.changeFocusedOptionIndex(e,t)}e.preventDefault()},onArrowUpKey:function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:!1;if(e.altKey&&!t)this.focusedOptionIndex!==-1&&this.onOptionSelect(e,this.visibleOptions[this.focusedOptionIndex]),this.overlayVisible&&this.hide(),e.preventDefault();else{var n=this.focusedOptionIndex===-1?this.clicked?this.findLastOptionIndex():this.findLastFocusedOptionIndex():this.findPrevOptionIndex(this.focusedOptionIndex);e.shiftKey&&this.onOptionSelectRange(e,n,this.startRangeIndex),this.changeFocusedOptionIndex(e,n),!this.overlayVisible&&this.show(),e.preventDefault()}},onArrowLeftKey:function(e){arguments.length>1&&arguments[1]!==void 0&&arguments[1]&&(this.focusedOptionIndex=-1)},onHomeKey:function(e){if(arguments.length>1&&arguments[1]!==void 0&&arguments[1]){var t=e.currentTarget;e.shiftKey?t.setSelectionRange(0,e.target.selectionStart):(t.setSelectionRange(0,0),this.focusedOptionIndex=-1)}else{var n=e.metaKey||e.ctrlKey,r=this.findFirstOptionIndex();e.shiftKey&&n&&this.onOptionSelectRange(e,r,this.startRangeIndex),this.changeFocusedOptionIndex(e,r),!this.overlayVisible&&this.show()}e.preventDefault()},onEndKey:function(e){if(arguments.length>1&&arguments[1]!==void 0&&arguments[1]){var t=e.currentTarget;if(e.shiftKey)t.setSelectionRange(e.target.selectionStart,t.value.length);else{var n=t.value.length;t.setSelectionRange(n,n),this.focusedOptionIndex=-1}}else{var r=e.metaKey||e.ctrlKey,i=this.findLastOptionIndex();e.shiftKey&&r&&this.onOptionSelectRange(e,this.startRangeIndex,i),this.changeFocusedOptionIndex(e,i),!this.overlayVisible&&this.show()}e.preventDefault()},onPageUpKey:function(e){this.scrollInView(0),e.preventDefault()},onPageDownKey:function(e){this.scrollInView(this.visibleOptions.length-1),e.preventDefault()},onEnterKey:function(e){this.overlayVisible?this.focusedOptionIndex!==-1&&(e.shiftKey?this.onOptionSelectRange(e,this.focusedOptionIndex):this.onOptionSelect(e,this.visibleOptions[this.focusedOptionIndex])):(this.focusedOptionIndex=-1,this.onArrowDownKey(e)),e.preventDefault()},onEscapeKey:function(e){this.overlayVisible&&(this.hide(!0),e.stopPropagation()),e.preventDefault()},onTabKey:function(e){arguments.length>1&&arguments[1]!==void 0&&arguments[1]||(this.overlayVisible&&this.hasFocusableElements()?(T(e.shiftKey?this.$refs.lastHiddenFocusableElementOnOverlay:this.$refs.firstHiddenFocusableElementOnOverlay),e.preventDefault()):(this.focusedOptionIndex!==-1&&this.onOptionSelect(e,this.visibleOptions[this.focusedOptionIndex]),this.overlayVisible&&this.hide(this.filter)))},onShiftKey:function(){this.startRangeIndex=this.focusedOptionIndex},onOverlayEnter:function(e){H.set(`overlay`,e,this.$primevue.config.zIndex.overlay),C(e,{position:`absolute`,top:`0`}),this.alignOverlay(),this.scrollInView(),this.autoFilterFocus&&T(this.$refs.filterInput.$el),this.autoUpdateModel(),this.$attrSelector&&e.setAttribute(this.$attrSelector,``)},onOverlayAfterEnter:function(){this.bindOutsideClickListener(),this.bindScrollListener(),this.bindResizeListener(),this.$emit(`show`)},onOverlayLeave:function(e){e.style.pointerEvents=`none`,this.unbindOutsideClickListener(),this.unbindScrollListener(),this.unbindResizeListener(),this.$emit(`hide`),this.overlay=null},onOverlayAfterLeave:function(e){H.clear(e)},alignOverlay:function(){this.appendTo===`self`?te(this.overlay,this.$el):(this.overlay.style.minWidth=O(this.$el)+`px`,E(this.overlay,this.$el))},bindOutsideClickListener:function(){var e=this;this.outsideClickListener||(this.outsideClickListener=function(t){e.overlayVisible&&e.isOutsideClicked(t)&&e.hide()},document.addEventListener(`click`,this.outsideClickListener,!0))},unbindOutsideClickListener:function(){this.outsideClickListener&&=(document.removeEventListener(`click`,this.outsideClickListener,!0),null)},bindScrollListener:function(){var e=this;this.scrollHandler||=new L(this.$refs.container,function(){e.overlayVisible&&e.hide()}),this.scrollHandler.bindScrollListener()},unbindScrollListener:function(){this.scrollHandler&&this.scrollHandler.unbindScrollListener()},bindResizeListener:function(){var e=this;this.resizeListener||(this.resizeListener=function(){e.overlayVisible&&!x()&&e.hide()},window.addEventListener(`resize`,this.resizeListener))},unbindResizeListener:function(){this.resizeListener&&=(window.removeEventListener(`resize`,this.resizeListener),null)},isOutsideClicked:function(e){return!(this.$el.isSameNode(e.target)||this.$el.contains(e.target)||this.overlay&&this.overlay.contains(e.target))},getLabelByValue:function(e){var t=this,n=(this.optionGroupLabel?this.flatOptions(this.options):this.options||[]).find(function(n){return!t.isOptionGroup(n)&&D(t.getOptionValue(n),e,t.equalityKey)});return this.getOptionLabel(n)},getSelectedItemsLabel:function(){var e=/{(.*?)}/,t=this.selectedItemsLabel||this.$primevue.config.locale.selectionMessage;return e.test(t)?t.replace(t.match(e)[0],this.d_value.length+``):t},onToggleAll:function(e){var t=this;if(this.selectAll!==null)this.$emit(`selectall-change`,{originalEvent:e,checked:!this.allSelected});else{var n=this.allSelected?[]:this.visibleOptions.filter(function(e){return t.isValidOption(e)}).map(function(e){return t.getOptionValue(e)});this.updateModel(e,n)}},removeOption:function(e,t){var n=this;e.stopPropagation();var r=this.d_value.filter(function(e){return!D(e,t,n.equalityKey)});this.updateModel(e,r)},clearFilter:function(){this.filterValue=null},hasFocusableElements:function(){return w(this.overlay,`:not([data-p-hidden-focusable="true"])`).length>0},isOptionMatched:function(e){return this.isValidOption(e)&&typeof this.getOptionLabel(e)==`string`&&this.getOptionLabel(e)?.toLocaleLowerCase(this.filterLocale).startsWith(this.searchValue.toLocaleLowerCase(this.filterLocale))},isValidOption:function(e){return S(e)&&!(this.isOptionDisabled(e)||this.isOptionGroup(e))},isValidSelectedOption:function(e){return this.isValidOption(e)&&this.isSelected(e)},isEquals:function(e,t){return D(e,t,this.equalityKey)},isSelected:function(e){var t=this,n=this.getOptionValue(e);return(this.d_value||[]).some(function(e){return t.isEquals(e,n)})},findFirstOptionIndex:function(){var e=this;return this.visibleOptions.findIndex(function(t){return e.isValidOption(t)})},findLastOptionIndex:function(){var e=this;return F(this.visibleOptions,function(t){return e.isValidOption(t)})},findNextOptionIndex:function(e){var t=this,n=e<this.visibleOptions.length-1?this.visibleOptions.slice(e+1).findIndex(function(e){return t.isValidOption(e)}):-1;return n>-1?n+e+1:e},findPrevOptionIndex:function(e){var t=this,n=e>0?F(this.visibleOptions.slice(0,e),function(e){return t.isValidOption(e)}):-1;return n>-1?n:e},findSelectedOptionIndex:function(){var e=this;if(this.$filled){for(var t=function(){var t=e.d_value[r],n=e.visibleOptions.findIndex(function(n){return e.isValidSelectedOption(n)&&e.isEquals(t,e.getOptionValue(n))});if(n>-1)return{v:n}},n,r=this.d_value.length-1;r>=0;r--)if(n=t(),n)return n.v}return-1},findFirstSelectedOptionIndex:function(){var e=this;return this.$filled?this.visibleOptions.findIndex(function(t){return e.isValidSelectedOption(t)}):-1},findLastSelectedOptionIndex:function(){var e=this;return this.$filled?F(this.visibleOptions,function(t){return e.isValidSelectedOption(t)}):-1},findNextSelectedOptionIndex:function(e){var t=this,n=this.$filled&&e<this.visibleOptions.length-1?this.visibleOptions.slice(e+1).findIndex(function(e){return t.isValidSelectedOption(e)}):-1;return n>-1?n+e+1:-1},findPrevSelectedOptionIndex:function(e){var t=this,n=this.$filled&&e>0?F(this.visibleOptions.slice(0,e),function(e){return t.isValidSelectedOption(e)}):-1;return n>-1?n:-1},findNearestSelectedOptionIndex:function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:!1,n=-1;return this.$filled&&(t?(n=this.findPrevSelectedOptionIndex(e),n=n===-1?this.findNextSelectedOptionIndex(e):n):(n=this.findNextSelectedOptionIndex(e),n=n===-1?this.findPrevSelectedOptionIndex(e):n)),n>-1?n:e},findFirstFocusedOptionIndex:function(){var e=this.findFirstSelectedOptionIndex();return e<0?this.findFirstOptionIndex():e},findLastFocusedOptionIndex:function(){var e=this.findSelectedOptionIndex();return e<0?this.findLastOptionIndex():e},searchOptions:function(e){var t=this;this.searchValue=(this.searchValue||``)+e.key;var n=-1;S(this.searchValue)&&(this.focusedOptionIndex===-1?n=this.visibleOptions.findIndex(function(e){return t.isOptionMatched(e)}):(n=this.visibleOptions.slice(this.focusedOptionIndex).findIndex(function(e){return t.isOptionMatched(e)}),n=n===-1?this.visibleOptions.slice(0,this.focusedOptionIndex).findIndex(function(e){return t.isOptionMatched(e)}):n+this.focusedOptionIndex),n===-1&&this.focusedOptionIndex===-1&&(n=this.findFirstFocusedOptionIndex()),n!==-1&&this.changeFocusedOptionIndex(e,n)),this.searchTimeout&&clearTimeout(this.searchTimeout),this.searchTimeout=setTimeout(function(){t.searchValue=``,t.searchTimeout=null},500)},changeFocusedOptionIndex:function(e,t){this.focusedOptionIndex!==t&&(this.focusedOptionIndex=t,this.scrollInView(),this.selectOnFocus&&this.onOptionSelect(e,this.visibleOptions[t]))},scrollInView:function(){var e=this,t=arguments.length>0&&arguments[0]!==void 0?arguments[0]:-1;this.$nextTick(function(){var n=t===-1?e.focusedOptionId:`${e.$id}_${t}`,r=j(e.list,`li[id="${n}"]`);r?r.scrollIntoView&&r.scrollIntoView({block:`nearest`,inline:`nearest`}):e.virtualScrollerDisabled||e.virtualScroller&&e.virtualScroller.scrollToIndex(t===-1?e.focusedOptionIndex:t)})},autoUpdateModel:function(){if(this.autoOptionFocus&&(this.focusedOptionIndex=this.findFirstFocusedOptionIndex()),this.selectOnFocus&&this.autoOptionFocus&&!this.$filled){var e=this.getOptionValue(this.visibleOptions[this.focusedOptionIndex]);this.updateModel(null,[e])}},updateModel:function(e,t){this.writeValue(t,e),this.$emit(`change`,{originalEvent:e,value:t})},flatOptions:function(e){var t=this;return(e||[]).reduce(function(e,n,r){var i=t.getOptionGroupChildren(n);return i&&Array.isArray(i)?(e.push({optionGroup:n,group:!0,index:r}),i.forEach(function(t){return e.push(t)})):e.push(n),e},[])},overlayRef:function(e){this.overlay=e},listRef:function(e,t){this.list=e,t&&t(e)},virtualScrollerRef:function(e){this.virtualScroller=e}},computed:{visibleOptions:function(){var e=this,t=this.optionGroupLabel?this.flatOptions(this.options):this.options||[];if(this.filterValue){var n=fe.filter(t,this.searchFields,this.filterValue,this.filterMatchMode,this.filterLocale);if(this.optionGroupLabel){var r=this.options||[],i=[];return r.forEach(function(t){var r=e.getOptionGroupChildren(t).filter(function(e){return n.includes(e)});r.length>0&&i.push(K(K({},t),{},q({},typeof e.optionGroupChildren==`string`?e.optionGroupChildren:`items`,J(r))))}),this.flatOptions(i)}return n}return t},label:function(){var e;if(this.d_value&&this.d_value.length)if(this.loading&&(!this.options||this.options.length===0))e=this.placeholder;else if(S(this.maxSelectedLabels)&&this.d_value.length>this.maxSelectedLabels)return this.getSelectedItemsLabel();else{e=``;for(var t=0;t<this.d_value.length;t++)t!==0&&(e+=`, `),e+=this.getLabelByValue(this.d_value[t])}else e=this.placeholder;return e},chipSelectedItems:function(){return S(this.maxSelectedLabels)&&this.d_value&&this.d_value.length>this.maxSelectedLabels},allSelected:function(){var e=this;return this.selectAll===null?S(this.visibleOptions)&&this.visibleOptions.every(function(t){return e.isOptionGroup(t)||e.isOptionDisabled(t)||e.isSelected(t)}):this.selectAll},hasSelectedOption:function(){return this.$filled},equalityKey:function(){return this.optionValue?null:this.dataKey},searchFields:function(){return this.filterFields||[this.optionLabel]},maxSelectionLimitReached:function(){return this.selectionLimit&&this.d_value&&this.d_value.length===this.selectionLimit},filterResultMessageText:function(){return S(this.visibleOptions)?this.filterMessageText.replaceAll(`{0}`,this.visibleOptions.length):this.emptyFilterMessageText},filterMessageText:function(){return this.filterMessage||this.$primevue.config.locale.searchMessage||``},emptyFilterMessageText:function(){return this.emptyFilterMessage||this.$primevue.config.locale.emptySearchMessage||this.$primevue.config.locale.emptyFilterMessage||``},emptyMessageText:function(){return this.emptyMessage||this.$primevue.config.locale.emptyMessage||``},selectionMessageText:function(){return this.selectionMessage||this.$primevue.config.locale.selectionMessage||``},emptySelectionMessageText:function(){return this.emptySelectionMessage||this.$primevue.config.locale.emptySelectionMessage||``},selectedMessageText:function(){return this.$filled?this.selectionMessageText.replaceAll(`{0}`,this.d_value.length):this.emptySelectionMessageText},focusedOptionId:function(){return this.focusedOptionIndex===-1?null:`${this.$id}_${this.focusedOptionIndex}`},ariaSetSize:function(){var e=this;return this.visibleOptions.filter(function(t){return!e.isOptionGroup(t)}).length},toggleAllAriaLabel:function(){return this.$primevue.config.locale.aria?this.$primevue.config.locale.aria[this.allSelected?`selectAll`:`unselectAll`]:void 0},listAriaLabel:function(){return this.$primevue.config.locale.aria?this.$primevue.config.locale.aria.listLabel:void 0},virtualScrollerDisabled:function(){return!this.virtualScrollerOptions},hasFluid:function(){return ne(this.fluid)?!!this.$pcFluid:this.fluid},isClearIconVisible:function(){return this.showClear&&this.d_value&&this.d_value.length&&this.d_value!=null&&S(this.options)&&!this.disabled&&!this.loading},containerDataP:function(){return M(q({invalid:this.$invalid,disabled:this.disabled,focus:this.focused,fluid:this.$fluid,filled:this.$variant===`filled`},this.size,this.size))},labelDataP:function(){return M(q(q(q({placeholder:this.label===this.placeholder,clearable:this.showClear,disabled:this.disabled},this.size,this.size),`has-chip`,this.display===`chip`&&this.d_value&&this.d_value.length&&(this.maxSelectedLabels?this.d_value.length<=this.maxSelectedLabels:!0)),`empty`,!this.placeholder&&!this.$filled))},dropdownIconDataP:function(){return M(q({},this.size,this.size))},overlayDataP:function(){return M(q({},`portal-`+this.appendTo,`portal-`+this.appendTo))}},directives:{ripple:me},components:{InputText:ue,Checkbox:de,VirtualScroller:ie,Portal:V,Chip:U,IconField:ae,InputIcon:ce,TimesIcon:pe,SearchIcon:se,ChevronDownIcon:oe,SpinnerIcon:z,CheckIcon:R}};function Z(e){"@babel/helpers - typeof";return Z=typeof Symbol==`function`&&typeof Symbol.iterator==`symbol`?function(e){return typeof e}:function(e){return e&&typeof Symbol==`function`&&e.constructor===Symbol&&e!==Symbol.prototype?`symbol`:typeof e},Z(e)}function Q(e,t,n){return(t=De(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function De(e){var t=Oe(e,`string`);return Z(t)==`symbol`?t:t+``}function Oe(e,t){if(Z(e)!=`object`||!e)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var r=n.call(e,t);if(Z(r)!=`object`)return r;throw TypeError(`@@toPrimitive must return a primitive value.`)}return(t===`string`?String:Number)(e)}var ke=[`data-p`],Ae=[`id`,`disabled`,`placeholder`,`tabindex`,`aria-label`,`aria-labelledby`,`aria-expanded`,`aria-controls`,`aria-activedescendant`,`aria-invalid`],$=[`data-p`],je={key:1},Me=[`data-p`],Ne=[`id`,`aria-label`],Pe=[`id`],Fe=[`id`,`aria-label`,`aria-selected`,`aria-disabled`,`aria-setsize`,`aria-posinset`,`onClick`,`onMousemove`,`data-p-selected`,`data-p-focused`,`data-p-disabled`];function Ie(x,S,C,ee,w,T){var E=c(`Chip`),D=c(`SpinnerIcon`),O=c(`Checkbox`),k=c(`InputText`),A=c(`SearchIcon`),j=c(`InputIcon`),M=c(`IconField`),N=c(`VirtualScroller`),P=c(`Portal`),F=y(`ripple`);return s(),p(`div`,t({ref:`container`,class:x.cx(`root`),style:x.sx(`root`),onClick:S[7]||=function(){return T.onContainerClick&&T.onContainerClick.apply(T,arguments)},"data-p":T.containerDataP},x.ptmi(`root`)),[f(`div`,t({class:`p-hidden-accessible`},x.ptm(`hiddenInputContainer`),{"data-p-hidden-accessible":!0}),[f(`input`,t({ref:`focusInput`,id:x.inputId,type:`text`,readonly:``,disabled:x.disabled,placeholder:x.placeholder,tabindex:x.disabled?-1:x.tabindex,role:`combobox`,"aria-label":x.ariaLabel,"aria-labelledby":x.ariaLabelledby,"aria-haspopup":`listbox`,"aria-expanded":w.overlayVisible,"aria-controls":w.overlayVisible?x.$id+`_list`:void 0,"aria-activedescendant":w.focused?T.focusedOptionId:void 0,"aria-invalid":x.invalid||void 0,onFocus:S[0]||=function(){return T.onFocus&&T.onFocus.apply(T,arguments)},onBlur:S[1]||=function(){return T.onBlur&&T.onBlur.apply(T,arguments)},onKeydown:S[2]||=function(){return T.onKeyDown&&T.onKeyDown.apply(T,arguments)}},x.ptm(`hiddenInput`)),null,16,Ae)],16),f(`div`,t({class:x.cx(`labelContainer`)},x.ptm(`labelContainer`)),[f(`div`,t({class:x.cx(`label`),"data-p":T.labelDataP},x.ptm(`label`)),[i(x.$slots,`value`,{value:x.d_value,placeholder:x.placeholder},function(){return[x.display===`comma`?(s(),p(h,{key:0},[m(n(T.label||`empty`),1)],64)):x.display===`chip`?(s(),p(h,{key:1},[x.loading&&(!x.options||x.options.length===0)?(s(),p(h,{key:0},[m(n(x.placeholder||`empty`),1)],64)):T.chipSelectedItems?(s(),p(`span`,je,n(T.label),1)):(s(!0),p(h,{key:2},r(x.d_value,function(e,n){return s(),p(`span`,t({key:`chip-${T.getLabelByValue(e)}_${n}`,class:x.cx(`chipItem`)},{ref_for:!0},x.ptm(`chipItem`)),[i(x.$slots,`chip`,{value:e,removeCallback:function(t){return T.removeOption(t,e)}},function(){return[d(E,{class:a(x.cx(`pcChip`)),label:T.getLabelByValue(e),removeIcon:x.chipIcon||x.removeTokenIcon,removable:``,unstyled:x.unstyled,onRemove:function(t){return T.removeOption(t,e)},pt:x.ptm(`pcChip`)},{removeicon:u(function(){return[i(x.$slots,x.$slots.chipicon?`chipicon`:`removetokenicon`,{class:a(x.cx(`chipIcon`)),item:e,removeCallback:function(t){return T.removeOption(t,e)}})]}),_:2},1032,[`class`,`label`,`removeIcon`,`unstyled`,`onRemove`,`pt`])]})],16)}),128)),!x.d_value||x.d_value.length===0?(s(),p(h,{key:3},[m(n(x.placeholder||`empty`),1)],64)):v(``,!0)],64)):v(``,!0)]})],16,$)],16),T.isClearIconVisible?i(x.$slots,`clearicon`,{key:0,class:a(x.cx(`clearIcon`)),clearCallback:T.onClearClick},function(){return[(s(),g(e(x.clearIcon?`i`:`TimesIcon`),t({ref:`clearIcon`,class:[x.cx(`clearIcon`),x.clearIcon],onClick:T.onClearClick},x.ptm(`clearIcon`),{"data-pc-section":`clearicon`}),null,16,[`class`,`onClick`]))]}):v(``,!0),f(`div`,t({class:x.cx(`dropdown`)},x.ptm(`dropdown`)),[x.loading?i(x.$slots,`loadingicon`,{key:0,class:a(x.cx(`loadingIcon`))},function(){return[x.loadingIcon?(s(),p(`span`,t({key:0,class:[x.cx(`loadingIcon`),`pi-spin`,x.loadingIcon],"aria-hidden":`true`},x.ptm(`loadingIcon`)),null,16)):(s(),g(D,t({key:1,class:x.cx(`loadingIcon`),spin:``,"aria-hidden":`true`},x.ptm(`loadingIcon`)),null,16,[`class`]))]}):i(x.$slots,`dropdownicon`,{key:1,class:a(x.cx(`dropdownIcon`))},function(){return[(s(),g(e(x.dropdownIcon?`span`:`ChevronDownIcon`),t({class:[x.cx(`dropdownIcon`),x.dropdownIcon],"aria-hidden":`true`,"data-p":T.dropdownIconDataP},x.ptm(`dropdownIcon`)),null,16,[`class`,`data-p`]))]})],16),d(P,{appendTo:x.appendTo},{default:u(function(){return[d(b,t({name:`p-anchored-overlay`,onEnter:T.onOverlayEnter,onAfterEnter:T.onOverlayAfterEnter,onLeave:T.onOverlayLeave,onAfterLeave:T.onOverlayAfterLeave},x.ptm(`transition`)),{default:u(function(){return[w.overlayVisible?(s(),p(`div`,t({key:0,ref:T.overlayRef,style:[x.panelStyle,x.overlayStyle],class:[x.cx(`overlay`),x.panelClass,x.overlayClass],onClick:S[5]||=function(){return T.onOverlayClick&&T.onOverlayClick.apply(T,arguments)},onKeydown:S[6]||=function(){return T.onOverlayKeyDown&&T.onOverlayKeyDown.apply(T,arguments)},"data-p":T.overlayDataP},x.ptm(`overlay`)),[f(`span`,t({ref:`firstHiddenFocusableElementOnOverlay`,role:`presentation`,"aria-hidden":`true`,class:`p-hidden-accessible p-hidden-focusable`,tabindex:0,onFocus:S[3]||=function(){return T.onFirstHiddenFocus&&T.onFirstHiddenFocus.apply(T,arguments)}},x.ptm(`hiddenFirstFocusableEl`),{"data-p-hidden-accessible":!0,"data-p-hidden-focusable":!0}),null,16),i(x.$slots,`header`,{value:x.d_value,options:T.visibleOptions}),x.showToggleAll&&x.selectionLimit==null||x.filter?(s(),p(`div`,t({key:0,class:x.cx(`header`)},x.ptm(`header`)),[x.showToggleAll&&x.selectionLimit==null?(s(),g(O,{key:0,modelValue:T.allSelected,binary:!0,disabled:x.disabled,variant:x.variant,"aria-label":T.toggleAllAriaLabel,onChange:T.onToggleAll,unstyled:x.unstyled,pt:T.getHeaderCheckboxPTOptions(`pcHeaderCheckbox`),formControl:{novalidate:!0}},{icon:u(function(n){return[x.$slots.headercheckboxicon?(s(),g(e(x.$slots.headercheckboxicon),{key:0,checked:n.checked,class:a(n.class)},null,8,[`checked`,`class`])):n.checked?(s(),g(e(x.checkboxIcon?`span`:`CheckIcon`),t({key:1,class:[n.class,Q({},x.checkboxIcon,n.checked)]},T.getHeaderCheckboxPTOptions(`pcHeaderCheckbox.icon`)),null,16,[`class`])):v(``,!0)]}),_:1},8,[`modelValue`,`disabled`,`variant`,`aria-label`,`onChange`,`unstyled`,`pt`])):v(``,!0),x.filter?(s(),g(M,{key:1,class:a(x.cx(`pcFilterContainer`)),unstyled:x.unstyled,pt:x.ptm(`pcFilterContainer`)},{default:u(function(){return[d(k,{ref:`filterInput`,value:w.filterValue,onVnodeMounted:T.onFilterUpdated,onVnodeUpdated:T.onFilterUpdated,class:a(x.cx(`pcFilter`)),placeholder:x.filterPlaceholder,disabled:x.disabled,variant:x.variant,unstyled:x.unstyled,role:`searchbox`,autocomplete:`off`,"aria-owns":x.$id+`_list`,"aria-activedescendant":T.focusedOptionId,onKeydown:T.onFilterKeyDown,onBlur:T.onFilterBlur,onInput:T.onFilterChange,pt:x.ptm(`pcFilter`),formControl:{novalidate:!0}},null,8,[`value`,`onVnodeMounted`,`onVnodeUpdated`,`class`,`placeholder`,`disabled`,`variant`,`unstyled`,`aria-owns`,`aria-activedescendant`,`onKeydown`,`onBlur`,`onInput`,`pt`]),d(j,{unstyled:x.unstyled,pt:x.ptm(`pcFilterIconContainer`)},{default:u(function(){return[i(x.$slots,`filtericon`,{},function(){return[x.filterIcon?(s(),p(`span`,t({key:0,class:x.filterIcon},x.ptm(`filterIcon`)),null,16)):(s(),g(A,o(t({key:1},x.ptm(`filterIcon`))),null,16))]})]}),_:3},8,[`unstyled`,`pt`])]}),_:3},8,[`class`,`unstyled`,`pt`])):v(``,!0),x.filter?(s(),p(`span`,t({key:2,role:`status`,"aria-live":`polite`,class:`p-hidden-accessible`},x.ptm(`hiddenFilterResult`),{"data-p-hidden-accessible":!0}),n(T.filterResultMessageText),17)):v(``,!0)],16)):v(``,!0),f(`div`,t({class:x.cx(`listContainer`),style:{"max-height":T.virtualScrollerDisabled?x.scrollHeight:``}},x.ptm(`listContainer`)),[d(N,t({ref:T.virtualScrollerRef},x.virtualScrollerOptions,{items:T.visibleOptions,style:{height:x.scrollHeight},tabindex:-1,disabled:T.virtualScrollerDisabled,pt:x.ptm(`virtualScroller`)}),_({content:u(function(o){var c=o.styleClass,_=o.contentRef,y=o.items,b=o.getItemOptions,S=o.contentStyle,C=o.itemSize;return[f(`ul`,t({ref:function(e){return T.listRef(e,_)},id:x.$id+`_list`,class:[x.cx(`list`),c],style:S,role:`listbox`,"aria-multiselectable":`true`,"aria-label":T.listAriaLabel},x.ptm(`list`)),[(s(!0),p(h,null,r(y,function(r,o){return s(),p(h,{key:T.getOptionRenderKey(r,T.getOptionIndex(o,b))},[T.isOptionGroup(r)?(s(),p(`li`,t({key:0,id:x.$id+`_`+T.getOptionIndex(o,b),style:{height:C?C+`px`:void 0},class:x.cx(`optionGroup`),role:`option`},{ref_for:!0},x.ptm(`optionGroup`)),[i(x.$slots,`optiongroup`,{option:r.optionGroup,index:T.getOptionIndex(o,b)},function(){return[m(n(T.getOptionGroupLabel(r.optionGroup)),1)]})],16,Pe)):l((s(),p(`li`,t({key:1,id:x.$id+`_`+T.getOptionIndex(o,b),style:{height:C?C+`px`:void 0},class:x.cx(`option`,{option:r,index:o,getItemOptions:b}),role:`option`,"aria-label":T.getOptionLabel(r),"aria-selected":T.isSelected(r),"aria-disabled":T.isOptionDisabled(r),"aria-setsize":T.ariaSetSize,"aria-posinset":T.getAriaPosInset(T.getOptionIndex(o,b)),onClick:function(e){return T.onOptionSelect(e,r,T.getOptionIndex(o,b),!0)},onMousemove:function(e){return T.onOptionMouseMove(e,T.getOptionIndex(o,b))}},{ref_for:!0},T.getCheckboxPTOptions(r,b,o,`option`),{"data-p-selected":T.isSelected(r),"data-p-focused":w.focusedOptionIndex===T.getOptionIndex(o,b),"data-p-disabled":T.isOptionDisabled(r)}),[d(O,{defaultValue:T.isSelected(r),binary:!0,tabindex:-1,variant:x.variant,unstyled:x.unstyled,pt:T.getCheckboxPTOptions(r,b,o,`pcOptionCheckbox`),formControl:{novalidate:!0}},{icon:u(function(n){return[x.$slots.optioncheckboxicon||x.$slots.itemcheckboxicon?(s(),g(e(x.$slots.optioncheckboxicon||x.$slots.itemcheckboxicon),{key:0,checked:n.checked,class:a(n.class)},null,8,[`checked`,`class`])):n.checked?(s(),g(e(x.checkboxIcon?`span`:`CheckIcon`),t({key:1,class:[n.class,Q({},x.checkboxIcon,n.checked)]},{ref_for:!0},T.getCheckboxPTOptions(r,b,o,`pcOptionCheckbox.icon`)),null,16,[`class`])):v(``,!0)]}),_:2},1032,[`defaultValue`,`variant`,`unstyled`,`pt`]),i(x.$slots,`option`,{option:r,selected:T.isSelected(r),index:T.getOptionIndex(o,b)},function(){return[f(`span`,t({ref_for:!0},x.ptm(`optionLabel`)),n(T.getOptionLabel(r)),17)]})],16,Fe)),[[F]])],64)}),128)),w.filterValue&&(!y||y&&y.length===0)?(s(),p(`li`,t({key:0,class:x.cx(`emptyMessage`),role:`option`},x.ptm(`emptyMessage`)),[i(x.$slots,`emptyfilter`,{},function(){return[m(n(T.emptyFilterMessageText),1)]})],16)):!x.options||x.options&&x.options.length===0?(s(),p(`li`,t({key:1,class:x.cx(`emptyMessage`),role:`option`},x.ptm(`emptyMessage`)),[i(x.$slots,`empty`,{},function(){return[m(n(T.emptyMessageText),1)]})],16)):v(``,!0)],16,Ne)]}),_:2},[x.$slots.loader?{name:`loader`,fn:u(function(e){var t=e.options;return[i(x.$slots,`loader`,{options:t})]}),key:`0`}:void 0]),1040,[`items`,`style`,`disabled`,`pt`])],16),i(x.$slots,`footer`,{value:x.d_value,options:T.visibleOptions}),!x.options||x.options&&x.options.length===0?(s(),p(`span`,t({key:1,role:`status`,"aria-live":`polite`,class:`p-hidden-accessible`},x.ptm(`hiddenEmptyMessage`),{"data-p-hidden-accessible":!0}),n(T.emptyMessageText),17)):v(``,!0),f(`span`,t({role:`status`,"aria-live":`polite`,class:`p-hidden-accessible`},x.ptm(`hiddenSelectedMessage`),{"data-p-hidden-accessible":!0}),n(T.selectedMessageText),17),f(`span`,t({ref:`lastHiddenFocusableElementOnOverlay`,role:`presentation`,"aria-hidden":`true`,class:`p-hidden-accessible p-hidden-focusable`,tabindex:0,onFocus:S[4]||=function(){return T.onLastHiddenFocus&&T.onLastHiddenFocus.apply(T,arguments)}},x.ptm(`hiddenLastFocusableEl`),{"data-p-hidden-accessible":!0,"data-p-hidden-focusable":!0}),null,16)],16,Me)):v(``,!0)]}),_:3},16,[`onEnter`,`onAfterEnter`,`onLeave`,`onAfterLeave`])]}),_:3},8,[`appendTo`])],16,ke)}X.render=Ie;export{X as t};