export function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatPercent(value: number) {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function formatDate(iso: string) {
  // datas puras (YYYY-MM-DD) ganham meio-dia pra não cair no dia anterior por fuso
  const d = iso.length === 10 ? new Date(iso + "T12:00:00") : new Date(iso);
  return d.toLocaleDateString("pt-BR");
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** YYYY-MM-DD no fuso local (toISOString usaria UTC e erraria o dia à noite). */
export function localDateKey(d: Date = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const UNITS = ["kg", "g", "L", "ml", "un", "dz", "cx"] as const;

export const PAYMENT_METHODS = ["Dinheiro", "Cartão de Crédito", "Cartão de Débito", "Pix", "Transferência", "Boleto"] as const;

// Espelho do enum recipe_category (migration extensions_and_enums).
export const RECIPE_CATEGORIES = ["Entradas", "Pratos Principais", "Acompanhamentos", "Sobremesas", "Bebidas"] as const;

// Espelho do enum ingredient_category.
export const INGREDIENT_CATEGORIES = [
  "Carnes", "Aves", "Peixes e Frutos do Mar", "Embutidos e Defumados",
  "Laticínios", "Ovos", "Vegetais", "Frutas", "Legumes", "Verduras e Folhas",
  "Grãos e Cereais", "Farinhas e Massas", "Pães e Padaria", "Óleos e Gorduras",
  "Temperos e Especiarias", "Molhos e Condimentos", "Enlatados e Conservas",
  "Açúcares e Adoçantes", "Chocolates e Confeitaria", "Bebidas",
  "Bebidas Alcoólicas", "Descartáveis e Embalagens", "Produtos de Limpeza", "Outros",
] as const;

/** Custo efetivo de um ingrediente numa receita — mesma fórmula do recalc_recipe_price no banco. */
export function ingredientLineCost(quantity: number, costPerUnit: number, correctionFactor: number) {
  return quantity * costPerUnit * correctionFactor;
}
