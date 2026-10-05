/** A colored MoSCoW priority pill, rendered inline next to the page title. */
export default function PriorityBadge({ priority }: { priority: string }) {
	return (
		<span className="priority-badge" data-priority={priority}>
			{priority}
		</span>
	)
}
