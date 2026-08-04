import{B as e,E as t,Ft as n,I as r,L as i,Mt as a,Nt as o,P as s,R as c,X as ee,Y as l,_ as u,c as d,d as f,g as p,i as m,l as h,m as g,u as _,z as te}from"./_plugin-vue_export-helper-DAFnlxWz.js";import{l as ne,t as re}from"./runtime-dom.esm-bundler-v-CUawBb.js";import{B as v,Et as y,K as b,M as ie,T as x,U as S,W as C,_ as w,bt as T,et as E,lt as D,m as O,n as k,nt as A,rt as j,tt as M,ut as N,wt as P,x as ae}from"./basecomponent-CJ747krd.js";import{a as oe,i as se,n as ce,o as le,r as ue,t as F}from"./inputicon-CzgWme0G.js";import{n as I,t as L}from"./inputtext-C2EVA17r.js";import{r as R}from"./api-q9O50XRw.js";import{$ as z,K as B,Q as V,Y as H,Z as U,ct as W,it as de,nt as fe}from"./main-CQkMK8rK.js";var G={name:`BlankIcon`,extends:de};function pe(e){return _e(e)||ge(e)||he(e)||me()}function me(){throw TypeError(`Invalid attempt to spread non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function he(e,t){if(e){if(typeof e==`string`)return K(e,t);var n={}.toString.call(e).slice(8,-1);return n===`Object`&&e.constructor&&(n=e.constructor.name),n===`Map`||n===`Set`?Array.from(e):n===`Arguments`||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)?K(e,t):void 0}}function ge(e){if(typeof Symbol<`u`&&e[Symbol.iterator]!=null||e[`@@iterator`]!=null)return Array.from(e)}function _e(e){if(Array.isArray(e))return K(e)}function K(e,t){(t==null||t>e.length)&&(t=e.length);for(var n=0,r=Array(t);n<t;n++)r[n]=e[n];return r}function ve(e,n,r,i,a,o){return s(),f(`svg`,t({width:`14`,height:`14`,viewBox:`0 0 14 14`,fill:`none`,xmlns:`http://www.w3.org/2000/svg`},e.pti()),pe(n[0]||=[d(`rect`,{width:`1`,height:`1`,fill:`currentColor`,"fill-opacity":`0`},null,-1)]),16)}G.render=ve;var ye=k.extend({name:`select`,style:`
    .p-select {
        display: inline-flex;
        cursor: pointer;
        position: relative;
        user-select: none;
        background: dt('select.background');
        border: 1px solid dt('select.border.color');
        transition:
            background dt('select.transition.duration'),
            color dt('select.transition.duration'),
            border-color dt('select.transition.duration'),
            outline-color dt('select.transition.duration'),
            box-shadow dt('select.transition.duration');
        border-radius: dt('select.border.radius');
        outline-color: transparent;
        box-shadow: dt('select.shadow');
    }

    .p-select:not(.p-disabled):hover {
        border-color: dt('select.hover.border.color');
    }

    .p-select:not(.p-disabled).p-focus {
        border-color: dt('select.focus.border.color');
        box-shadow: dt('select.focus.ring.shadow');
        outline: dt('select.focus.ring.width') dt('select.focus.ring.style') dt('select.focus.ring.color');
        outline-offset: dt('select.focus.ring.offset');
    }

    .p-select.p-variant-filled {
        background: dt('select.filled.background');
    }

    .p-select.p-variant-filled:not(.p-disabled):hover {
        background: dt('select.filled.hover.background');
    }

    .p-select.p-variant-filled:not(.p-disabled).p-focus {
        background: dt('select.filled.focus.background');
    }

    .p-select.p-invalid {
        border-color: dt('select.invalid.border.color');
    }

    .p-select.p-disabled {
        opacity: 1;
        background: dt('select.disabled.background');
    }

    .p-select-clear-icon {
        align-self: center;
        color: dt('select.clear.icon.color');
        inset-inline-end: dt('select.dropdown.width');
    }

    .p-select-dropdown {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        background: transparent;
        color: dt('select.dropdown.color');
        width: dt('select.dropdown.width');
        border-start-end-radius: dt('select.border.radius');
        border-end-end-radius: dt('select.border.radius');
    }

    .p-select-label {
        display: block;
        white-space: nowrap;
        overflow: hidden;
        flex: 1 1 auto;
        width: 1%;
        padding: dt('select.padding.y') dt('select.padding.x');
        text-overflow: ellipsis;
        cursor: pointer;
        color: dt('select.color');
        background: transparent;
        border: 0 none;
        outline: 0 none;
        font-size: 1rem;
    }

    .p-select-label.p-placeholder {
        color: dt('select.placeholder.color');
    }

    .p-select.p-invalid .p-select-label.p-placeholder {
        color: dt('select.invalid.placeholder.color');
    }

    .p-select.p-disabled .p-select-label {
        color: dt('select.disabled.color');
    }

    .p-select-label-empty {
        overflow: hidden;
        opacity: 0;
    }

    input.p-select-label {
        cursor: default;
    }

    .p-select-overlay {
        position: absolute;
        top: 0;
        left: 0;
        background: dt('select.overlay.background');
        color: dt('select.overlay.color');
        border: 1px solid dt('select.overlay.border.color');
        border-radius: dt('select.overlay.border.radius');
        box-shadow: dt('select.overlay.shadow');
        min-width: 100%;
        transform-origin: inherit;
        will-change: transform;
    }

    .p-select-header {
        padding: dt('select.list.header.padding');
    }

    .p-select-filter {
        width: 100%;
    }

    .p-select-list-container {
        overflow: auto;
    }

    .p-select-option-group {
        cursor: auto;
        margin: 0;
        padding: dt('select.option.group.padding');
        background: dt('select.option.group.background');
        color: dt('select.option.group.color');
        font-weight: dt('select.option.group.font.weight');
    }

    .p-select-list {
        margin: 0;
        padding: 0;
        list-style-type: none;
        padding: dt('select.list.padding');
        gap: dt('select.list.gap');
        display: flex;
        flex-direction: column;
    }

    .p-select-option {
        cursor: pointer;
        font-weight: normal;
        white-space: nowrap;
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        padding: dt('select.option.padding');
        border: 0 none;
        color: dt('select.option.color');
        background: transparent;
        transition:
            background dt('select.transition.duration'),
            color dt('select.transition.duration'),
            border-color dt('select.transition.duration'),
            box-shadow dt('select.transition.duration'),
            outline-color dt('select.transition.duration');
        border-radius: dt('select.option.border.radius');
    }

    .p-select-option:not(.p-select-option-selected):not(.p-disabled).p-focus {
        background: dt('select.option.focus.background');
        color: dt('select.option.focus.color');
    }

    .p-select-option:not(.p-select-option-selected):not(.p-disabled):hover {
        background: dt('select.option.focus.background');
        color: dt('select.option.focus.color');
    }

    .p-select-option.p-select-option-selected {
        background: dt('select.option.selected.background');
        color: dt('select.option.selected.color');
    }

    .p-select-option.p-select-option-selected.p-focus {
        background: dt('select.option.selected.focus.background');
        color: dt('select.option.selected.focus.color');
    }
   
    .p-select-option-blank-icon {
        flex-shrink: 0;
    }

    .p-select-option-check-icon {
        position: relative;
        flex-shrink: 0;
        margin-inline-start: dt('select.checkmark.gutter.start');
        margin-inline-end: dt('select.checkmark.gutter.end');
        color: dt('select.checkmark.color');
    }

    .p-select-empty-message {
        padding: dt('select.empty.message.padding');
    }

    .p-select-fluid {
        display: flex;
        width: 100%;
    }

    .p-select-sm .p-select-label {
        font-size: dt('select.sm.font.size');
        padding-block: dt('select.sm.padding.y');
        padding-inline: dt('select.sm.padding.x');
    }

    .p-select-sm .p-select-dropdown .p-icon {
        font-size: dt('select.sm.font.size');
        width: dt('select.sm.font.size');
        height: dt('select.sm.font.size');
    }

    .p-select-lg .p-select-label {
        font-size: dt('select.lg.font.size');
        padding-block: dt('select.lg.padding.y');
        padding-inline: dt('select.lg.padding.x');
    }

    .p-select-lg .p-select-dropdown .p-icon {
        font-size: dt('select.lg.font.size');
        width: dt('select.lg.font.size');
        height: dt('select.lg.font.size');
    }

    .p-floatlabel-in .p-select-filter {
        padding-block-start: dt('select.padding.y');
        padding-block-end: dt('select.padding.y');
    }
`,classes:{root:function(e){var t=e.instance,n=e.props,r=e.state;return[`p-select p-component p-inputwrapper`,{"p-disabled":n.disabled,"p-invalid":t.$invalid,"p-variant-filled":t.$variant===`filled`,"p-focus":r.focused,"p-inputwrapper-filled":t.$filled,"p-inputwrapper-focus":r.focused||r.overlayVisible,"p-select-open":r.overlayVisible,"p-select-fluid":t.$fluid,"p-select-sm p-inputfield-sm":n.size===`small`,"p-select-lg p-inputfield-lg":n.size===`large`}]},label:function(e){var t=e.instance,n=e.props;return[`p-select-label`,{"p-placeholder":!n.editable&&t.label===n.placeholder,"p-select-label-empty":!n.editable&&!t.$slots.value&&(t.label===`p-emptylabel`||t.label?.length===0)}]},clearIcon:`p-select-clear-icon`,dropdown:`p-select-dropdown`,loadingicon:`p-select-loading-icon`,dropdownIcon:`p-select-dropdown-icon`,overlay:`p-select-overlay p-component`,header:`p-select-header`,pcFilter:`p-select-filter`,listContainer:`p-select-list-container`,list:`p-select-list`,optionGroup:`p-select-option-group`,optionGroupLabel:`p-select-option-group-label`,option:function(e){var t=e.instance,n=e.props,r=e.state,i=e.option,a=e.focusedOption;return[`p-select-option`,{"p-select-option-selected":t.isSelected(i)&&n.highlightOnSelect,"p-focus":r.focusedOptionIndex===a,"p-disabled":t.isOptionDisabled(i)}]},optionLabel:`p-select-option-label`,optionCheckIcon:`p-select-option-check-icon`,optionBlankIcon:`p-select-option-blank-icon`,emptyMessage:`p-select-empty-message`}}),be={name:`BaseSelect`,extends:I,props:{options:Array,optionLabel:[String,Function],optionValue:[String,Function],optionDisabled:[String,Function],optionGroupLabel:[String,Function],optionGroupChildren:[String,Function],scrollHeight:{type:String,default:`14rem`},filter:Boolean,filterPlaceholder:String,filterLocale:String,filterMatchMode:{type:String,default:`contains`},filterFields:{type:Array,default:null},editable:Boolean,placeholder:{type:String,default:null},dataKey:null,showClear:{type:Boolean,default:!1},inputId:{type:String,default:null},inputClass:{type:[String,Object],default:null},inputStyle:{type:Object,default:null},labelId:{type:String,default:null},labelClass:{type:[String,Object],default:null},labelStyle:{type:Object,default:null},panelClass:{type:[String,Object],default:null},overlayStyle:{type:Object,default:null},overlayClass:{type:[String,Object],default:null},panelStyle:{type:Object,default:null},appendTo:{type:[String,Object],default:`body`},loading:{type:Boolean,default:!1},clearIcon:{type:String,default:void 0},dropdownIcon:{type:String,default:void 0},filterIcon:{type:String,default:void 0},loadingIcon:{type:String,default:void 0},resetFilterOnHide:{type:Boolean,default:!1},resetFilterOnClear:{type:Boolean,default:!1},virtualScrollerOptions:{type:Object,default:null},autoOptionFocus:{type:Boolean,default:!1},autoFilterFocus:{type:Boolean,default:!1},selectOnFocus:{type:Boolean,default:!1},focusOnHover:{type:Boolean,default:!0},highlightOnSelect:{type:Boolean,default:!0},checkmark:{type:Boolean,default:!1},filterMessage:{type:String,default:null},selectionMessage:{type:String,default:null},emptySelectionMessage:{type:String,default:null},emptyFilterMessage:{type:String,default:null},emptyMessage:{type:String,default:null},tabindex:{type:Number,default:0},ariaLabel:{type:String,default:null},ariaLabelledby:{type:String,default:null}},style:ye,provide:function(){return{$pcSelect:this,$parentInstance:this}}};function q(e){"@babel/helpers - typeof";return q=typeof Symbol==`function`&&typeof Symbol.iterator==`symbol`?function(e){return typeof e}:function(e){return e&&typeof Symbol==`function`&&e.constructor===Symbol&&e!==Symbol.prototype?`symbol`:typeof e},q(e)}function xe(e){return Te(e)||we(e)||Ce(e)||Se()}function Se(){throw TypeError(`Invalid attempt to spread non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function Ce(e,t){if(e){if(typeof e==`string`)return J(e,t);var n={}.toString.call(e).slice(8,-1);return n===`Object`&&e.constructor&&(n=e.constructor.name),n===`Map`||n===`Set`?Array.from(e):n===`Arguments`||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)?J(e,t):void 0}}function we(e){if(typeof Symbol<`u`&&e[Symbol.iterator]!=null||e[`@@iterator`]!=null)return Array.from(e)}function Te(e){if(Array.isArray(e))return J(e)}function J(e,t){(t==null||t>e.length)&&(t=e.length);for(var n=0,r=Array(t);n<t;n++)r[n]=e[n];return r}function Y(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(e);t&&(r=r.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),n.push.apply(n,r)}return n}function X(e){for(var t=1;t<arguments.length;t++){var n=arguments[t]==null?{}:arguments[t];t%2?Y(Object(n),!0).forEach(function(t){Z(e,t,n[t])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):Y(Object(n)).forEach(function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(n,t))})}return e}function Z(e,t,n){return(t=Ee(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function Ee(e){var t=De(e,`string`);return q(t)==`symbol`?t:t+``}function De(e,t){if(q(e)!=`object`||!e)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var r=n.call(e,t);if(q(r)!=`object`)return r;throw TypeError(`@@toPrimitive must return a primitive value.`)}return(t===`string`?String:Number)(e)}var Q={name:`Select`,extends:be,inheritAttrs:!1,emits:[`change`,`focus`,`blur`,`before-show`,`before-hide`,`show`,`hide`,`filter`],outsideClickListener:null,scrollHandler:null,resizeListener:null,labelClickListener:null,matchMediaOrientationListener:null,overlay:null,list:null,virtualScroller:null,searchTimeout:null,searchValue:null,isModelValueChanged:!1,data:function(){return{clicked:!1,focused:!1,focusedOptionIndex:-1,filterValue:null,overlayVisible:!1,queryOrientation:null}},watch:{modelValue:function(){this.isModelValueChanged=!0},options:function(){this.autoUpdateModel()}},mounted:function(){this.autoUpdateModel(),this.bindLabelClickListener(),this.bindMatchMediaOrientationListener()},updated:function(){this.overlayVisible&&this.isModelValueChanged&&this.scrollInView(this.findSelectedOptionIndex()),this.isModelValueChanged=!1},beforeUnmount:function(){this.unbindOutsideClickListener(),this.unbindResizeListener(),this.unbindLabelClickListener(),this.unbindMatchMediaOrientationListener(),this.scrollHandler&&=(this.scrollHandler.destroy(),null),this.overlay&&=(W.clear(this.overlay),null)},methods:{getOptionIndex:function(e,t){return this.virtualScrollerDisabled?e:t&&t(e).index},getOptionLabel:function(e){return this.optionLabel?P(e,this.optionLabel):e},getOptionValue:function(e){return this.optionValue?P(e,this.optionValue):e},getOptionRenderKey:function(e,t){return(this.dataKey?P(e,this.dataKey):this.getOptionLabel(e))+`_`+t},getPTItemOptions:function(e,t,n,r){return this.ptm(r,{context:{option:e,index:n,selected:this.isSelected(e),focused:this.focusedOptionIndex===this.getOptionIndex(n,t),disabled:this.isOptionDisabled(e)}})},isOptionDisabled:function(e){return this.optionDisabled?P(e,this.optionDisabled):!1},isOptionGroup:function(e){return this.optionGroupLabel&&e.optionGroup&&e.group},getOptionGroupLabel:function(e){return P(e,this.optionGroupLabel)},getOptionGroupChildren:function(e){return P(e,this.optionGroupChildren)},getAriaPosInset:function(e){var t=this;return(this.optionGroupLabel?e-this.visibleOptions.slice(0,e).filter(function(e){return t.isOptionGroup(e)}).length:e)+1},show:function(e){this.$emit(`before-show`),this.overlayVisible=!0,this.focusedOptionIndex=this.focusedOptionIndex===-1?this.autoOptionFocus?this.findFirstFocusedOptionIndex():this.editable?-1:this.findSelectedOptionIndex():this.focusedOptionIndex,e&&C(this.$refs.focusInput)},hide:function(e){var t=this,n=function(){t.$emit(`before-hide`),t.overlayVisible=!1,t.clicked=!1,t.focusedOptionIndex=-1,t.searchValue=``,t.resetFilterOnHide&&(t.filterValue=null),e&&C(t.$refs.focusInput)};setTimeout(function(){n()},0)},onFocus:function(e){this.disabled||(this.focused=!0,this.overlayVisible&&(this.focusedOptionIndex=this.focusedOptionIndex===-1?this.autoOptionFocus?this.findFirstFocusedOptionIndex():this.editable?-1:this.findSelectedOptionIndex():this.focusedOptionIndex,this.scrollInView(this.focusedOptionIndex)),this.$emit(`focus`,e))},onBlur:function(e){var t=this;setTimeout(function(){var n,r;t.focused=!1,t.focusedOptionIndex=-1,t.searchValue=``,t.$emit(`blur`,e),(n=(r=t.formField).onBlur)==null||n.call(r,e)},100)},onKeyDown:function(e){var t=this;if(this.disabled){e.preventDefault();return}if(O())switch(e.code){case`Backspace`:this.onBackspaceKey(e,this.editable);break;case`Enter`:case`NumpadDecimal`:this.onEnterKey(e);break;default:e.preventDefault();return}var n=e.metaKey||e.ctrlKey;switch(e.code){case`ArrowDown`:this.onArrowDownKey(e);break;case`ArrowUp`:this.onArrowUpKey(e,this.editable);break;case`ArrowLeft`:case`ArrowRight`:this.onArrowLeftKey(e,this.editable);break;case`Home`:this.onHomeKey(e,this.editable);break;case`End`:this.onEndKey(e,this.editable);break;case`PageDown`:this.onPageDownKey(e);break;case`PageUp`:this.onPageUpKey(e);break;case`Space`:this.onSpaceKey(e,this.editable);break;case`Enter`:case`NumpadEnter`:this.onEnterKey(e);break;case`Escape`:this.onEscapeKey(e);break;case`Tab`:this.onTabKey(e);break;case`Backspace`:this.onBackspaceKey(e,this.editable);break;case`ShiftLeft`:case`ShiftRight`:break;default:!n&&D(e.key)&&(!this.overlayVisible&&this.show(),!this.editable&&this.searchOptions(e,e.key),this.filter&&this.$nextTick(function(){t.$refs.filterInput&&C(t.$refs.filterInput.$el)}));break}this.clicked=!1},onEditableInput:function(e){var t=e.target.value;this.searchValue=``,!this.searchOptions(e,t)&&(this.focusedOptionIndex=-1),this.updateModel(e,t),!this.overlayVisible&&y(t)&&this.show()},onContainerClick:function(e){this.disabled||this.loading||e.target.tagName===`INPUT`||e.target.getAttribute(`data-pc-section`)===`clearicon`||e.target.closest(`[data-pc-section="clearicon"]`)||((!this.overlay||!this.overlay.contains(e.target))&&(this.overlayVisible?this.hide(!0):this.show(!0)),this.clicked=!0)},onClearClick:function(e){this.updateModel(e,null),this.resetFilterOnClear&&(this.filterValue=null)},onFirstHiddenFocus:function(e){var t=e.relatedTarget===this.$refs.focusInput?M(this.overlay,`:not([data-p-hidden-focusable="true"])`):this.$refs.focusInput;C(t)},onLastHiddenFocus:function(e){var t=e.relatedTarget===this.$refs.focusInput?x(this.overlay,`:not([data-p-hidden-focusable="true"])`):this.$refs.focusInput;C(t)},onOptionSelect:function(e,t){var n=arguments.length>2&&arguments[2]!==void 0?arguments[2]:!0;if(this.overlayVisible){var r=this.getOptionValue(t);this.updateModel(e,r),n&&this.hide(!0)}},onOptionMouseMove:function(e,t){this.focusOnHover&&this.changeFocusedOptionIndex(e,t)},onFilterChange:function(e){var t=e.target.value;this.filterValue=t,this.focusedOptionIndex=-1,this.$emit(`filter`,{originalEvent:e,value:t}),!this.virtualScrollerDisabled&&this.virtualScroller.scrollToIndex(0)},onFilterKeyDown:function(e){if(!e.isComposing)switch(e.code){case`ArrowDown`:this.onArrowDownKey(e);break;case`ArrowUp`:this.onArrowUpKey(e,!0);break;case`ArrowLeft`:case`ArrowRight`:this.onArrowLeftKey(e,!0);break;case`Home`:this.onHomeKey(e,!0);break;case`End`:this.onEndKey(e,!0);break;case`Enter`:case`NumpadEnter`:this.onEnterKey(e);break;case`Escape`:this.onEscapeKey(e);break;case`Tab`:this.onTabKey(e);break}},onFilterBlur:function(){this.focusedOptionIndex=-1},onFilterUpdated:function(){this.overlayVisible&&this.alignOverlay()},onOverlayClick:function(e){oe.emit(`overlay-click`,{originalEvent:e,target:this.$el})},onOverlayKeyDown:function(e){switch(e.code){case`Escape`:this.onEscapeKey(e);break}},onArrowDownKey:function(e){if(!this.overlayVisible)this.show(),this.editable&&this.changeFocusedOptionIndex(e,this.findSelectedOptionIndex());else{var t=this.focusedOptionIndex===-1?this.clicked?this.findFirstOptionIndex():this.findFirstFocusedOptionIndex():this.findNextOptionIndex(this.focusedOptionIndex);this.changeFocusedOptionIndex(e,t)}e.preventDefault()},onArrowUpKey:function(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:!1;if(e.altKey&&!t)this.focusedOptionIndex!==-1&&this.onOptionSelect(e,this.visibleOptions[this.focusedOptionIndex]),this.overlayVisible&&this.hide(),e.preventDefault();else{var n=this.focusedOptionIndex===-1?this.clicked?this.findLastOptionIndex():this.findLastFocusedOptionIndex():this.findPrevOptionIndex(this.focusedOptionIndex);this.changeFocusedOptionIndex(e,n),!this.overlayVisible&&this.show(),e.preventDefault()}},onArrowLeftKey:function(e){arguments.length>1&&arguments[1]!==void 0&&arguments[1]&&(this.focusedOptionIndex=-1)},onHomeKey:function(e){if(arguments.length>1&&arguments[1]!==void 0&&arguments[1]){var t=e.currentTarget;e.shiftKey?t.setSelectionRange(0,e.target.selectionStart):(t.setSelectionRange(0,0),this.focusedOptionIndex=-1)}else this.changeFocusedOptionIndex(e,this.findFirstOptionIndex()),!this.overlayVisible&&this.show();e.preventDefault()},onEndKey:function(e){if(arguments.length>1&&arguments[1]!==void 0&&arguments[1]){var t=e.currentTarget;if(e.shiftKey)t.setSelectionRange(e.target.selectionStart,t.value.length);else{var n=t.value.length;t.setSelectionRange(n,n),this.focusedOptionIndex=-1}}else this.changeFocusedOptionIndex(e,this.findLastOptionIndex()),!this.overlayVisible&&this.show();e.preventDefault()},onPageUpKey:function(e){this.scrollInView(0),e.preventDefault()},onPageDownKey:function(e){this.scrollInView(this.visibleOptions.length-1),e.preventDefault()},onEnterKey:function(e){this.overlayVisible?(this.focusedOptionIndex!==-1&&this.onOptionSelect(e,this.visibleOptions[this.focusedOptionIndex]),this.hide(!0)):(this.focusedOptionIndex=-1,this.onArrowDownKey(e)),e.preventDefault()},onSpaceKey:function(e){!(arguments.length>1&&arguments[1]!==void 0&&arguments[1])&&this.onEnterKey(e)},onEscapeKey:function(e){this.overlayVisible&&this.hide(!0),e.preventDefault(),e.stopPropagation()},onTabKey:function(e){arguments.length>1&&arguments[1]!==void 0&&arguments[1]||(this.overlayVisible&&this.hasFocusableElements()?(C(this.$refs.firstHiddenFocusableElementOnOverlay),e.preventDefault()):(this.focusedOptionIndex!==-1&&this.onOptionSelect(e,this.visibleOptions[this.focusedOptionIndex]),this.overlayVisible&&this.hide(this.filter)))},onBackspaceKey:function(e){arguments.length>1&&arguments[1]!==void 0&&arguments[1]&&!this.overlayVisible&&this.show()},onOverlayEnter:function(e){var t=this;W.set(`overlay`,e,this.$primevue.config.zIndex.overlay),ie(e,{position:`absolute`,top:`0`}),this.alignOverlay(),this.scrollInView(),this.$attrSelector&&e.setAttribute(this.$attrSelector,``),setTimeout(function(){t.autoFilterFocus&&t.filter&&C(t.$refs.filterInput.$el),t.autoUpdateModel()},1)},onOverlayAfterEnter:function(){this.bindOutsideClickListener(),this.bindScrollListener(),this.bindResizeListener(),this.$emit(`show`)},onOverlayLeave:function(e){var t=this;e.style.pointerEvents=`none`,this.unbindOutsideClickListener(),this.unbindScrollListener(),this.unbindResizeListener(),this.autoFilterFocus&&this.filter&&!this.editable&&this.$nextTick(function(){t.$refs.filterInput&&C(t.$refs.filterInput.$el)}),this.$emit(`hide`),this.overlay=null},onOverlayAfterLeave:function(e){W.clear(e)},alignOverlay:function(){this.appendTo===`self`?ae(this.overlay,this.$el):this.overlay&&(this.overlay.style.minWidth=E(this.$el)+`px`,w(this.overlay,this.$el))},bindOutsideClickListener:function(){var e=this;this.outsideClickListener||(this.outsideClickListener=function(t){var n=t.composedPath();e.overlayVisible&&e.overlay&&!n.includes(e.$el)&&!n.includes(e.overlay)&&e.hide()},document.addEventListener(`click`,this.outsideClickListener,!0))},unbindOutsideClickListener:function(){this.outsideClickListener&&=(document.removeEventListener(`click`,this.outsideClickListener,!0),null)},bindScrollListener:function(){var e=this;this.scrollHandler||=new z(this.$refs.container,function(){e.overlayVisible&&e.hide()}),this.scrollHandler.bindScrollListener()},unbindScrollListener:function(){this.scrollHandler&&this.scrollHandler.unbindScrollListener()},bindResizeListener:function(){var e=this;this.resizeListener||(this.resizeListener=function(){e.overlayVisible&&!v()&&e.hide()},window.addEventListener(`resize`,this.resizeListener))},unbindResizeListener:function(){this.resizeListener&&=(window.removeEventListener(`resize`,this.resizeListener),null)},bindLabelClickListener:function(){var e=this;if(!this.editable&&!this.labelClickListener){var t=document.querySelector(`label[for="${this.labelId}"]`);t&&b(t)&&(this.labelClickListener=function(){C(e.$refs.focusInput)},t.addEventListener(`click`,this.labelClickListener))}},unbindLabelClickListener:function(){if(this.labelClickListener){var e=document.querySelector(`label[for="${this.labelId}"]`);e&&b(e)&&e.removeEventListener(`click`,this.labelClickListener)}},bindMatchMediaOrientationListener:function(){var e=this;this.matchMediaOrientationListener||(this.queryOrientation=matchMedia(`(orientation: portrait)`),this.matchMediaOrientationListener=function(){e.alignOverlay()},this.queryOrientation.addEventListener(`change`,this.matchMediaOrientationListener))},unbindMatchMediaOrientationListener:function(){this.matchMediaOrientationListener&&=(this.queryOrientation.removeEventListener(`change`,this.matchMediaOrientationListener),this.queryOrientation=null,null)},hasFocusableElements:function(){return S(this.overlay,`:not([data-p-hidden-focusable="true"])`).length>0},isOptionExactMatched:function(e){return this.isValidOption(e)&&typeof this.getOptionLabel(e)==`string`&&this.getOptionLabel(e)?.toLocaleLowerCase(this.filterLocale)==this.searchValue.toLocaleLowerCase(this.filterLocale)},isOptionStartsWith:function(e){return this.isValidOption(e)&&typeof this.getOptionLabel(e)==`string`&&this.getOptionLabel(e)?.toLocaleLowerCase(this.filterLocale).startsWith(this.searchValue.toLocaleLowerCase(this.filterLocale))},isValidOption:function(e){return y(e)&&!(this.isOptionDisabled(e)||this.isOptionGroup(e))},isValidSelectedOption:function(e){return this.isValidOption(e)&&this.isSelected(e)},isSelected:function(e){return T(this.d_value,this.getOptionValue(e),this.equalityKey)},findFirstOptionIndex:function(){var e=this;return this.visibleOptions.findIndex(function(t){return e.isValidOption(t)})},findLastOptionIndex:function(){var e=this;return N(this.visibleOptions,function(t){return e.isValidOption(t)})},findNextOptionIndex:function(e){var t=this,n=e<this.visibleOptions.length-1?this.visibleOptions.slice(e+1).findIndex(function(e){return t.isValidOption(e)}):-1;return n>-1?n+e+1:e},findPrevOptionIndex:function(e){var t=this,n=e>0?N(this.visibleOptions.slice(0,e),function(e){return t.isValidOption(e)}):-1;return n>-1?n:e},findSelectedOptionIndex:function(){var e=this;return this.visibleOptions.findIndex(function(t){return e.isValidSelectedOption(t)})},findFirstFocusedOptionIndex:function(){var e=this.findSelectedOptionIndex();return e<0?this.findFirstOptionIndex():e},findLastFocusedOptionIndex:function(){var e=this.findSelectedOptionIndex();return e<0?this.findLastOptionIndex():e},searchOptions:function(e,t){var n=this;this.searchValue=(this.searchValue||``)+t;var r=-1,i=!1;return y(this.searchValue)&&(r=this.visibleOptions.findIndex(function(e){return n.isOptionExactMatched(e)}),r===-1&&(r=this.visibleOptions.findIndex(function(e){return n.isOptionStartsWith(e)})),r!==-1&&(i=!0),r===-1&&this.focusedOptionIndex===-1&&(r=this.findFirstFocusedOptionIndex()),r!==-1&&this.changeFocusedOptionIndex(e,r)),this.searchTimeout&&clearTimeout(this.searchTimeout),this.searchTimeout=setTimeout(function(){n.searchValue=``,n.searchTimeout=null},500),i},changeFocusedOptionIndex:function(e,t){this.focusedOptionIndex!==t&&(this.focusedOptionIndex=t,this.scrollInView(),this.selectOnFocus&&this.onOptionSelect(e,this.visibleOptions[t],!1))},scrollInView:function(){var e=this,t=arguments.length>0&&arguments[0]!==void 0?arguments[0]:-1;this.$nextTick(function(){var n=t===-1?e.focusedOptionId:`${e.$id}_${t}`,r=A(e.list,`li[id="${n}"]`);r?r.scrollIntoView&&r.scrollIntoView({block:`nearest`,inline:`nearest`}):e.virtualScrollerDisabled||e.virtualScroller&&e.virtualScroller.scrollToIndex(t===-1?e.focusedOptionIndex:t)})},autoUpdateModel:function(){this.autoOptionFocus&&(this.focusedOptionIndex=this.findFirstFocusedOptionIndex()),this.selectOnFocus&&this.autoOptionFocus&&!this.$filled&&this.onOptionSelect(null,this.visibleOptions[this.focusedOptionIndex],!1)},updateModel:function(e,t){this.writeValue(t,e),this.$emit(`change`,{originalEvent:e,value:t})},flatOptions:function(e){var t=this;return(e||[]).reduce(function(e,n,r){e.push({optionGroup:n,group:!0,index:r});var i=t.getOptionGroupChildren(n);return i&&i.forEach(function(t){return e.push(t)}),e},[])},overlayRef:function(e){this.overlay=e},listRef:function(e,t){this.list=e,t&&t(e)},virtualScrollerRef:function(e){this.virtualScroller=e}},computed:{visibleOptions:function(){var e=this,t=this.optionGroupLabel?this.flatOptions(this.options):this.options||[];if(this.filterValue){var n=R.filter(t,this.searchFields,this.filterValue,this.filterMatchMode,this.filterLocale);if(this.optionGroupLabel){var r=this.options||[],i=[];return r.forEach(function(t){var r=e.getOptionGroupChildren(t).filter(function(e){return n.includes(e)});r.length>0&&i.push(X(X({},t),{},Z({},typeof e.optionGroupChildren==`string`?e.optionGroupChildren:`items`,xe(r))))}),this.flatOptions(i)}return n}return t},hasSelectedOption:function(){return this.$filled},label:function(){var e=this.findSelectedOptionIndex();return e===-1?this.placeholder||`p-emptylabel`:this.getOptionLabel(this.visibleOptions[e])},editableInputValue:function(){var e=this.findSelectedOptionIndex();return e===-1?this.d_value||``:this.getOptionLabel(this.visibleOptions[e])},equalityKey:function(){return this.optionValue?null:this.dataKey},searchFields:function(){return this.filterFields||[this.optionLabel]},filterResultMessageText:function(){return y(this.visibleOptions)?this.filterMessageText.replaceAll(`{0}`,this.visibleOptions.length):this.emptyFilterMessageText},filterMessageText:function(){return this.filterMessage||this.$primevue.config.locale.searchMessage||``},emptyFilterMessageText:function(){return this.emptyFilterMessage||this.$primevue.config.locale.emptySearchMessage||this.$primevue.config.locale.emptyFilterMessage||``},emptyMessageText:function(){return this.emptyMessage||this.$primevue.config.locale.emptyMessage||``},selectionMessageText:function(){return this.selectionMessage||this.$primevue.config.locale.selectionMessage||``},emptySelectionMessageText:function(){return this.emptySelectionMessage||this.$primevue.config.locale.emptySelectionMessage||``},selectedMessageText:function(){return this.$filled?this.selectionMessageText.replaceAll(`{0}`,`1`):this.emptySelectionMessageText},focusedOptionId:function(){return this.focusedOptionIndex===-1?null:`${this.$id}_${this.focusedOptionIndex}`},ariaSetSize:function(){var e=this;return this.visibleOptions.filter(function(t){return!e.isOptionGroup(t)}).length},isClearIconVisible:function(){return this.showClear&&this.d_value!=null&&!this.disabled&&!this.loading},virtualScrollerDisabled:function(){return!this.virtualScrollerOptions},containerDataP:function(){return j(Z({invalid:this.$invalid,disabled:this.disabled,focus:this.focused,fluid:this.$fluid,filled:this.$variant===`filled`},this.size,this.size))},labelDataP:function(){return j(Z(Z({placeholder:!this.editable&&this.label===this.placeholder,clearable:this.showClear,disabled:this.disabled,editable:this.editable},this.size,this.size),`empty`,!this.editable&&!this.$slots.value&&(this.label===`p-emptylabel`||this.label.length===0)))},dropdownIconDataP:function(){return j(Z({},this.size,this.size))},overlayDataP:function(){return j(Z({},`portal-`+this.appendTo,`portal-`+this.appendTo))}},directives:{ripple:fe},components:{InputText:L,VirtualScroller:se,Portal:H,InputIcon:F,IconField:ce,TimesIcon:U,ChevronDownIcon:le,SpinnerIcon:V,SearchIcon:ue,CheckIcon:B,BlankIcon:G}},Oe=[`id`,`data-p`],ke=[`name`,`id`,`value`,`placeholder`,`tabindex`,`disabled`,`aria-label`,`aria-labelledby`,`aria-expanded`,`aria-controls`,`aria-activedescendant`,`aria-invalid`,`data-p`],Ae=[`name`,`id`,`tabindex`,`aria-label`,`aria-labelledby`,`aria-expanded`,`aria-controls`,`aria-activedescendant`,`aria-invalid`,`aria-disabled`,`data-p`],$=[`data-p`],je=[`id`],Me=[`id`],Ne=[`id`,`aria-label`,`aria-selected`,`aria-disabled`,`aria-setsize`,`aria-posinset`,`onMousedown`,`onMousemove`,`data-p-selected`,`data-p-focused`,`data-p-disabled`];function Pe(v,y,b,ie,x,S){var C=c(`SpinnerIcon`),w=c(`InputText`),T=c(`SearchIcon`),E=c(`InputIcon`),D=c(`IconField`),O=c(`CheckIcon`),k=c(`BlankIcon`),A=c(`VirtualScroller`),j=c(`Portal`),M=te(`ripple`);return s(),f(`div`,t({ref:`container`,id:v.$id,class:v.cx(`root`),onClick:y[12]||=function(){return S.onContainerClick&&S.onContainerClick.apply(S,arguments)},"data-p":S.containerDataP},v.ptmi(`root`)),[v.editable?(s(),f(`input`,t({key:0,ref:`focusInput`,name:v.name,id:v.labelId||v.inputId,type:`text`,class:[v.cx(`label`),v.inputClass,v.labelClass],style:[v.inputStyle,v.labelStyle],value:S.editableInputValue,placeholder:v.placeholder,tabindex:v.disabled?-1:v.tabindex,disabled:v.disabled,autocomplete:`off`,role:`combobox`,"aria-label":v.ariaLabel,"aria-labelledby":v.ariaLabelledby,"aria-haspopup":`listbox`,"aria-expanded":x.overlayVisible,"aria-controls":x.overlayVisible?v.$id+`_list`:void 0,"aria-activedescendant":x.focused?S.focusedOptionId:void 0,"aria-invalid":v.invalid||void 0,onFocus:y[0]||=function(){return S.onFocus&&S.onFocus.apply(S,arguments)},onBlur:y[1]||=function(){return S.onBlur&&S.onBlur.apply(S,arguments)},onKeydown:y[2]||=function(){return S.onKeyDown&&S.onKeyDown.apply(S,arguments)},onInput:y[3]||=function(){return S.onEditableInput&&S.onEditableInput.apply(S,arguments)},"data-p":S.labelDataP},v.ptm(`label`)),null,16,ke)):(s(),f(`span`,t({key:1,ref:`focusInput`,name:v.name,id:v.labelId||v.inputId,class:[v.cx(`label`),v.inputClass,v.labelClass],style:[v.inputStyle,v.labelStyle],tabindex:v.disabled?-1:v.tabindex,role:`combobox`,"aria-label":v.ariaLabel||(S.label===`p-emptylabel`?void 0:S.label),"aria-labelledby":v.ariaLabelledby,"aria-haspopup":`listbox`,"aria-expanded":x.overlayVisible,"aria-controls":v.$id+`_list`,"aria-activedescendant":x.focused?S.focusedOptionId:void 0,"aria-invalid":v.invalid||void 0,"aria-disabled":v.disabled,onFocus:y[4]||=function(){return S.onFocus&&S.onFocus.apply(S,arguments)},onBlur:y[5]||=function(){return S.onBlur&&S.onBlur.apply(S,arguments)},onKeydown:y[6]||=function(){return S.onKeyDown&&S.onKeyDown.apply(S,arguments)},"data-p":S.labelDataP},v.ptm(`label`)),[i(v.$slots,`value`,{value:v.d_value,placeholder:v.placeholder},function(){return[p(n(S.label===`p-emptylabel`?`\xA0`:S.label??`empty`),1)]})],16,Ae)),S.isClearIconVisible?i(v.$slots,`clearicon`,{key:2,class:a(v.cx(`clearIcon`)),clearCallback:S.onClearClick},function(){return[(s(),h(e(v.clearIcon?`i`:`TimesIcon`),t({ref:`clearIcon`,class:[v.cx(`clearIcon`),v.clearIcon],onClick:S.onClearClick},v.ptm(`clearIcon`),{"data-pc-section":`clearicon`}),null,16,[`class`,`onClick`]))]}):_(``,!0),d(`div`,t({class:v.cx(`dropdown`)},v.ptm(`dropdown`)),[v.loading?i(v.$slots,`loadingicon`,{key:0,class:a(v.cx(`loadingIcon`))},function(){return[v.loadingIcon?(s(),f(`span`,t({key:0,class:[v.cx(`loadingIcon`),`pi-spin`,v.loadingIcon],"aria-hidden":`true`},v.ptm(`loadingIcon`)),null,16)):(s(),h(C,t({key:1,class:v.cx(`loadingIcon`),spin:``,"aria-hidden":`true`},v.ptm(`loadingIcon`)),null,16,[`class`]))]}):i(v.$slots,`dropdownicon`,{key:1,class:a(v.cx(`dropdownIcon`))},function(){return[(s(),h(e(v.dropdownIcon?`span`:`ChevronDownIcon`),t({class:[v.cx(`dropdownIcon`),v.dropdownIcon],"aria-hidden":`true`,"data-p":S.dropdownIconDataP},v.ptm(`dropdownIcon`)),null,16,[`class`,`data-p`]))]})],16),u(j,{appendTo:v.appendTo},{default:l(function(){return[u(re,t({name:`p-anchored-overlay`,onEnter:S.onOverlayEnter,onAfterEnter:S.onOverlayAfterEnter,onLeave:S.onOverlayLeave,onAfterLeave:S.onOverlayAfterLeave},v.ptm(`transition`)),{default:l(function(){return[x.overlayVisible?(s(),f(`div`,t({key:0,ref:S.overlayRef,class:[v.cx(`overlay`),v.panelClass,v.overlayClass],style:[v.panelStyle,v.overlayStyle],onClick:y[10]||=function(){return S.onOverlayClick&&S.onOverlayClick.apply(S,arguments)},onKeydown:y[11]||=function(){return S.onOverlayKeyDown&&S.onOverlayKeyDown.apply(S,arguments)},"data-p":S.overlayDataP},v.ptm(`overlay`)),[d(`span`,t({ref:`firstHiddenFocusableElementOnOverlay`,role:`presentation`,"aria-hidden":`true`,class:`p-hidden-accessible p-hidden-focusable`,tabindex:0,onFocus:y[7]||=function(){return S.onFirstHiddenFocus&&S.onFirstHiddenFocus.apply(S,arguments)}},v.ptm(`hiddenFirstFocusableEl`),{"data-p-hidden-accessible":!0,"data-p-hidden-focusable":!0}),null,16),i(v.$slots,`header`,{value:v.d_value,options:S.visibleOptions}),v.filter?(s(),f(`div`,t({key:0,class:v.cx(`header`)},v.ptm(`header`)),[u(D,{unstyled:v.unstyled,pt:v.ptm(`pcFilterContainer`)},{default:l(function(){return[u(w,{ref:`filterInput`,type:`text`,value:x.filterValue,onVnodeMounted:S.onFilterUpdated,onVnodeUpdated:S.onFilterUpdated,class:a(v.cx(`pcFilter`)),placeholder:v.filterPlaceholder,variant:v.variant,unstyled:v.unstyled,role:`searchbox`,autocomplete:`off`,"aria-owns":v.$id+`_list`,"aria-activedescendant":S.focusedOptionId,onKeydown:S.onFilterKeyDown,onBlur:S.onFilterBlur,onInput:S.onFilterChange,pt:v.ptm(`pcFilter`),formControl:{novalidate:!0}},null,8,[`value`,`onVnodeMounted`,`onVnodeUpdated`,`class`,`placeholder`,`variant`,`unstyled`,`aria-owns`,`aria-activedescendant`,`onKeydown`,`onBlur`,`onInput`,`pt`]),u(E,{unstyled:v.unstyled,pt:v.ptm(`pcFilterIconContainer`)},{default:l(function(){return[i(v.$slots,`filtericon`,{},function(){return[v.filterIcon?(s(),f(`span`,t({key:0,class:v.filterIcon},v.ptm(`filterIcon`)),null,16)):(s(),h(T,o(t({key:1},v.ptm(`filterIcon`))),null,16))]})]}),_:3},8,[`unstyled`,`pt`])]}),_:3},8,[`unstyled`,`pt`]),d(`span`,t({role:`status`,"aria-live":`polite`,class:`p-hidden-accessible`},v.ptm(`hiddenFilterResult`),{"data-p-hidden-accessible":!0}),n(S.filterResultMessageText),17)],16)):_(``,!0),d(`div`,t({class:v.cx(`listContainer`),style:{"max-height":S.virtualScrollerDisabled?v.scrollHeight:``}},v.ptm(`listContainer`)),[u(A,t({ref:S.virtualScrollerRef},v.virtualScrollerOptions,{items:S.visibleOptions,style:{height:v.scrollHeight},tabindex:-1,disabled:S.virtualScrollerDisabled,pt:v.ptm(`virtualScroller`)}),g({content:l(function(e){var a=e.styleClass,o=e.contentRef,c=e.items,l=e.getItemOptions,u=e.contentStyle,g=e.itemSize;return[d(`ul`,t({ref:function(e){return S.listRef(e,o)},id:v.$id+`_list`,class:[v.cx(`list`),a],style:u,role:`listbox`},v.ptm(`list`)),[(s(!0),f(m,null,r(c,function(e,r){return s(),f(m,{key:S.getOptionRenderKey(e,S.getOptionIndex(r,l))},[S.isOptionGroup(e)?(s(),f(`li`,t({key:0,id:v.$id+`_`+S.getOptionIndex(r,l),style:{height:g?g+`px`:void 0},class:v.cx(`optionGroup`),role:`option`},{ref_for:!0},v.ptm(`optionGroup`)),[i(v.$slots,`optiongroup`,{option:e.optionGroup,index:S.getOptionIndex(r,l)},function(){return[d(`span`,t({class:v.cx(`optionGroupLabel`)},{ref_for:!0},v.ptm(`optionGroupLabel`)),n(S.getOptionGroupLabel(e.optionGroup)),17)]})],16,Me)):ee((s(),f(`li`,t({key:1,id:v.$id+`_`+S.getOptionIndex(r,l),class:v.cx(`option`,{option:e,focusedOption:S.getOptionIndex(r,l)}),style:{height:g?g+`px`:void 0},role:`option`,"aria-label":S.getOptionLabel(e),"aria-selected":S.isSelected(e),"aria-disabled":S.isOptionDisabled(e),"aria-setsize":S.ariaSetSize,"aria-posinset":S.getAriaPosInset(S.getOptionIndex(r,l)),onMousedown:function(t){return S.onOptionSelect(t,e)},onMousemove:function(e){return S.onOptionMouseMove(e,S.getOptionIndex(r,l))},onClick:y[8]||=ne(function(){},[`stop`]),"data-p-selected":!v.checkmark&&S.isSelected(e),"data-p-focused":x.focusedOptionIndex===S.getOptionIndex(r,l),"data-p-disabled":S.isOptionDisabled(e)},{ref_for:!0},S.getPTItemOptions(e,l,r,`option`)),[v.checkmark?(s(),f(m,{key:0},[S.isSelected(e)?(s(),h(O,t({key:0,class:v.cx(`optionCheckIcon`)},{ref_for:!0},v.ptm(`optionCheckIcon`)),null,16,[`class`])):(s(),h(k,t({key:1,class:v.cx(`optionBlankIcon`)},{ref_for:!0},v.ptm(`optionBlankIcon`)),null,16,[`class`]))],64)):_(``,!0),i(v.$slots,`option`,{option:e,selected:S.isSelected(e),index:S.getOptionIndex(r,l)},function(){return[d(`span`,t({class:v.cx(`optionLabel`)},{ref_for:!0},v.ptm(`optionLabel`)),n(S.getOptionLabel(e)),17)]})],16,Ne)),[[M]])],64)}),128)),x.filterValue&&(!c||c&&c.length===0)?(s(),f(`li`,t({key:0,class:v.cx(`emptyMessage`),role:`option`},v.ptm(`emptyMessage`),{"data-p-hidden-accessible":!0}),[i(v.$slots,`emptyfilter`,{},function(){return[p(n(S.emptyFilterMessageText),1)]})],16)):!v.options||v.options&&v.options.length===0?(s(),f(`li`,t({key:1,class:v.cx(`emptyMessage`),role:`option`},v.ptm(`emptyMessage`),{"data-p-hidden-accessible":!0}),[i(v.$slots,`empty`,{},function(){return[p(n(S.emptyMessageText),1)]})],16)):_(``,!0)],16,je)]}),_:2},[v.$slots.loader?{name:`loader`,fn:l(function(e){var t=e.options;return[i(v.$slots,`loader`,{options:t})]}),key:`0`}:void 0]),1040,[`items`,`style`,`disabled`,`pt`])],16),i(v.$slots,`footer`,{value:v.d_value,options:S.visibleOptions}),!v.options||v.options&&v.options.length===0?(s(),f(`span`,t({key:1,role:`status`,"aria-live":`polite`,class:`p-hidden-accessible`},v.ptm(`hiddenEmptyMessage`),{"data-p-hidden-accessible":!0}),n(S.emptyMessageText),17)):_(``,!0),d(`span`,t({role:`status`,"aria-live":`polite`,class:`p-hidden-accessible`},v.ptm(`hiddenSelectedMessage`),{"data-p-hidden-accessible":!0}),n(S.selectedMessageText),17),d(`span`,t({ref:`lastHiddenFocusableElementOnOverlay`,role:`presentation`,"aria-hidden":`true`,class:`p-hidden-accessible p-hidden-focusable`,tabindex:0,onFocus:y[9]||=function(){return S.onLastHiddenFocus&&S.onLastHiddenFocus.apply(S,arguments)}},v.ptm(`hiddenLastFocusableEl`),{"data-p-hidden-accessible":!0,"data-p-hidden-focusable":!0}),null,16)],16,$)):_(``,!0)]}),_:3},16,[`onEnter`,`onAfterEnter`,`onLeave`,`onAfterLeave`])]}),_:3},8,[`appendTo`])],16,Oe)}Q.render=Pe;export{Q as t};