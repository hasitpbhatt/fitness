// Weekly meal plan: seven days of simple Indian meals, scaled to the member's
// calorie and protein targets. The plan is generated on read, so it always
// reflects the latest targets and never needs a background job.

import { Hono } from 'hono'
import { resolveTimezone } from '../lib/profile'
import { getSession } from '../lib/session'
import { addDays, localDate } from '../lib/time'
import type { Bindings } from '../lib/types'

const app = new Hono<{ Bindings: Bindings }>()

const DEFAULT_CALORIES = 2_000
const DEFAULT_PROTEIN_G = 100
const MIN_CALORIES = 1_200
const MAX_CALORIES = 4_000
const MIN_PROTEIN_G = 40
const MAX_PROTEIN_G = 250
const MIN_SCALE = 0.4
const MAX_SCALE = 2.5
const MAX_BOOSTER_G = 300
const BOOSTERS = {
  veg: 'seed-tofu-firm',
  nonveg: 'seed-chicken-breast',
} as const

type Diet = keyof typeof BOOSTERS

type FoodRow = {
  id: string
  name: string
  per_100g_calories: number
  per_100g_protein_g: number
  per_100g_carbs_g: number
  per_100g_fat_g: number
}

type ItemSpec = { food: string; grams: number; nonveg?: string }
type MealSpec = { slot: string; items: ItemSpec[] }

type PlanItem = {
  name: string
  grams: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  booster: boolean
}

