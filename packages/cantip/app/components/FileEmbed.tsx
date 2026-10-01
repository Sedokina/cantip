import { fileIcon } from '~/lib/files'

/** An embedded file the browser can't preview inline, shown as a link card. */
export default function FileEmbed({ href, name }: { href?: string; name?: string }) {
	if (!href || !name) return null
	const Icon = fileIcon(name)
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener"
			className="my-2 inline-flex max-w-full items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm text-foreground! no-underline! transition-colors hover:bg-accent"
		>
			<Icon className="size-4 shrink-0 text-muted-foreground" />
			<span className="truncate">{name}</span>
		</a>
	)
}
