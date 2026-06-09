import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

// MoSCoW priority tags, in descending priority. Stored alongside type tags
// (user-story, feature, …) in a doc's `tags` frontmatter array.
export const PRIORITY_TAGS = ['must-have', 'should-have', 'could-have', 'wont-have'] as const
export type PriorityTag = (typeof PRIORITY_TAGS)[number]

/** The MoSCoW priority tag from a doc's tags, or null if none is present. */
export function getPriority(tags: unknown): PriorityTag | null {
	if (!Array.isArray(tags)) return null
	return (PRIORITY_TAGS.find((p) => tags.includes(p)) as PriorityTag | undefined) ?? null
}