type Totals = {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

const WEEK: MealSpec[][] = [
  [
    {
      slot: 'Breakfast',
      items: [
        { food: 'seed-poha', grams: 200 },
        { food: 'seed-curd', grams: 150 },
        { food: 'seed-banana', grams: 120 },
        { food: 'seed-chai', grams: 150 },
      ],
    },
    {
      slot: 'Lunch',
      items: [
        { food: 'seed-chapati', grams: 80 },
        { food: 'seed-dal-tadka', grams: 200 },
        { food: 'seed-mixed-veg', grams: 150 },
        { food: 'seed-curd', grams: 100 },
      ],
    },
    {
      slot: 'Snack',
      items: [
        { food: 'seed-sprouts', grams: 150 },
        { food: 'seed-apple', grams: 150 },
      ],
    },
    {
      slot: 'Dinner',
      items: [
        { food: 'seed-khichdi', grams: 250 },
        { food: 'seed-palak-paneer', grams: 150, nonveg: 'seed-chicken-curry' },
      ],
    },
  ],
  [
    {
      slot: 'Breakfast',
      items: [
        { food: 'seed-idli', grams: 160 },
        { food: 'seed-sambar', grams: 200 },
        { food: 'seed-chai', grams: 150 },
      ],
    },
    {
      slot: 'Lunch',
      items: [
        { food: 'seed-rice-cooked', grams: 200 },
        { food: 'seed-rajma', grams: 200 },
        { food: 'seed-bhindi', grams: 150 },
        { food: 'seed-curd', grams: 100 },
      ],
    },
    {
      slot: 'Snack',
      items: [
        { food: 'seed-peanuts', grams: 30 },
        { food: 'seed-papaya', grams: 150 },
      ],
    },
    {
      slot: 'Dinner',
      items: [
        { food: 'seed-chapati', grams: 80 },
        { food: 'seed-paneer-butter-masala', grams: 150, nonveg: 'seed-chicken-curry' },
        { food: 'seed-mixed-veg', grams: 150 },
      ],
    },
  ],
  [
    {
      slot: 'Breakfast',
      items: [
        { food: 'seed-upma', grams: 200 },
        { food: 'seed-curd', grams: 150 },
        { food: 'seed-banana', grams: 120 },
      ],
    },
    {
      slot: 'Lunch',
      items: [
        { food: 'seed-chapati', grams: 80 },
        { food: 'seed-chole', grams: 200 },
        { food: 'seed-aloo-gobi', grams: 150 },
        { food: 'seed-buttermilk', grams: 200 },
      ],
    },
    {
      slot: 'Snack',
      items: [
        { food: 'seed-dhokla', grams: 100 },
        { food: 'seed-chai', grams: 150 },
      ],
    },
    {
      slot: 'Dinner',
      items: [
        { food: 'seed-rice-cooked', grams: 180 },
        { food: 'seed-dal-makhani', grams: 180 },
        { food: 'seed-palak-paneer', grams: 120, nonveg: 'seed-chicken-curry' },
      ],
    },
  ],
  [
    {
      slot: 'Breakfast',
      items: [
        { food: 'seed-paratha', grams: 80 },
        { food: 'seed-curd', grams: 150 },
        { food: 'seed-chai', grams: 150 },
      ],
    },
    {
      slot: 'Lunch',
      items: [
        { food: 'seed-rice-cooked', grams: 200 },
        { food: 'seed-sambar', grams: 200 },
        { food: 'seed-palak-paneer', grams: 150, nonveg: 'seed-egg-curry' },
        { food: 'seed-mixed-veg', grams: 150 },
      ],
    },
    {
      slot: 'Snack',
      items: [
        { food: 'seed-sprouts', grams: 150 },
        { food: 'seed-mango', grams: 150 },
      ],
    },
    {
      slot: 'Dinner',
      items: [
        { food: 'seed-chapati', grams: 80 },
        { food: 'seed-paneer-butter-masala', grams: 150, nonveg: 'seed-chicken-curry' },
        { food: 'seed-bhindi', grams: 150 },
      ],
    },
  ],
  [
    {
      slot: 'Breakfast',
      items: [
        { food: 'seed-masala-dosa', grams: 150 },
        { food: 'seed-sambar', grams: 200 },
        { food: 'seed-filter-coffee', grams: 150 },
      ],
    },
    {
      slot: 'Lunch',
      items: [
        { food: 'seed-chapati', grams: 80 },
        { food: 'seed-dal-tadka', grams: 200 },
        { food: 'seed-palak-paneer', grams: 150, nonveg: 'seed-chicken-curry' },
        { food: 'seed-curd', grams: 100 },
      ],
    },
    {
      slot: 'Snack',
      items: [
        { food: 'seed-peanuts', grams: 30 },
        { food: 'seed-banana', grams: 120 },
      ],
    },
    {
      slot: 'Dinner',
      items: [
        { food: 'seed-veg-biryani', grams: 250, nonveg: 'seed-chicken-biryani' },
        { food: 'seed-curd', grams: 100 },
        { food: 'seed-sprouts', grams: 100 },
      ],
    },
  ],
  [
    {
      slot: 'Breakfast',
      items: [
        { food: 'seed-poha', grams: 200 },
        { food: 'seed-sprouts', grams: 100 },
        { food: 'seed-chai', grams: 150 },
      ],
    },
    {
      slot: 'Lunch',
      items: [
        { food: 'seed-rice-cooked', grams: 200 },
        { food: 'seed-rajma', grams: 200 },
        { food: 'seed-bhindi', grams: 150 },
        { food: 'seed-buttermilk', grams: 200 },
      ],
    },
    {
      slot: 'Snack',
      items: [
        { food: 'seed-dhokla', grams: 100 },
        { food: 'seed-apple', grams: 150 },
      ],
    },
    {
      slot: 'Dinner',
      items: [
        { food: 'seed-chapati', grams: 80 },
        { food: 'seed-palak-paneer', grams: 150, nonveg: 'seed-egg-curry' },
        { food: 'seed-aloo-gobi', grams: 150 },
      ],
    },
  ],
  [
    {
      slot: 'Breakfast',
      items: [
        { food: 'seed-idli', grams: 160 },
        { food: 'seed-sambar', grams: 200 },
        { food: 'seed-banana', grams: 120 },
      ],
    },
    {
      slot: 'Lunch',
      items: [
        { food: 'seed-chapati', grams: 80 },
        { food: 'seed-chole', grams: 200 },
        { food: 'seed-mixed-veg', grams: 150 },
        { food: 'seed-curd', grams: 100 },
      ],
    },
    {
      slot: 'Snack',
      items: [
        { food: 'seed-sprouts', grams: 100 },
        { food: 'seed-papaya', grams: 150 },
        { food: 'seed-chai', grams: 150 },
      ],
    },
    {
      slot: 'Dinner',
      items: [
        { food: 'seed-khichdi', grams: 250 },
        { food: 'seed-paneer-butter-masala', grams: 150, nonveg: 'seed-chicken-curry' },
        { food: 'seed-bhindi', grams: 150 },
      ],
    },
  ],
]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function roundGrams(value: number): number {
  return Math.max(5, Math.round(value / 5) * 5)
}

function itemNutrition(row: FoodRow, grams: number) {
  const factor = grams / 100
  return {
    calories: Math.round(row.per_100g_calories * factor),
    protein_g: round1(row.per_100g_protein_g * factor),
    carbs_g: round1(row.per_100g_carbs_g * factor),
    fat_g: round1(row.per_100g_fat_g * factor),
  }
}

function sumTotals(items: PlanItem[]): Totals {
  const totals = items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein_g: acc.protein_g + item.protein_g,
      carbs_g: acc.carbs_g + item.carbs_g,
      fat_g: acc.fat_g + item.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  )
  return {
    calories: Math.round(totals.calories),
    protein_g: round1(totals.protein_g),
    carbs_g: round1(totals.carbs_g),
    fat_g: round1(totals.fat_g),
  }
}

