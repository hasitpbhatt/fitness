-- High-protein foods used by the weekly meal plan. Values are approximate and
-- per 100 g, matching the existing seeded food conventions.

INSERT OR IGNORE INTO fitness_foods (
  id, name, brand, category,
  per_100g_calories, per_100g_protein_g, per_100g_carbs_g, per_100g_fat_g,
  default_portion_g, portion_label, source, user_id, created_at, updated_at
) VALUES
  ('seed-chicken-breast', 'Chicken breast, cooked', NULL, 'non-veg', 165, 31, 0, 3.6, 150, '1 fillet', 'seed', NULL, 0, 0),
  ('seed-egg-boiled', 'Boiled egg', NULL, 'non-veg', 155, 13, 1.1, 11, 100, '2 eggs', 'seed', NULL, 0, 0),
  ('seed-tofu-firm', 'Tofu, firm', NULL, 'protein', 144, 17, 3, 9, 100, '100 g', 'seed', NULL, 0, 0),
  ('seed-soya-chunks', 'Soya chunks, cooked', NULL, 'protein', 105, 11, 7, 1, 100, '1 bowl', 'seed', NULL, 0, 0);
