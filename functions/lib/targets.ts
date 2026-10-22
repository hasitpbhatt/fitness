// Daily target calculation.
//
// The member answers a few questions about their goal and their body; the app
// works out what they should eat, drink and do. Nobody should have to know
// the arithmetic - asking someone for a "protein target" is asking them to do
// a job the app is better at.
//
// The formulas are the widely used public ones:
//
//   BMR    - Mifflin-St Jeor
//   TDEE   - BMR x an activity factor
//   Protein- 1.6-2.2 g per kg of body weight (higher when building muscle)
//   Fat    - 25-30% of calories, with a floor of 0.6 g per kg
//   Carbs  - whatever calories are left
//   Fibre  - 14 g per 1000 kcal, with a floor of 25 g
//   Water  - 35 ml per kg, plus 500 ml for every hour of exercise
//   Exercise - 150 minutes a week of moderate activity
//
// These are starting points, not prescriptions. The member can override every
// one of them, and the app never presents them as medical advice.

export type GoalType = 'lose' | 'maintain' | 'gain'
export type Sex = 'female' | 'male'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete'

export type BodyProfile = {
  goal_type: GoalType
  sex: Sex
  birth_year: number
  height_cm: number
  weight_kg: number
  activity_level: ActivityLevel
}

export type DailyTargets = {
  calorie_target: number
  protein_target_g: number
  carbs_target_g: number
  fat_target_g: number
  fiber_target_g: number
  water_target_ml: number
  exercise_target_min: number
  bmr: number
  tdee: number
}

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  athlete: 1.9,
}

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Mostly sitting, little exercise',
  light: 'Light exercise 1-3 days a week',
  moderate: 'Moderate exercise 3-5 days a week',
  active: 'Hard exercise 6-7 days a week',
  athlete: 'Training twice a day or physical job',
}

/** Extra calories (or a deficit) for the member's goal. */
const GOAL_ADJUSTMENT: Record<GoalType, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
}

const GOAL_LABELS: Record<GoalType, string> = {
  lose: 'Lose weight',
  maintain: 'Maintain weight',
  gain: 'Build muscle',
}

/** Protein grams per kg of body weight. */
const PROTEIN_PER_KG: Record<GoalType, number> = {
  lose: 1.8,
  maintain: 1.6,
  gain: 2.0,
}

const MIN_CALORIES: Record<Sex, number> = { female: 1200, male: 1500 }
const MIN_FAT_G_PER_KG = 0.6
const MIN_FIBER_G = 25
const EXERCISE_TARGET_MIN = 150
const WATER_ML_PER_KG = 35
const WATER_ML_PER_EXERCISE_HOUR = 500

export function ageFromBirthYear(birthYear: number, now = new Date()): number {
  return Math.max(0, now.getFullYear() - birthYear)
}

export function activityLabel(level: ActivityLevel): string {
  return ACTIVITY_LABELS[level]
}

export function goalLabel(goal: GoalType): string {
  return GOAL_LABELS[goal]
}

/**
 * Works out the daily targets from the body profile. Returns null when the
 * inputs are not usable - the caller then asks for what is missing rather
 * than showing a broken number.
 */
export function calculateTargets(
  profile: BodyProfile,
  now = new Date(),
): DailyTargets | null {
  const age = ageFromBirthYear(profile.birth_year, now)
  if (!Number.isFinite(age) || age < 13 || age > 100) return null
  if (!Number.isFinite(profile.height_cm) || profile.height_cm < 120 || profile.height_cm > 230) return null
  if (!Number.isFinite(profile.weight_kg) || profile.weight_kg < 30 || profile.weight_kg > 250) return null

  // Mifflin-St Jeor
  const bmr =
    10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * age + (profile.sex === 'male' ? 5 : -161)
  const tdee = bmr * ACTIVITY_FACTORS[profile.activity_level]
  if (!Number.isFinite(bmr) || !Number.isFinite(tdee) || bmr <= 0) return null

  const calorieTarget = Math.round(
    Math.max(MIN_CALORIES[profile.sex], tdee + GOAL_ADJUSTMENT[profile.goal_type]),
  )

  const protein = Math.round(profile.weight_kg * PROTEIN_PER_KG[profile.goal_type])
  const fat = Math.round(
    Math.max(profile.weight_kg * MIN_FAT_G_PER_KG, (calorieTarget * 0.27) / 9),
  )
  const carbs = Math.max(0, Math.round((calorieTarget - protein * 4 - fat * 9) / 4))
  const fiber = Math.max(MIN_FIBER_G, Math.round((calorieTarget / 1000) * 14))
  const water = Math.round(profile.weight_kg * WATER_ML_PER_KG)
  // 150 minutes a week of moderate activity is the WHO guideline.
  const exercise = EXERCISE_TARGET_MIN

  return {
    calorie_target: calorieTarget,
    protein_target_g: protein,
    carbs_target_g: carbs,
    fat_target_g: fat,
    fiber_target_g: fiber,
    water_target_ml: water,
    exercise_target_min: exercise,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
  }
}

export const GOAL_OPTIONS: Array<{ value: GoalType; label: string; hint: string }> = [
  { value: 'lose', label: 'Lose weight', hint: 'A modest deficit, protein kept high' },
  { value: 'maintain', label: 'Maintain weight', hint: 'Eat around what you burn' },
  { value: 'gain', label: 'Build muscle', hint: 'A small surplus with more protein' },
]

export const ACTIVITY_OPTIONS: Array<{ value: ActivityLevel; label: string; hint: string }> = [
  { value: 'sedentary', label: 'Mostly sitting', hint: 'Desk job, little exercise' },
  { value: 'light', label: 'Lightly active', hint: 'Exercise 1-3 days a week' },
  { value: 'moderate', label: 'Moderately active', hint: 'Exercise 3-5 days a week' },
  { value: 'active', label: 'Very active', hint: 'Exercise 6-7 days a week' },
  { value: 'athlete', label: 'Athlete', hint: 'Training twice a day or physical work' },
]
