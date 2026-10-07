import{q as y,u as q,s as c,l,k as o}from"./index-BPTQAWgW.js";import{u as p}from"./useMutation-FCTW_jmC.js";function R(){const{user:i}=y();return q({queryKey:["recipes",i==null?void 0:i.id],queryFn:async()=>{const{data:e,error:r}=await c.from("recipes").select(`
          *,
          recipe_ingredients (
            id,
            recipe_id,
            ingredient_id,
            quantity,
            ingredient:ingredients (
              id,
              name,
              unit,
              cost_per_unit,
              correction_factor
            )
          )
        `).order("name");if(r)throw r;return e},enabled:!!i})}function h(){const i=l(),{user:e}=y();return p({mutationFn:async r=>{if(!e)throw new Error("User not authenticated");const{data:t,error:n}=await c.from("recipes").insert({...r,user_id:e.id}).select().single();if(n)throw n;return t},onSuccess:()=>{i.invalidateQueries({queryKey:["recipes"]}),o.success("Receita criada com sucesso!")},onError:r=>{console.error("Recipe creation failed:",r),o.error("Não foi possível criar a receita. Tente novamente.")}})}function Q(){const i=l();return p({mutationFn:async({id:e,...r})=>{const{data:t,error:n}=await c.from("recipes").update(r).eq("id",e).select(`
          *,
          recipe_ingredients (
            id,
            recipe_id,
            ingredient_id,
            quantity,
            ingredient:ingredients (
              id,
              name,
              unit,
              cost_per_unit,
              correction_factor
            )
          )
        `).single();if(n)throw n;const s=t,a=f(s),u=s.target_margin||60,d=m(a,u),{error:g}=await c.from("recipes").update({selling_price:d}).eq("id",e);if(g)throw g;return{...t,selling_price:d}},onSuccess:()=>{i.invalidateQueries({queryKey:["recipes"]}),i.invalidateQueries({queryKey:["public-recipes"]}),o.success("Receita atualizada com sucesso!")},onError:e=>{console.error("Recipe update failed:",e),o.error("Não foi possível atualizar a receita. Tente novamente.")}})}function C(){const i=l();return p({mutationFn:async e=>{const{error:r}=await c.from("recipes").delete().eq("id",e);if(r)throw r},onSuccess:()=>{i.invalidateQueries({queryKey:["recipes"]}),o.success("Receita removida com sucesso!")},onError:e=>{console.error("Recipe deletion failed:",e),o.error("Não foi possível remover a receita. Tente novamente.")}})}function K(){const i=l();return p({mutationFn:async({recipe_id:e,ingredient_id:r,quantity:t})=>{const{data:n,error:s}=await c.from("recipe_ingredients").insert({recipe_id:e,ingredient_id:r,quantity:t}).select().single();if(s)throw s;const{data:a}=await c.from("recipes").select(`
          *,
          recipe_ingredients (
            id,
            recipe_id,
            ingredient_id,
            quantity,
            ingredient:ingredients (
              id,
              name,
              unit,
              cost_per_unit,
              correction_factor
            )
          )
        `).eq("id",e).single();if(a){const u=a,d=f(u),g=u.target_margin||60,_=m(d,g);await c.from("recipes").update({selling_price:_}).eq("id",e)}return n},onSuccess:()=>{i.invalidateQueries({queryKey:["recipes"]}),i.invalidateQueries({queryKey:["public-recipes"]}),o.success("Ingrediente adicionado à receita!")},onError:e=>{console.error("Recipe ingredient addition failed:",e),o.error("Não foi possível adicionar o ingrediente. Tente novamente.")}})}function E(){const i=l();return p({mutationFn:async({id:e,recipe_id:r})=>{const{error:t}=await c.from("recipe_ingredients").delete().eq("id",e);if(t)throw t;const{data:n}=await c.from("recipes").select(`
          *,
          recipe_ingredients (
            id,
            recipe_id,
            ingredient_id,
            quantity,
            ingredient:ingredients (
              id,
              name,
              unit,
              cost_per_unit,
              correction_factor
            )
          )
        `).eq("id",r).single();if(n){const s=n,a=f(s),u=s.target_margin||60,d=m(a,u);await c.from("recipes").update({selling_price:d}).eq("id",r)}},onSuccess:()=>{i.invalidateQueries({queryKey:["recipes"]}),i.invalidateQueries({queryKey:["public-recipes"]}),o.success("Ingrediente removido da receita!")},onError:e=>{console.error("Recipe ingredient removal failed:",e),o.error("Não foi possível remover o ingrediente. Tente novamente.")}})}function f(i){return i.recipe_ingredients.reduce((e,r)=>{var s,a;const t=((s=r.ingredient)==null?void 0:s.cost_per_unit)||0,n=((a=r.ingredient)==null?void 0:a.correction_factor)||1;return e+t*n*r.quantity},0)}function m(i,e){return e>=100?i*10:i/(1-e/100)}function F(i,e){return e-i}export{C as a,h as b,f as c,Q as d,K as e,E as f,m as g,F as h,R as u};
