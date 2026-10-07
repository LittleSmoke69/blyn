import{c as ne,r as p,j as e,B as m,d as _,a as ee,D as V,g as B,h as Q,i as U,t as G,E as K}from"./index-BPTQAWgW.js";import{M as ge,H as se}from"./MainLayout-DDjOqLp_.js";import{I as f}from"./input-B3VLt03S.js";import{L as r}from"./label-BvvSglEt.js";import{C as S,b as M,c as A,a as E}from"./card-C_7jeLTv.js";import{T as be,b as ve,c as P,d as R,a as Ne,C as ye}from"./tabs-BEDbJ4Os.js";import{S as F,a as I,b as L,c as $,d as T}from"./select-B3j9OsYk.js";import{T as W}from"./textarea-DcaVjBJJ.js";import{T as Y,a as J,b as C,c as l,d as X,e as n}from"./table-T2wG6DIf.js";import{u as we}from"./useIngredients-BlURt1w7.js";import{u as Ce,a as ke,b as _e,c as Se}from"./useStockMovements-Buk6eYxa.js";import{C as Z}from"./checkbox-CaQ_MwHS.js";import{M as ie}from"./minus-DtYEXYPn.js";import{P as de}from"./plus-DRf4vrU_.js";import{T as Me}from"./triangle-alert-6S4eRM3v.js";import{P as ae}from"./package-TesLwLxF.js";import{S as te}from"./shopping-cart-Dt9rCqDK.js";import{R as re}from"./refresh-cw-oGk-01f0.js";import{f as Ae}from"./format-C_QtCTl8.js";import{p as Ee}from"./pt-BR-CtCauWzC.js";import"./sheet-CMqPi0rG.js";import"./logo-blyn-XA4ahYsb.js";import"./lock-blPPZ6o_.js";import"./trending-up-CenEQDFt.js";import"./index-CV7I-2Cw.js";import"./index-BTNI8LLw.js";import"./useMutation-FCTW_jmC.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Te=ne("Printer",[["path",{d:"M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2",key:"143wyd"}],["path",{d:"M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6",key:"1itne7"}],["rect",{x:"6",y:"14",width:"12",height:"8",rx:"1",key:"1ue0tg"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ce=ne("Tag",[["path",{d:"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z",key:"vktsd0"}],["circle",{cx:"7.5",cy:"7.5",r:".5",fill:"currentColor",key:"kqv944"}]]),le={produto:"",abertura:"",validade:"",manipuladoPor:"",congelado:!1,resfriado:!1,temperaturaAmbiente:!1};function qe(){const[t,c]=p.useState({...le}),[g,b]=p.useState(1),[o,N]=p.useState("filled"),i=p.useRef(null),y=()=>{if(!i.current)return;const v=window.open("","_blank");if(!v)return;const k=[];for(let u=0;u<g;u++)k.push(d(o==="filled"?t:le));v.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Etiquetas de Validade</title>
        <style>
          @page {
            size: 60mm 40mm;
            margin: 0;
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .label {
            width: 60mm;
            height: 40mm;
            padding: 2mm 3mm;
            page-break-after: always;
            border: 1px solid #ccc;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .label:last-child {
            page-break-after: auto;
          }
          .field {
            display: flex;
            align-items: baseline;
            gap: 2px;
            font-size: 8pt;
            line-height: 1.4;
          }
          .field-label {
            font-weight: bold;
            white-space: nowrap;
            font-size: 8pt;
          }
          .field-line {
            flex: 1;
            border-bottom: 1px solid #333;
            min-height: 12px;
            font-size: 8pt;
            padding-left: 2px;
          }
          .checkboxes {
            display: flex;
            flex-wrap: wrap;
            gap: 2mm;
            justify-content: center;
            margin-top: 1mm;
          }
          .checkbox-item {
            display: flex;
            align-items: center;
            gap: 1.5mm;
            font-size: 7pt;
          }
          .checkbox-box {
            width: 3mm;
            height: 3mm;
            border: 1px solid #333;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 7pt;
            line-height: 1;
          }
          @media screen {
            body { padding: 20px; display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
            .label { border: 1px solid #999; }
          }
        </style>
      </head>
      <body>
        ${k.join("")}
      </body>
      </html>
    `),v.document.close(),setTimeout(()=>{v.print()},300)},d=a=>`
    <div class="label">
      <div class="field">
        <span class="field-label">Produto:</span>
        <span class="field-line">${a.produto}</span>
      </div>
      <div class="field">
        <span class="field-label">Abertura:</span>
        <span class="field-line">${a.abertura}</span>
      </div>
      <div class="field">
        <span class="field-label">Validade:</span>
        <span class="field-line">${a.validade}</span>
      </div>
      <div class="field">
        <span class="field-label">Manipulado por:</span>
        <span class="field-line">${a.manipuladoPor}</span>
      </div>
      <div class="checkboxes">
        <div class="checkbox-item">
          <div class="checkbox-box">${a.congelado?"✓":""}</div>
          <span>Congelado</span>
        </div>
        <div class="checkbox-item">
          <div class="checkbox-box">${a.resfriado?"✓":""}</div>
          <span>Resfriado</span>
        </div>
        <div class="checkbox-item">
          <div class="checkbox-box">${a.temperaturaAmbiente?"✓":""}</div>
          <span>Temperatura ambiente</span>
        </div>
      </div>
    </div>
  `;return e.jsxs(S,{children:[e.jsx(M,{children:e.jsxs(A,{className:"flex items-center gap-2",children:[e.jsx(ce,{className:"h-5 w-5"}),"Etiquetas de Validade"]})}),e.jsxs(E,{className:"space-y-6",children:[e.jsxs("div",{className:"space-y-2",children:[e.jsx(r,{children:"Modo de Impressão"}),e.jsxs(F,{value:o,onValueChange:a=>N(a),children:[e.jsx(I,{children:e.jsx(L,{})}),e.jsxs($,{children:[e.jsx(T,{value:"filled",children:"Preencher antes de imprimir"}),e.jsx(T,{value:"empty",children:"Imprimir em branco (preencher à mão)"})]})]})]}),o==="filled"&&e.jsxs("div",{className:"space-y-4 rounded-lg border border-border p-4",children:[e.jsxs("div",{className:"space-y-2",children:[e.jsx(r,{htmlFor:"label-produto",children:"Produto"}),e.jsx(f,{id:"label-produto",value:t.produto,onChange:a=>c({...t,produto:a.target.value}),placeholder:"Ex: Frango desfiado"})]}),e.jsxs("div",{className:"grid grid-cols-2 gap-4",children:[e.jsxs("div",{className:"space-y-2",children:[e.jsx(r,{htmlFor:"label-abertura",children:"Data de Abertura"}),e.jsx(f,{id:"label-abertura",type:"date",value:t.abertura,onChange:a=>c({...t,abertura:a.target.value})})]}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(r,{htmlFor:"label-validade",children:"Data de Validade"}),e.jsx(f,{id:"label-validade",type:"date",value:t.validade,onChange:a=>c({...t,validade:a.target.value})})]})]}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(r,{htmlFor:"label-manipulado",children:"Manipulado por"}),e.jsx(f,{id:"label-manipulado",value:t.manipuladoPor,onChange:a=>c({...t,manipuladoPor:a.target.value}),placeholder:"Nome do responsável"})]}),e.jsxs("div",{className:"space-y-3",children:[e.jsx(r,{children:"Armazenamento"}),e.jsxs("div",{className:"flex flex-wrap gap-4",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(Z,{id:"congelado",checked:t.congelado,onCheckedChange:a=>c({...t,congelado:!!a})}),e.jsx(r,{htmlFor:"congelado",className:"cursor-pointer font-normal",children:"Congelado"})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(Z,{id:"resfriado",checked:t.resfriado,onCheckedChange:a=>c({...t,resfriado:!!a})}),e.jsx(r,{htmlFor:"resfriado",className:"cursor-pointer font-normal",children:"Resfriado"})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(Z,{id:"temp-ambiente",checked:t.temperaturaAmbiente,onCheckedChange:a=>c({...t,temperaturaAmbiente:!!a})}),e.jsx(r,{htmlFor:"temp-ambiente",className:"cursor-pointer font-normal",children:"Temperatura ambiente"})]})]})]})]}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(r,{children:"Quantidade de etiquetas"}),e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx(m,{type:"button",variant:"outline",size:"icon",onClick:()=>b(Math.max(1,g-1)),children:e.jsx(ie,{className:"h-4 w-4"})}),e.jsx(f,{type:"number",min:1,max:100,value:g,onChange:a=>b(Math.max(1,Math.min(100,parseInt(a.target.value)||1))),className:"w-20 text-center"}),e.jsx(m,{type:"button",variant:"outline",size:"icon",onClick:()=>b(Math.min(100,g+1)),children:e.jsx(de,{className:"h-4 w-4"})})]})]}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(r,{children:"Pré-visualização"}),e.jsx("div",{className:"flex justify-center rounded-lg border border-border bg-muted/30 p-6",children:e.jsx("div",{ref:i,className:"w-[227px] rounded border border-border bg-white p-3 shadow-sm",style:{fontFamily:"Arial, sans-serif"},children:e.jsxs("div",{className:"space-y-1.5 text-xs text-black",children:[e.jsxs("div",{className:"flex items-baseline gap-1",children:[e.jsx("span",{className:"font-bold whitespace-nowrap",children:"Produto:"}),e.jsx("span",{className:"flex-1 border-b border-black min-h-[14px] text-[10px]",children:o==="filled"?t.produto:""})]}),e.jsxs("div",{className:"flex items-baseline gap-1",children:[e.jsx("span",{className:"font-bold whitespace-nowrap",children:"Abertura:"}),e.jsx("span",{className:"flex-1 border-b border-black min-h-[14px] text-[10px]",children:o==="filled"&&t.abertura?new Date(t.abertura+"T12:00:00").toLocaleDateString("pt-BR"):e.jsx("span",{className:"text-muted-foreground",children:"__/__/__"})})]}),e.jsxs("div",{className:"flex items-baseline gap-1",children:[e.jsx("span",{className:"font-bold whitespace-nowrap",children:"Validade:"}),e.jsx("span",{className:"flex-1 border-b border-black min-h-[14px] text-[10px]",children:o==="filled"&&t.validade?new Date(t.validade+"T12:00:00").toLocaleDateString("pt-BR"):e.jsx("span",{className:"text-muted-foreground",children:"__/__/__"})})]}),e.jsxs("div",{className:"flex items-baseline gap-1",children:[e.jsx("span",{className:"font-bold whitespace-nowrap",children:"Manipulado por:"}),e.jsx("span",{className:"flex-1 border-b border-black min-h-[14px] text-[10px]",children:o==="filled"?t.manipuladoPor:""})]}),e.jsxs("div",{className:"flex flex-wrap justify-center gap-x-3 gap-y-1 pt-1 text-[10px]",children:[e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx("div",{className:"h-3 w-3 border border-black flex items-center justify-center text-[8px]",children:o==="filled"&&t.congelado?"✓":""}),e.jsx("span",{children:"Congelado"})]}),e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx("div",{className:"h-3 w-3 border border-black flex items-center justify-center text-[8px]",children:o==="filled"&&t.resfriado?"✓":""}),e.jsx("span",{children:"Resfriado"})]}),e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx("div",{className:"h-3 w-3 border border-black flex items-center justify-center text-[8px]",children:o==="filled"&&t.temperaturaAmbiente?"✓":""}),e.jsx("span",{children:"Temperatura ambiente"})]})]})]})})})]}),e.jsxs(m,{onClick:y,className:"w-full gap-2",size:"lg",children:[e.jsx(Te,{className:"h-5 w-5"}),"Imprimir ",g," Etiqueta",g>1?"s":""]})]})]})}function ns(){const[t,c]=p.useState(!1),[g,b]=p.useState(!1),[o,N]=p.useState(!1),[i,y]=p.useState(""),[d,a]=p.useState(0),[v,k]=p.useState(0),[u,q]=p.useState(""),{data:x,isLoading:oe}=we(),{data:O,isLoading:xe}=Ce(),{data:z}=ke(),{data:h}=_e(),j=Se(),H=()=>{y(""),a(0),k(0),q("")},me=async()=>{!i||d<=0||(await j.mutateAsync({ingredient_id:i,type:"entrada",quantity:d,unit_cost:v>0?v:void 0,reference_type:"compra",notes:u||void 0}),c(!1),H())},he=async()=>{!i||d<=0||(await j.mutateAsync({ingredient_id:i,type:"saida",quantity:d,reference_type:"manual",notes:u||void 0}),b(!1),H())},pe=async()=>{!i||d<0||(await j.mutateAsync({ingredient_id:i,type:"ajuste",quantity:d,reference_type:"inventario",notes:u||void 0}),N(!1),H())},ue=s=>{switch(s){case"entrada":return e.jsx(ye,{className:"h-4 w-4 text-green-500"});case"saida":return e.jsx(Ne,{className:"h-4 w-4 text-red-500"});default:return e.jsx(re,{className:"h-4 w-4 text-blue-500"})}},je=s=>{switch(s){case"entrada":return"Entrada";case"saida":return"Saída";default:return"Ajuste"}},fe=(h==null?void 0:h.reduce((s,w)=>s+w.estimated_cost,0))||0;return e.jsxs(ge,{children:[e.jsxs("div",{className:"space-y-6",children:[e.jsxs("div",{className:"flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4",children:[e.jsxs("div",{children:[e.jsx("h1",{className:"font-display text-3xl font-bold text-foreground",children:"Controle de Estoque"}),e.jsx("p",{className:"mt-1 text-muted-foreground",children:"Gerencie entradas, saídas e monitore seu estoque"})]}),e.jsxs("div",{className:"flex gap-2",children:[e.jsxs(m,{onClick:()=>c(!0),className:"gap-2",children:[e.jsx(de,{className:"h-4 w-4"}),"Entrada"]}),e.jsxs(m,{variant:"outline",onClick:()=>b(!0),className:"gap-2",children:[e.jsx(ie,{className:"h-4 w-4"}),"Saída"]})]})]}),z&&z.length>0&&e.jsxs(S,{className:"border-destructive/50 bg-destructive/5",children:[e.jsx(M,{className:"pb-2",children:e.jsxs(A,{className:"flex items-center gap-2 text-destructive",children:[e.jsx(Me,{className:"h-5 w-5"}),"Alerta de Estoque Baixo"]})}),e.jsx(E,{children:e.jsx("div",{className:"flex flex-wrap gap-2",children:z.map(s=>e.jsxs(_,{variant:"destructive",className:"gap-1",children:[s.name,": ",s.current_stock||0," ",s.unit,e.jsxs("span",{className:"opacity-70",children:["(mín: ",s.min_stock,")"]})]},s.id))})})]}),e.jsxs(be,{defaultValue:"stock",className:"space-y-4",children:[e.jsxs(ve,{children:[e.jsxs(P,{value:"stock",className:"gap-2",children:[e.jsx(ae,{className:"h-4 w-4"}),"Estoque Atual"]}),e.jsxs(P,{value:"movements",className:"gap-2",children:[e.jsx(se,{className:"h-4 w-4"}),"Movimentações"]}),e.jsxs(P,{value:"shopping",className:"gap-2",children:[e.jsx(te,{className:"h-4 w-4"}),"Lista de Compras",h&&h.length>0&&e.jsx(_,{variant:"secondary",className:"ml-1",children:h.length})]}),e.jsxs(P,{value:"labels",className:"gap-2",children:[e.jsx(ce,{className:"h-4 w-4"}),"Etiquetas"]})]}),e.jsx(R,{value:"stock",children:e.jsxs(S,{children:[e.jsx(M,{children:e.jsx(A,{children:"Estoque Atual"})}),e.jsx(E,{children:oe?e.jsx("div",{className:"flex items-center justify-center py-8",children:e.jsx("div",{className:"h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"})}):x&&x.length>0?e.jsxs(Y,{children:[e.jsx(J,{children:e.jsxs(C,{children:[e.jsx(l,{children:"Ingrediente"}),e.jsx(l,{className:"text-center",children:"Estoque Atual"}),e.jsx(l,{className:"text-center",children:"Estoque Mínimo"}),e.jsx(l,{className:"text-center",children:"Status"}),e.jsx(l,{className:"text-right",children:"Custo/Unidade"}),e.jsx(l,{className:"text-right",children:"Valor em Estoque"})]})}),e.jsx(X,{children:x.map(s=>{const w=s.min_stock!==null&&(s.current_stock||0)<=s.min_stock,D=(s.current_stock||0)*s.cost_per_unit;return e.jsxs(C,{children:[e.jsx(n,{className:"font-medium",children:s.name}),e.jsxs(n,{className:"text-center",children:[(s.current_stock||0).toFixed(2)," ",s.unit]}),e.jsx(n,{className:"text-center text-muted-foreground",children:s.min_stock!==null?`${s.min_stock} ${s.unit}`:"-"}),e.jsx(n,{className:"text-center",children:w?e.jsx(_,{variant:"destructive",children:"Baixo"}):e.jsx(_,{variant:"secondary",children:"OK"})}),e.jsxs(n,{className:"text-right",children:["R$ ",s.cost_per_unit.toFixed(2)]}),e.jsxs(n,{className:"text-right font-medium",children:["R$ ",D.toFixed(2)]})]},s.id)})})]}):e.jsxs("div",{className:"flex flex-col items-center justify-center py-8 text-center",children:[e.jsx(ae,{className:"h-12 w-12 text-muted-foreground/50"}),e.jsx("p",{className:"mt-4 text-muted-foreground",children:"Nenhum ingrediente cadastrado"})]})})]})}),e.jsx(R,{value:"movements",children:e.jsxs(S,{children:[e.jsxs(M,{className:"flex flex-row items-center justify-between",children:[e.jsx(A,{children:"Histórico de Movimentações"}),e.jsxs(m,{variant:"outline",size:"sm",onClick:()=>N(!0),className:"gap-2",children:[e.jsx(re,{className:"h-4 w-4"}),"Ajuste de Inventário"]})]}),e.jsx(E,{children:xe?e.jsx("div",{className:"flex items-center justify-center py-8",children:e.jsx("div",{className:"h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"})}):O&&O.length>0?e.jsxs(Y,{children:[e.jsx(J,{children:e.jsxs(C,{children:[e.jsx(l,{children:"Data/Hora"}),e.jsx(l,{children:"Tipo"}),e.jsx(l,{children:"Ingrediente"}),e.jsx(l,{className:"text-right",children:"Quantidade"}),e.jsx(l,{className:"text-right",children:"Custo Unit."}),e.jsx(l,{children:"Referência"}),e.jsx(l,{children:"Observações"})]})}),e.jsx(X,{children:O.map(s=>{var w,D;return e.jsxs(C,{children:[e.jsx(n,{className:"text-sm text-muted-foreground",children:Ae(new Date(s.created_at),"dd/MM/yyyy HH:mm",{locale:Ee})}),e.jsx(n,{children:e.jsxs("div",{className:"flex items-center gap-2",children:[ue(s.type),e.jsx("span",{className:ee("text-sm font-medium",s.type==="entrada"&&"text-green-600",s.type==="saida"&&"text-red-600",s.type==="ajuste"&&"text-blue-600"),children:je(s.type)})]})}),e.jsx(n,{className:"font-medium",children:((w=s.ingredient)==null?void 0:w.name)||"-"}),e.jsx(n,{className:"text-right",children:e.jsxs("span",{className:ee(s.type==="entrada"&&"text-green-600",s.type==="saida"&&"text-red-600"),children:[s.type==="entrada"?"+":s.type==="saida"?"-":"",s.quantity.toFixed(2)," ",(D=s.ingredient)==null?void 0:D.unit]})}),e.jsx(n,{className:"text-right",children:s.unit_cost?`R$ ${s.unit_cost.toFixed(2)}`:"-"}),e.jsx(n,{className:"text-sm text-muted-foreground",children:s.reference_type||"-"}),e.jsx(n,{className:"text-sm text-muted-foreground max-w-[200px] truncate",children:s.notes||"-"})]},s.id)})})]}):e.jsxs("div",{className:"flex flex-col items-center justify-center py-8 text-center",children:[e.jsx(se,{className:"h-12 w-12 text-muted-foreground/50"}),e.jsx("p",{className:"mt-4 text-muted-foreground",children:"Nenhuma movimentação registrada"})]})})]})}),e.jsx(R,{value:"shopping",children:e.jsxs(S,{children:[e.jsx(M,{children:e.jsxs(A,{className:"flex items-center justify-between",children:[e.jsx("span",{children:"Lista de Compras"}),h&&h.length>0&&e.jsxs(_,{variant:"outline",className:"text-lg",children:["Total: R$ ",fe.toFixed(2)]})]})}),e.jsx(E,{children:h&&h.length>0?e.jsxs(Y,{children:[e.jsx(J,{children:e.jsxs(C,{children:[e.jsx(l,{children:"Ingrediente"}),e.jsx(l,{className:"text-center",children:"Estoque Atual"}),e.jsx(l,{className:"text-center",children:"Estoque Mínimo"}),e.jsx(l,{className:"text-center",children:"Qtd. a Comprar"}),e.jsx(l,{className:"text-right",children:"Custo Unit."}),e.jsx(l,{className:"text-right",children:"Custo Estimado"})]})}),e.jsx(X,{children:h.map(s=>e.jsxs(C,{children:[e.jsx(n,{className:"font-medium",children:s.name}),e.jsxs(n,{className:"text-center text-destructive",children:[(s.current_stock||0).toFixed(2)," ",s.unit]}),e.jsxs(n,{className:"text-center",children:[s.min_stock," ",s.unit]}),e.jsxs(n,{className:"text-center font-medium text-primary",children:[s.quantity_to_buy.toFixed(2)," ",s.unit]}),e.jsxs(n,{className:"text-right",children:["R$ ",s.cost_per_unit.toFixed(2)]}),e.jsxs(n,{className:"text-right font-medium",children:["R$ ",s.estimated_cost.toFixed(2)]})]},s.id))})]}):e.jsxs("div",{className:"flex flex-col items-center justify-center py-8 text-center",children:[e.jsx(te,{className:"h-12 w-12 text-muted-foreground/50"}),e.jsx("p",{className:"mt-4 text-muted-foreground",children:"Nenhum item precisa ser comprado"}),e.jsx("p",{className:"text-sm text-muted-foreground",children:"Defina o estoque mínimo nos ingredientes para gerar a lista"})]})})]})}),e.jsx(R,{value:"labels",children:e.jsx(qe,{})})]})]}),e.jsx(V,{open:t,onOpenChange:c,children:e.jsxs(B,{children:[e.jsxs(Q,{children:[e.jsx(U,{children:"Entrada de Estoque"}),e.jsx(G,{children:"Registre a entrada de mercadorias no estoque"})]}),e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"space-y-2",children:[e.jsx(r,{children:"Ingrediente *"}),e.jsxs(F,{value:i,onValueChange:y,children:[e.jsx(I,{children:e.jsx(L,{placeholder:"Selecione o ingrediente"})}),e.jsx($,{children:x==null?void 0:x.map(s=>e.jsxs(T,{value:s.id,children:[s.name," (",s.unit,")"]},s.id))})]})]}),e.jsxs("div",{className:"grid grid-cols-2 gap-4",children:[e.jsxs("div",{className:"space-y-2",children:[e.jsx(r,{children:"Quantidade *"}),e.jsx(f,{type:"text",inputMode:"decimal",value:d||"",onChange:s=>a(Number(s.target.value)),placeholder:"0.00"})]}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(r,{children:"Custo Unitário (R$)"}),e.jsx(f,{type:"text",inputMode:"decimal",value:v||"",onChange:s=>k(Number(s.target.value)),placeholder:"0.00"})]})]}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(r,{children:"Observações"}),e.jsx(W,{value:u,onChange:s=>q(s.target.value),placeholder:"Ex: NF 12345, Fornecedor ABC...",rows:2})]})]}),e.jsxs(K,{children:[e.jsx(m,{variant:"outline",onClick:()=>c(!1),children:"Cancelar"}),e.jsx(m,{onClick:me,disabled:!i||d<=0||j.isPending,children:j.isPending?"Registrando...":"Registrar Entrada"})]})]})}),e.jsx(V,{open:g,onOpenChange:b,children:e.jsxs(B,{children:[e.jsxs(Q,{children:[e.jsx(U,{children:"Saída de Estoque"}),e.jsx(G,{children:"Registre a saída manual de mercadorias do estoque"})]}),e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"space-y-2",children:[e.jsx(r,{children:"Ingrediente *"}),e.jsxs(F,{value:i,onValueChange:y,children:[e.jsx(I,{children:e.jsx(L,{placeholder:"Selecione o ingrediente"})}),e.jsx($,{children:x==null?void 0:x.map(s=>e.jsxs(T,{value:s.id,children:[s.name," - Estoque: ",(s.current_stock||0).toFixed(2)," ",s.unit]},s.id))})]})]}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(r,{children:"Quantidade *"}),e.jsx(f,{type:"text",inputMode:"decimal",value:d||"",onChange:s=>a(Number(s.target.value)),placeholder:"0.00"})]}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(r,{children:"Motivo / Observações"}),e.jsx(W,{value:u,onChange:s=>q(s.target.value),placeholder:"Ex: Perda, vencimento, quebra...",rows:2})]})]}),e.jsxs(K,{children:[e.jsx(m,{variant:"outline",onClick:()=>b(!1),children:"Cancelar"}),e.jsx(m,{variant:"destructive",onClick:he,disabled:!i||d<=0||j.isPending,children:j.isPending?"Registrando...":"Registrar Saída"})]})]})}),e.jsx(V,{open:o,onOpenChange:N,children:e.jsxs(B,{children:[e.jsxs(Q,{children:[e.jsx(U,{children:"Ajuste de Inventário"}),e.jsx(G,{children:"Ajuste o estoque após conferência física"})]}),e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"space-y-2",children:[e.jsx(r,{children:"Ingrediente *"}),e.jsxs(F,{value:i,onValueChange:y,children:[e.jsx(I,{children:e.jsx(L,{placeholder:"Selecione o ingrediente"})}),e.jsx($,{children:x==null?void 0:x.map(s=>e.jsxs(T,{value:s.id,children:[s.name," - Atual: ",(s.current_stock||0).toFixed(2)," ",s.unit]},s.id))})]})]}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(r,{children:"Nova Quantidade (estoque real) *"}),e.jsx(f,{type:"text",inputMode:"decimal",value:d||"",onChange:s=>a(Number(s.target.value)),placeholder:"0.00"})]}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(r,{children:"Observações"}),e.jsx(W,{value:u,onChange:s=>q(s.target.value),placeholder:"Ex: Conferência mensal, inventário...",rows:2})]})]}),e.jsxs(K,{children:[e.jsx(m,{variant:"outline",onClick:()=>N(!1),children:"Cancelar"}),e.jsx(m,{onClick:pe,disabled:!i||d<0||j.isPending,children:j.isPending?"Ajustando...":"Confirmar Ajuste"})]})]})})]})}export{ns as default};
