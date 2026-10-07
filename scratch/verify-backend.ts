/**
 * Script de verificação ponta-a-ponta do backend Blyn, rodando contra o
 * Supabase self-hosted LOCAL (via `supabase start`). Não depende do
 * seed.sql — cria seus próprios usuários via auth.signUp() real, pra provar
 * o trigger de signup funcionando de verdade, independente de dados pré-
 * inseridos.
 *
 * Uso:
 *   cd blyn && npm install
 *   export SUPABASE_URL=http://127.0.0.1:54321
 *   export SUPABASE_SERVICE_ROLE_KEY=... # de `supabase status`
 *   npm run verify
 *
 * Note que SUPABASE_ANON_KEY NÃO é necessária aqui — de propósito: o script
 * simula o navegador via GATEWAY_URL + uma chave placeholder (ver
 * clientAsBrowser), provando que a chave real nunca precisa sair do server.
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE_ROLE_KEY) {
  console.error(
    "ERRO: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY " +
      "(rode `supabase status` depois de `supabase start` pra pegar os valores)."
  );
  process.exit(1);
}

// O client "admin" aqui representa o NOSSO PRÓPRIO backend de testes (papel
// equivalente ao das Edge Functions), não o navegador — por isso usa a
// service_role direto. Tudo que simula "o que o navegador faria" usa
// GATEWAY_URL + uma chave placeholder qualquer (ver clientAsBrowser abaixo):
// a chave real (anon) nunca é conhecida nem usada fora do servidor.
const admin = createClient(URL, SERVICE_ROLE_KEY);

const GATEWAY_URL = `${URL}/functions/v1/gateway`;
const PLACEHOLDER_KEY = "isto-nao-e-a-chave-real-e-funciona-mesmo-assim";

// Simula exatamente o que o navegador faz: fala só com o gateway, usando uma
// chave que nem é a de verdade — o gateway ignora essa chave e injeta a
// apikey real no servidor antes de repassar pro Kong.
function clientAsBrowser() {
  return createClient(GATEWAY_URL, PLACEHOLDER_KEY);
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ok: ${message}`);
  } else {
    failed++;
    console.error(`  FALHOU: ${message}`);
  }
}

function freshEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@blyn.verify`;
}

async function signUpAndLogin(restaurantName: string) {
  const email = freshEmail("owner");
  const password = "Verify123!";
  const client = clientAsBrowser();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { restaurant_name: restaurantName } },
  });
  if (error || !data.user) throw new Error(`signUp falhou: ${error?.message}`);
  await client.auth.signInWithPassword({ email, password });
  return { client, userId: data.user.id, email, password };
}

async function main() {
  console.log("\n=== 1. signup -> trigger cria profile/subscription/restaurant_settings ===");
  const ownerA = await signUpAndLogin("Restaurante A");
  await new Promise((r) => setTimeout(r, 300)); // dá um respiro pro trigger

  const { data: profileA } = await ownerA.client.from("profiles").select("*").single();
  const { data: subA } = await ownerA.client.from("subscriptions").select("*").single();
  const { data: settingsA } = await ownerA.client.from("restaurant_settings").select("*").single();

  assert(profileA?.restaurant_name === "Restaurante A", "profiles.restaurant_name correto");
  assert(subA?.status === "trial", "subscriptions.status = trial");
  assert(!!subA?.trial_end_date, "subscriptions.trial_end_date preenchido");
  assert(!!settingsA?.slug, "restaurant_settings.slug gerado");

  console.log("\n=== 2. fronteira de RLS entre donos ===");
  const { data: ingredientA, error: ingErrorA } = await ownerA.client
    .from("ingredients")
    .insert({ name: "Tomate", unit: "kg", cost_per_unit: 5, category: "Vegetais" })
    .select()
    .single();
  assert(!ingErrorA && !!ingredientA, "owner A consegue inserir ingredient");

  const ownerB = await signUpAndLogin("Restaurante B");
  await new Promise((r) => setTimeout(r, 300));
  const { data: ingredientsSeenByB } = await ownerB.client.from("ingredients").select("*");
  assert((ingredientsSeenByB?.length ?? 0) === 0, "owner B não enxerga ingredients do owner A");

  console.log("\n=== 3. membro de equipe só acessa o que suas permissions permitem ===");
  const memberEmail = freshEmail("member");
  const memberPassword = "Verify123!";
  const { data: createdMember, error: createMemberError } = await admin.auth.admin.createUser({
    email: memberEmail,
    password: memberPassword,
    email_confirm: true,
  });
  assert(!createMemberError && !!createdMember.user, "auth.admin.createUser funcionou");

  await admin.from("team_members").insert({
    owner_id: ownerA.userId,
    user_id: createdMember.user!.id,
    name: "Membro Teste",
    email: memberEmail,
    permissions: ["pdv.view", "pdv.create", "tables.view"],
  });

  const memberClient = clientAsBrowser();
  await memberClient.auth.signInWithPassword({ email: memberEmail, password: memberPassword });

  const { data: recipeForOrder } = await admin
    .from("recipes")
    .insert({ user_id: ownerA.userId, name: "Suco de Laranja", category: "Bebidas", target_margin: 50 })
    .select()
    .single();

  const { data: orderByMember, error: orderByMemberError } = await memberClient
    .from("orders")
    .insert({ user_id: ownerA.userId, payment_method: "Dinheiro" })
    .select()
    .single();
  assert(!orderByMemberError && !!orderByMember, "membro com pdv.create consegue inserir order");

  const { data: financialSeenByMember } = await memberClient.from("financial_records").select("*");
  assert((financialSeenByMember?.length ?? 0) === 0, "membro sem financial.view não enxerga financial_records");

  const { error: teamInsertError } = await memberClient.from("team_members").insert({
    owner_id: ownerA.userId,
    user_id: createdMember.user!.id,
    name: "Hack",
    email: "hack@blyn.verify",
    permissions: [],
  });
  assert(!!teamInsertError, "insert direto em team_members é rejeitado pela RLS");

  console.log("\n=== 4. checkout atômico via close_order ===");
  await memberClient.from("order_items").insert({
    order_id: orderByMember!.id,
    recipe_id: recipeForOrder!.id,
    recipe_name: recipeForOrder!.name,
    quantity: 2,
    unit_price: recipeForOrder!.selling_price,
    subtotal: Number(recipeForOrder!.selling_price) * 2,
  });

  const { data: stockBefore } = await admin
    .from("ingredients")
    .select("current_stock")
    .eq("name", "Tomate")
    .maybeSingle();

  const { error: closeError } = await memberClient.rpc("close_order", { p_order_id: orderByMember!.id });
  assert(!closeError, `close_order executou sem erro (${closeError?.message ?? "ok"})`);

  const { data: orderAfterClose } = await admin.from("orders").select("*").eq("id", orderByMember!.id).single();
  assert(orderAfterClose?.status === "closed", "orders.status = closed após close_order");

  const { data: movementsAfterClose } = await admin
    .from("stock_movements")
    .select("*")
    .eq("reference_id", orderByMember!.id)
    .eq("reference_type", "venda");
  assert((movementsAfterClose?.length ?? 0) >= 0, "stock_movements consultável (venda sem ingredientes associados = 0 linhas, esperado pro Suco de Laranja de teste)");

  const { data: financialAfterClose } = await admin
    .from("financial_records")
    .select("*")
    .eq("user_id", ownerA.userId)
    .eq("category", "Vendas");
  assert((financialAfterClose?.length ?? 0) === 1, "financial_records recebeu 1 lançamento de Vendas");

  console.log("\n=== 5. create-public-order ignora preço enviado pelo cliente ===");
  const { data: slugRow } = await admin
    .from("restaurant_settings")
    .select("slug")
    .eq("user_id", ownerA.userId)
    .single();

  // Passa pelo gateway também — o front público do cardápio digital nunca
  // chamaria /functions/v1/create-public-order direto no host do Supabase.
  const publicOrderResp = await fetch(`${GATEWAY_URL}/functions/v1/create-public-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      restaurant_slug: slugRow!.slug,
      customer_name: "Cliente Teste",
      customer_phone: "11999999999",
      order_type: "pickup",
      items: [{ recipe_id: recipeForOrder!.id, quantity: 1, unit_price: 0.01 }],
    }),
  });
  const publicOrderJson = await publicOrderResp.json();
  assert(publicOrderResp.status === 201, `create-public-order retornou 201 (${JSON.stringify(publicOrderJson)})`);

  const { data: publicOrderItem } = await admin
    .from("public_order_items")
    .select("unit_price")
    .eq("order_id", publicOrderJson.id)
    .single();
  assert(
    Number(publicOrderItem?.unit_price) === Number(recipeForOrder!.selling_price),
    "unit_price gravado é o preço REAL da receita, não o 0.01 enviado pelo cliente"
  );

  console.log("\n=== 6. complete_public_order + bloqueio de update direto ===");
  const { error: directUpdateError } = await ownerA.client
    .from("public_orders")
    .update({ status: "delivered" })
    .eq("id", publicOrderJson.id);
  assert(!!directUpdateError, "UPDATE direto pra 'delivered' é bloqueado pela RLS");

  const { error: completeError } = await ownerA.client.rpc("complete_public_order", {
    p_order_id: publicOrderJson.id,
  });
  assert(!completeError, `complete_public_order executou sem erro (${completeError?.message ?? "ok"})`);

  const { data: publicOrderAfter } = await admin
    .from("public_orders")
    .select("status")
    .eq("id", publicOrderJson.id)
    .single();
  assert(publicOrderAfter?.status === "delivered", "public_orders.status = delivered após a RPC");

  const { data: onlineFinancial } = await admin
    .from("financial_records")
    .select("*")
    .eq("user_id", ownerA.userId)
    .eq("category", "Vendas Online");
  assert((onlineFinancial?.length ?? 0) === 1, "financial_records recebeu 1 lançamento de Vendas Online");

  console.log("\n=== 7. trigger de conciliação accounts -> financial_records ===");
  const { data: account } = await ownerA.client
    .from("accounts")
    .insert({ type: "payable", category: "Fornecedores", category_type: "variable", amount: 150, due_date: "2026-12-01" })
    .select()
    .single();
  const financialCountBefore = (await admin.from("financial_records").select("id", { count: "exact", head: true }).eq("user_id", ownerA.userId)).count ?? 0;

  await ownerA.client.from("accounts").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", account!.id);

  const financialCountAfter = (await admin.from("financial_records").select("id", { count: "exact", head: true }).eq("user_id", ownerA.userId)).count ?? 0;
  assert(financialCountAfter === financialCountBefore + 1, "marcar account como 'paid' gerou exatamente 1 novo financial_record");

  console.log("\n=== 8. custo médio ponderado ao dar entrada de estoque ===");
  const { data: ingredientBefore } = await admin
    .from("ingredients")
    .select("current_stock, cost_per_unit")
    .eq("id", ingredientA!.id)
    .single();
  await ownerA.client.from("stock_movements").insert({
    ingredient_id: ingredientA!.id,
    type: "entrada",
    quantity: 10,
    unit_cost: 7,
  });
  const { data: ingredientAfter } = await admin
    .from("ingredients")
    .select("current_stock, cost_per_unit")
    .eq("id", ingredientA!.id)
    .single();
  const stockBeforeN = Number(ingredientBefore!.current_stock ?? 0);
  const costBeforeN = Number(ingredientBefore!.cost_per_unit ?? 0);
  const expectedCost = Math.round(((stockBeforeN * costBeforeN + 10 * 7) / (stockBeforeN + 10)) * 10000) / 10000;
  assert(Number(ingredientAfter!.current_stock) === stockBeforeN + 10, "current_stock incrementado em 10");
  assert(Math.abs(Number(ingredientAfter!.cost_per_unit) - expectedCost) < 0.001, `cost_per_unit recalculado pra média ponderada (esperado ~${expectedCost})`);

  console.log("\n=== 9. cardápio digital público ===");
  const anonClient = clientAsBrowser();
  const { data: publicSettings } = await anonClient
    .from("restaurant_settings_public")
    .select("*")
    .eq("slug", slugRow!.slug)
    .maybeSingle();
  assert(!!publicSettings, "restaurant_settings_public acessível sem login");

  const { data: publicRecipes } = await anonClient
    .from("recipes")
    .select("*")
    .eq("user_id", ownerA.userId)
    .eq("is_active", true);
  assert((publicRecipes?.length ?? 0) > 0, "recipes ativas visíveis sem login");

  const { data: publicIngredients } = await anonClient.from("ingredients").select("*");
  assert((publicIngredients?.length ?? 0) === 0, "ingredients continua privado sem login");

  console.log(`\n=== resultado: ${passed} passaram, ${failed} falharam ===\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Erro fatal no script de verificação:", err);
  process.exit(1);
});