function foodIdsFor(diet: Diet): string[] {
  const ids = new Set<string>([BOOSTERS[diet]])
  for (const meals of WEEK) {
    for (const meal of meals) {
      for (const item of meal.items) {
        ids.add(diet === 'nonveg' && item.nonveg ? item.nonveg : item.food)
      }
    }
  }
  return [...ids]
}

function scaleDay(
  meals: MealSpec[],
  foods: Map<string, FoodRow>,
  targetCalories: number,
  targetProtein: number,
  boosterId: string,
): { meals: Array<{ slot: string; items: PlanItem[]; totals: Totals }>; totals: Totals; booster_g: number } {
  const resolved = meals.map((meal) => ({
    slot: meal.slot,
    items: meal.items
      .map((item) => ({ row: foods.get(item.food), grams: item.grams }))
      .filter((item): item is { row: FoodRow; grams: number } => Boolean(item.row)),
  }))

  const baseCalories = resolved.reduce(
    (sum, meal) => sum + meal.items.reduce((inner, item) => inner + itemNutrition(item.row, item.grams).calories, 0),
    0,
  )
  const baseProtein = resolved.reduce(
    (sum, meal) => sum + meal.items.reduce((inner, item) => inner + itemNutrition(item.row, item.grams).protein_g, 0),
    0,
  )
  const booster = foods.get(boosterId)

  let scale = baseCalories > 0 ? targetCalories / baseCalories : 1
  let boosterGrams = 0
  if (booster && baseCalories > 0) {
    const boosterCalories = booster.per_100g_calories / 100
    const boosterProtein = booster.per_100g_protein_g / 100
    const determinant = baseCalories * boosterProtein - baseProtein * boosterCalories
    if (Math.abs(determinant) > 0.01) {
      const idealBooster = (baseCalories * targetProtein - baseProtein * targetCalories) / determinant
      const idealScale = (targetCalories - boosterCalories * idealBooster) / baseCalories
      if (Number.isFinite(idealBooster) && Number.isFinite(idealScale) && idealBooster > 0) {
        boosterGrams = clamp(idealBooster, 0, MAX_BOOSTER_G)
        scale = (targetCalories - boosterCalories * boosterGrams) / baseCalories
      }
    }
  }
  if (!Number.isFinite(scale) || scale <= 0) {
    scale = baseCalories > 0 ? targetCalories / baseCalories : 1
    boosterGrams = 0
  }
  scale = clamp(scale, MIN_SCALE, MAX_SCALE)
  boosterGrams = boosterGrams >= 10 ? roundGrams(clamp(boosterGrams, 0, MAX_BOOSTER_G)) : 0

  const scaledMeals = resolved.map((meal) => {
    const items: PlanItem[] = meal.items.map(({ row, grams }) => {
      const scaled = roundGrams(grams * scale)
      return { name: row.name, grams: scaled, ...itemNutrition(row, scaled), booster: false }
    })
    return { slot: meal.slot, items, totals: sumTotals(items) }
  })

  if (booster && boosterGrams > 0) {
    const targetMeal = scaledMeals.find((meal) => meal.slot === 'Dinner') ?? scaledMeals[scaledMeals.length - 1]
    if (targetMeal) {
      const item: PlanItem = {
        name: booster.name,
        grams: boosterGrams,
        ...itemNutrition(booster, boosterGrams),
        booster: true,
      }
      targetMeal.items.push(item)
      targetMeal.totals = sumTotals(targetMeal.items)
    }
  }

  return {
    meals: scaledMeals,
    totals: sumTotals(scaledMeals.flatMap((meal) => meal.items)),
    booster_g: boosterGrams,
  }
}

