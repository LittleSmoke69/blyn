import { ingredientLineCost } from "./format";

export interface CostedIngredient {
  quantity: number;
  ingredients: { cost_per_unit: number; correction_factor: number } | null;
}

/** Custo total da receita — mesma fórmula do recalc_recipe_price() no banco. */
export function recipeCost(recipe: { recipe_ingredients: CostedIngredient[] }) {
  return recipe.recipe_ingredients.reduce(
    (sum, ri) =>
      sum +
      (ri.ingredients
        ? ingredientLineCost(Number(ri.quantity), Number(ri.ingredients.cost_per_unit), Number(ri.ingredients.correction_factor))
        : 0),
    0
  );
}
