import { useT } from '~/lib/site-context'

/** Render a single frontmatter value as text: arrays comma-joined, everything else stringified. */
function formatValue(value: unknown): string {
	if (Array.isArray(value)) return value.map((v) => String(v)).join(', ')
	if (value === null) return ''
	if (typeof value === 'object') return JSON.stringify(value)
	return String(value)
}

/** A generic key→value table of every frontmatter field, collapsed unless `open`. */
export default function FrontmatterTable({
	frontmatter,
	open,
}: {
	frontmatter: Record<string, unknown>
	open?: boolean
}) {
	const t = useT()
	const entries = Object.entries(frontmatter)
	if (entries.length === 0) return null
	return (
		<details className="frontmatter" open={open}>
			<summary className="frontmatter__summary">{t('properties')}</summary>
			<dl className="frontmatter__list">
				{entries.map(([key, value]) => (
					<div className="frontmatter__row" key={key}>
						<dt className="frontmatter__key">{key}</dt>
						<dd className="frontmatter__value">{formatValue(value)}</dd>
					</div>
				))}
			</dl>
		</details>
	)
}