function dateLabel(date: string, today: string): string {
  if (date === today) return 'Today'
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  })
}

function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

app.get('/api/fitness/meal-plan', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const rawDiet = c.req.query('diet') ?? 'veg'
  if (rawDiet !== 'veg' && rawDiet !== 'nonveg') {
    return c.json({ error: 'invalid_diet', message: 'diet must be veg or nonveg.' }, 400)
  }
  const diet: Diet = rawDiet

  const timezone = (await resolveTimezone(c.env, session.userId, null)) ?? 'UTC'
  const today = localDate(timezone)
  const profile = await c.env.DB.prepare(
    `SELECT calorie_target, protein_target_g
     FROM fitness_profiles WHERE user_id = ?`,
  )
    .bind(session.userId)
    .first<{ calorie_target: number | null; protein_target_g: number | null }>()

  const targetCalories = clamp(
    Math.round(profile?.calorie_target ?? DEFAULT_CALORIES),
    MIN_CALORIES,
    MAX_CALORIES,
  )
  const targetProtein = clamp(
    Math.round(profile?.protein_target_g ?? DEFAULT_PROTEIN_G),
    MIN_PROTEIN_G,
    MAX_PROTEIN_G,
  )

  const ids = foodIdsFor(diet)
  const placeholders = ids.map(() => '?').join(', ')
  const rows = await c.env.DB.prepare(
    `SELECT id, name, per_100g_calories, per_100g_protein_g, per_100g_carbs_g, per_100g_fat_g
     FROM fitness_foods WHERE id IN (${placeholders})`,
  )
    .bind(...ids)
    .all<FoodRow>()
  const foods = new Map(rows.results.map((row) => [row.id, row]))
  const missing = ids.filter((id) => !foods.has(id))
  if (missing.length > 0) {
    console.error('[meal-plan] missing foods', missing.join(', '))
    return c.json({ error: 'meal_plan_unavailable' }, 500)
  }

  const days = WEEK.map((meals, index) => {
    const date = addDays(today, index)
    const scaled = scaleDay(meals, foods, targetCalories, targetProtein, BOOSTERS[diet])
    return {
      date,
      label: dateLabel(date, today),
      date_label: shortDate(date),
      is_today: index === 0,
      meals: scaled.meals,
      totals: scaled.totals,
      protein_gap_g: round1(Math.max(0, targetProtein - scaled.totals.protein_g)),
      booster_g: scaled.booster_g,
    }
  })

  const average = {
    calories: Math.round(days.reduce((sum, day) => sum + day.totals.calories, 0) / days.length),
    protein_g: round1(days.reduce((sum, day) => sum + day.totals.protein_g, 0) / days.length),
  }
  const notes = [
    'Portions are scaled toward your targets and rounded to the nearest 5 g.',
    'A protein top-up is added when the day falls short of your protein target.',
    'Values are estimates; oil, drinks, and condiments can change the totals.',
    'General guidance, not medical advice.',
  ]
  if (average.protein_g < targetProtein - 5) {
    const topUps = diet === 'veg' ? 'extra tofu, paneer, or a protein supplement' : 'extra chicken, eggs, or a protein supplement'
    notes.unshift(
      `This ${diet === 'veg' ? 'vegetarian ' : ''}plan averages ${average.protein_g} g protein. ` +
        `Add ${topUps} to close the ${round1(targetProtein - average.protein_g)} g gap.`,
    )
  }

  return c.json({
    diet,
    date: today,
    timezone,
    target_calories: targetCalories,
    target_protein_g: targetProtein,
    uses_defaults: profile?.calorie_target == null || profile?.protein_target_g == null,
    average_totals: average,
    days,
    notes,
  })
})

export default app
