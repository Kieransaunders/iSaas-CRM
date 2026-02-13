// src/lib/stage-colors.ts

/** Default stage color map keyed by stage name */
const stageColorMap: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  'Qualification': {
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    border: 'border-t-blue-500',
    text: 'text-blue-600 dark:text-blue-300',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  },
  'Discovery': {
    bg: 'bg-violet-50 dark:bg-violet-500/10',
    border: 'border-t-violet-500',
    text: 'text-violet-600 dark:text-violet-300',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  },
  'Proposal': {
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    border: 'border-t-amber-500',
    text: 'text-amber-600 dark:text-amber-300',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  },
  'Negotiation': {
    bg: 'bg-orange-50 dark:bg-orange-500/10',
    border: 'border-t-orange-500',
    text: 'text-orange-600 dark:text-orange-300',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
  },
  'Closed Won': {
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    border: 'border-t-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-300',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  },
};

const fallbackColors = {
  bg: 'bg-slate-50 dark:bg-slate-500/10',
  border: 'border-t-slate-400',
  text: 'text-slate-600 dark:text-slate-300',
  badge: 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300',
};

export function getStageColors(stageName: string) {
  return stageColorMap[stageName] ?? fallbackColors;
}

/** Activity type to color mapping for timeline icons */
export const activityTypeColors: Record<string, { bg: string; shadow: string }> = {
  call: { bg: 'bg-orange-500', shadow: 'shadow-orange-500/20' },
  email: { bg: 'bg-blue-500', shadow: 'shadow-blue-500/20' },
  note: { bg: 'bg-amber-500', shadow: 'shadow-amber-500/20' },
  meeting: { bg: 'bg-violet-500', shadow: 'shadow-violet-500/20' },
  task: { bg: 'bg-slate-500', shadow: 'shadow-slate-500/20' },
  status_change: { bg: 'bg-emerald-500', shadow: 'shadow-emerald-500/20' },
};
