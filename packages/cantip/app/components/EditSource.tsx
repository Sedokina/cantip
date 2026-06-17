import { SquarePen } from 'lucide-react'

import { useT } from '~/lib/site-context'

/**
 * "Edit this page" link shown in a doc's title row, beside "Publish to Jira".
 *
 * The URL is built server-side in the doc loader (`doc.server.ts`) from the
 * doc's project `editUrl` template — so this component just renders the link (or
 * nothing, when the project configured no template). Opens the source file in
 * the repo's web editor (GitHub/GitLab/Bitbucket) in a new tab.
 */
export default function EditSource({ url }: { url: string | null }) {
	const t = useT()
	if (!url) return null
	return (
		<a
			href={url}
			target="_blank"
			rel="noreferrer noopener"
			aria-label={t('editThisPage')}
			title={t('editThisPage')}
			className="inline-flex size-8 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
		>
			<SquarePen className="size-4" />
		</a>
	)
}
