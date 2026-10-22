// Weekly meal plan: seven days of simple Indian meals, scaled to the member's
// calorie and protein targets. The plan is generated on read, so it always
// reflects the latest targets and never needs a background job.
//
// The plan also honours what the member has told their coach they eat: a
// declared diet picks the plan, and foods they avoid or are allergic to are
// swapped out. Every change is reported back so the plan can explain itself.

import { Hono } from 'hono'
import {
  checkFoodAgainstPreferences,
  DAIRY_FOOD_WORDS,
  EGG_FOOD_WORDS,
  getPreferences,
  MEAT_FOOD_WORDS,
  MILK_DRINK_WORDS,
  NON_VEG_FOOD_WORDS,
  type Preferences,
} from '../lib/preferences'
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

/**
 * The four ways the plan can be built. Vegetarian is the default - it is the
 * plan most members can eat, and a member who tells their coach otherwise
 * overrides it.
 */
export const DIETS = ['vegetarian', 'eggetarian', 'vegan', 'non-vegetarian'] as const
type Diet = (typeof DIETS)[number]

const DEFAULT_DIET: Diet = 'vegetarian'

/** The protein top-up used when a day falls short of the protein target. */
const BOOSTERS: Record<Diet, string> = {
  vegetarian: 'seed-tofu-firm',
  eggetarian: 'seed-egg-boiled',
  vegan: 'seed-soya-chunks',
  'non-vegetarian': 'seed-chicken-breast',
}

const DIET_LABELS: Record<Diet, string> = {
  vegetarian: 'Vegetarian',
  eggetarian: 'Eggetarian',
  vegan: 'Vegan',
  'non-vegetarian': 'Non-vegetarian',
}

type FoodRow = {
  id: string
  name: string
  per_100g_calories: number
  per_100g_protein_g: number
  per_100g_carbs_g: number
  per_100g_fat_g: number
}

/**
 * One dish in the plan. `food` is the vegetarian base; the other fields are
 * the alternatives used for a different diet, in order of preference:
 *   egg    - a dish with egg, for an eggetarian plan
 *   vegan  - a dairy-free dish, for a vegan plan
 *   nonveg - a dish with meat, for a non-vegetarian plan
 */
type ItemSpec = { food: string; grams: number; egg?: string; vegan?: string; nonveg?: string }
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

/**
 * Diet variants for the dishes that need one. A dish can offer an egg
 * option, a dairy-free option, and a meat option; the plan picks the first
 * one the member can actually eat.
 */
const DIET_VARIANTS: Record<string, { egg?: string; vegan?: string }> = {
  'seed-palak-paneer': { egg: 'seed-egg-curry', vegan: 'seed-mixed-veg' },
  'seed-paneer-butter-masala': { egg: 'seed-egg-curry', vegan: 'seed-aloo-gobi' },
  'seed-veg-biryani': { vegan: 'seed-jeera-rice' },
  'seed-curd': { vegan: 'seed-chole' },
  'seed-buttermilk': { vegan: 'seed-sprouts' },
}

function isVeganSafe(name: string): boolean {
  const lower = name.toLowerCase()
  if (MEAT_FOOD_WORDS.some((word) => lower.includes(word))) return false
  if (EGG_FOOD_WORDS.some((word) => lower.includes(word))) return false
  if (DAIRY_FOOD_WORDS.some((word) => lower.includes(word))) return false
  if (MILK_DRINK_WORDS.some((word) => lower.includes(word))) return false
  return true
}

/**
 * The foods that can stand in for a dish, best first, for a given diet.
 * The first one that the member can eat wins.
 */
function candidatesFor(item: ItemSpec, diet: Diet, foods: Map<string, FoodRow>): string[] {
  const variants = DIET_VARIANTS[item.food] ?? {}
  const candidates: string[] = []
  if (diet === 'non-vegetarian' && item.nonveg) candidates.push(item.nonveg)
  if (diet === 'eggetarian' && variants.egg) candidates.push(variants.egg)
  if (diet === 'vegan' && variants.vegan) candidates.push(variants.vegan)
  candidates.push(item.food)
  if (diet === 'non-vegetarian' && !item.nonveg) candidates.push(item.food)
  return [...new Set(candidates)].filter((id) => {
    const row = foods.get(id)
    if (!row) return false
    if (diet === 'vegan') return isVeganSafe(row.name)
    if (diet === 'eggetarian') {
      return !MEAT_FOOD_WORDS.some((word) => row.name.toLowerCase().includes(word))
    }
    if (diet === 'vegetarian') {
      return !NON_VEG_FOOD_WORDS.some((word) => row.name.toLowerCase().includes(word))
    }
    return true
  })
}

function foodIdsFor(diet: Diet): string[] {
  const ids = new Set<string>([BOOSTERS[diet]])
  for (const meals of WEEK) {
    for (const meal of meals) {
      for (const item of meal.items) {
        // Every variant is loaded so the preference pass can swap between
        // them when one of them is off-limits.
        ids.add(item.food)
        if (item.nonveg) ids.add(item.nonveg)
        const variants = DIET_VARIANTS[item.food]
        if (variants?.egg) ids.add(variants.egg)
        if (variants?.vegan) ids.add(variants.vegan)
      }
    }
  }
  return [...ids]
}

