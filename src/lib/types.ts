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