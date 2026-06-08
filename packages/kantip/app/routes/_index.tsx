import { Link } from '@remix-run/react'
import type { MetaFunction } from '@remix-run/node'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { getProjects } from '~/lib/projects'
import { site } from '~/lib/site'
import { HomeOverride } from '~/lib/slots'

export const meta: MetaFunction = () => [{ title: site.title }]

const projects = getProjects()

/**
 * Route default export: render the user's `Home` override when configured, else
 * the engine's default project-card grid below.
 */
export default function IndexRoute() {
	if (HomeOverride) return <HomeOverride />
	return <EngineIndex />
}

function EngineIndex() {
	return (
		<main className="mx-auto w-full min-w-0 max-w-[calc(720px+5rem)] px-10 pb-16 pt-8 max-md:px-4 max-md:pb-20">
			<article className="content">
				<h1>{site.title}</h1>
				{site.description && (
					<p className="mb-8 text-lg text-muted-foreground">{site.description}</p>
				)}

				<div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
					{projects.map((p) => (
						<Link key={p.id} to={p.landing} className="no-underline">
							<Card className="h-full gap-3 py-5 transition-colors hover:border-ring">
								<CardHeader>
									<div className="flex items-center gap-2.5">
										{/* Inline size: app.css's unlayered `img{height:auto}` would beat h-* utilities. */}
										<img
											src={p.logo}
											alt=""
											aria-hidden
											width={28}
											height={28}
											style={{ height: 28, width: 28 }}
											className="shrink-0 rounded-md"
										/>
										<CardTitle className="text-base">{p.name}</CardTitle>
									</div>
								</CardHeader>
								<CardContent>
									<CardDescription>{p.description}</CardDescription>
								</CardContent>
							</Card>
						</Link>
					))}
				</div>
			</article>
		</main>
	)
}