/**
 * Rewrites the week so it respects what the member has told their coach.
 *
 * The first candidate the member can eat wins. If a member avoids tofu, the
 * plan swaps in something else rather than serving it anyway. If nothing
 * works the item is dropped, and the plan says so.
 */
function adaptWeekToPreferences(
  week: MealSpec[][],
  foods: Map<string, FoodRow>,
  diet: Diet,
  prefs: Preferences | null,
): { week: MealSpec[][]; adjustments: string[] } {
  const adjustments = new Map<string, string>()

  const pick = (item: ItemSpec) => {
    const candidates = candidatesFor(item, diet, foods)
    let blockedReason: string | null = null
    let blockedName = ''

    for (const id of candidates) {
      const row = foods.get(id)
      const name = row?.name ?? id
      const verdict = checkFoodAgainstPreferences(name, prefs, { diet })
      if (!verdict.blocked) {
        if (blockedName && name !== blockedName) {
          adjustments.set(
            blockedName,
            `${blockedName} swapped for ${name} because ${blockedReason}`,
          )
        }
        return { food: id, grams: item.grams }
      }
      if (!blockedReason) {
        blockedReason = verdict.reasons[0] ?? 'you avoid it'
        blockedName = name
      }
    }

    if (blockedName) {
      adjustments.set(blockedName, `${blockedName} removed because ${blockedReason}`)
    }
    return null
  }

  const adapted = week.map((meals) =>
    meals.map((meal) => {
      const items: ItemSpec[] = []
      for (const item of meal.items) {
        const chosen = pick(item)
        if (chosen) items.push(chosen)
      }
      // A meal with nothing left in it is worse than no meal at all.
      return items.length ? { slot: meal.slot, items } : null
    }).filter((meal): meal is MealSpec => meal !== null),
  )

  return { week: adapted, adjustments: [...adjustments.values()] }
}

function scaleDay(
  meals: MealSpec[],
  foods: Map<string, FoodRow>,
  targetCalories: number,
  targetProtein: number,
  boosterId: string,
): { meals: Array<{ slot: string; items: PlanItem[]; totals: Totals }>; totals: Totals; booster_g: number } {
  // The week has already been resolved for the member's diet and preferences,
  // so every item here is the dish that will actually be served.
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

  const rawDiet = c.req.query('diet') ?? DEFAULT_DIET
  if (!DIETS.includes(rawDiet as Diet)) {
    return c.json({ error: 'invalid_diet', message: `diet must be one of ${DIETS.join(', ')}.` }, 400)
  }
  let diet: Diet = rawDiet as Diet

  const timezone = (await resolveTimezone(c.env, session.userId, null)) ?? 'UTC'
  const today = localDate(timezone)
  const profile = await c.env.DB.prepare(
    `SELECT calorie_target, protein_target_g
     FROM fitness_profiles WHERE user_id = ?`,
  )
    .bind(session.userId)
    .first<{ calorie_target: number | null; protein_target_g: number | null }>()

  const preferences = await getPreferences(c.env, session.userId)

  // A diet the member told their coach about wins over the toggle. If the
  // member is vegan, the plan is vegan even if the toggle says otherwise.
  const declaredDiet = preferences?.diets.find((item) =>
    (DIETS as readonly string[]).includes(item),
  ) as Diet | undefined
  let dietOverridden = false
  if (declaredDiet && declaredDiet !== diet) {
    diet = declaredDiet
    dietOverridden = true
  }

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

  // Apply what the member told their coach: swap or drop anything they avoid
  // or are allergic to, and report every change back.
  const adapted = adaptWeekToPreferences(WEEK, foods, diet, preferences)
  const planWeek = adapted.week
  const adjustments = [...adapted.adjustments]
  if (dietOverridden && declaredDiet) {
    adjustments.unshift(
      `Built as a ${DIET_LABELS[declaredDiet].toLowerCase()} plan because that is what you told your coach`,
    )
  }

  const days = planWeek.map((meals, index) => {
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
    const topUps =
      diet === 'non-vegetarian'
        ? 'extra chicken, eggs, or a protein supplement'
        : diet === 'vegan'
          ? 'extra tofu, soya, or a protein supplement'
          : 'extra tofu, paneer, or a protein supplement'
    notes.unshift(
      `This ${diet === 'vegetarian' ? 'vegetarian ' : ''}plan averages ${average.protein_g} g protein. ` +
        `Add ${topUps} to close the ${round1(targetProtein - average.protein_g)} g gap.`,
    )
  }

  return c.json({
    diet,
    diet_label: DIET_LABELS[diet],
    date: today,
    timezone,
    target_calories: targetCalories,
    target_protein_g: targetProtein,
    uses_defaults: profile?.calorie_target == null || profile?.protein_target_g == null,
    average_totals: average,
    days,
    notes,
    adjustments,
  })
})

export default app
