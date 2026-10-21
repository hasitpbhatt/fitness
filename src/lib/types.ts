export type User = {
  id: string
  email: string
  username: string
  display_name: string | null
  avatar_url: string | null
  referral_code: string
  balance_credits: number
  role: 'user' | 'admin'
  tier: 'free' | 'pro' | 'enterprise'
  email_verified: number
  referred_by: string | null
  created_at: number
  updated_at: number
}

export type FitnessLog = {
  id: string
  user_id: string
  type: 'workout' | 'nutrition' | 'sleep' | 'water' | 'custom'
  recorded_at: string
  activity: string | null
  duration_min: number | null
  calories: number | null
  water_ml: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  sets: number | null
  reps: number | null
  weight: number | null
  hours: number | null
  quality: number | null
  label: string | null
  value: string | null
  note: string | null
  created_at: number
  updated_at: number
}

export type FitnessGoal = {
  id: string
  user_id: string
  type: string
  target: number
  current: number
  period: string
  updated_at: number
  created_at: number
}

export type Streak = {
  user_id: string
  current_streak: number
  longest_streak: number
  last_checkin: string | null
  streak_freeze_used: number
  updated_at: number
}

export type Badge = {
  badge_code: string
  awarded_at: number
  name: string | null
  description: string | null
  icon: string | null
  rarity: string | null
}

export type LeaderboardEntry = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  workout_minutes: number | null
  water_ml: number | null
  calories: number | null
}

export type FitnessProfile = {
  timezone: string | null
  confirmed: boolean
  detected: string | null
  signedIn: boolean
}

export type MacroTargets = {
  calorie_target: number | null
  protein_target_g: number | null
  carbs_target_g: number | null
  fat_target_g: number | null
}

export type MacroTotals = {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export type Food = {
  id: string
  name: string
  brand: string | null
  category: string | null
  per_100g_calories: number
  per_100g_protein_g: number
  per_100g_carbs_g: number
  per_100g_fat_g: number
  default_portion_g: number
  portion_label: string | null
}

export type AppNotification = {
  id: string
  title: string
  body: string
  url: string | null
  sticky: number
  send_at: number
  sent_at: number | null
  viewed: number
  dismissed: number
}

export type AdminNotification = {
  id: string
  user_id: string | null
  title: string
  body: string
  url: string | null
  audience: 'all' | 'free' | 'pro' | 'enterprise' | 'test'
  status: 'draft' | 'scheduled' | 'sent' | 'cancelled'
  sticky: number
  send_at: number | null
  sent_at: number | null
  created_by: string
  created_at: number
  updated_at: number
  views: number
  dismissals: number
}

export type FoodOption = {
  name: string
  description: string
  portion_g: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  confidence: number
}

export type Measurement = {
  id: string
  user_id: string
  recorded_at: string
  weight_kg: number | null
  waist_cm: number | null
  hips_cm: number | null
  arms_cm: number | null
  note: string | null
  created_at: number
  updated_at: number
}

export type HabitKey = 'water' | 'protein' | 'sleep' | 'stretch'

export type HabitDay = {
  date: string
  water_ml: number
  protein_g: number
  sleep_hours: number
  stretch_min: number
}

export type HabitTargets = {
  water_ml: number
  protein_g: number
  sleep_hours: number
  stretch_min: number
}

export type HabitsResponse = {
  date: string
  days: HabitDay[]
  targets: HabitTargets
}

export type ScanItem = {
  name: string
  qty: number
  unit: string
  calories: number
  calories_low: number
  calories_high: number
  protein_g: number
  fat_g: number
  carbs_g: number
  confidence: number
}

export type ScanTotals = {
  calories: number
  calories_low: number
  calories_high: number
  protein_g: number
  fat_g: number
  carbs_g: number
}

export type ScanQuota = {
  used: number
  limit: number
}

export type CoachMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ScanQuestion = {
  item_name?: string
  question: string
}

export type ScanResult = {
  scan_id: string
  description: string
  items: ScanItem[]
  totals: ScanTotals
  needs_clarification: boolean
  questions: ScanQuestion[]
  model: string
  quota?: ScanQuota
}