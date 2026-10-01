import { useEffect, useReducer, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Crosshair, Eye, EyeOff, Layers, Maximize, Minus, Plus, Shrink } from 'lucide-react'

import { Button, buttonVariants } from '~/components/ui/button'
import { DropdownMenu } from '~/components/ui/dropdown-menu'
import { DRAWIO_BASE_PATH } from '~/lib/drawio'
import { useT } from '~/lib/site-context'
import { cn } from '~/lib/utils'

interface Cell {
	value: unknown
}

interface Graph {
	fit(border: number): void
	maxFitScale: number | null
	container: HTMLElement
	getGraphBounds(): { x: number; y: number; width: number; height: number }
	view: {
		scale: number
		translate: { x: number; y: number }
		setScale(scale: number): void
		setTranslate(x: number, y: number): void
		scaleAndTranslate(scale: number, x: number, y: number): void
		getCanvas(): SVGGElement
	}
	panningHandler: { isForcePanningEvent(): boolean }
	model: {
		root: Cell
		getChildCount(cell: Cell): number
		getChildAt(cell: Cell, index: number): Cell
		isVisible(cell: Cell): boolean
		setVisible(cell: Cell, visible: boolean): void
	}
}

interface GraphViewer {
	graph: Graph
	currentPage: number
	diagrams: unknown[]
	selectPage(index: number): void
	showLocalLightbox(): void
	addListener(name: string, listener: () => void): void
}

interface GraphViewerStatic {
	createViewerForElement(element: HTMLElement, callback?: (viewer: GraphViewer) => void): void
}

declare global {
	interface Window {
		GraphViewer?: GraphViewerStatic
	}
}

let viewerScript: Promise<GraphViewerStatic> | undefined

function loadViewer(): Promise<GraphViewerStatic> {
	viewerScript ??= new Promise((resolve, reject) => {
		// The script reads these once at load and falls back to viewer.diagrams.net
		// for every one left unset.
		Object.assign(window, {
			STENCIL_PATH: `${DRAWIO_BASE_PATH}/stencils`,
			SHAPES_PATH: `${DRAWIO_BASE_PATH}/shapes`,
			STYLE_PATH: `${DRAWIO_BASE_PATH}/styles`,
			GRAPH_IMAGE_PATH: `${DRAWIO_BASE_PATH}/img`,
			IMAGE_PATH: `${DRAWIO_BASE_PATH}/images`,
			mxBasePath: `${DRAWIO_BASE_PATH}/mxgraph`,
			mxImageBasePath: `${DRAWIO_BASE_PATH}/mxgraph/images`,
			DRAW_MATH_URL: `${DRAWIO_BASE_PATH}/math4/es5`,
		})
		const script = document.createElement('script')
		script.src = `${DRAWIO_BASE_PATH}/js/viewer-static.min.js`
		script.onload = () => (window.GraphViewer ? resolve(window.GraphViewer) : reject(new Error('GraphViewer missing')))
		script.onerror = () => {
			viewerScript = undefined
			script.remove()
			reject(new Error(`Failed to load ${script.src}`))
		}
		document.head.appendChild(script)
	})
	return viewerScript
}

function isDark(): boolean {
	return document.documentElement.classList.contains('dark')
}

const FIT_PADDING = 48

// The viewer's own fit scales to the container width only, so a wide area pushes
// the diagram to its edges and a tall diagram overflows. This fits both
// dimensions, scales small diagrams up too, and centres the result.
function fitToContainer(graph: Graph) {
	graph.maxFitScale = null
	graph.fit(FIT_PADDING)
	centerInContainer(graph)
}

function showAtNaturalSize(graph: Graph) {
	graph.view.setScale(1)
	centerInContainer(graph)
}

// mxGraph's `center` measures the container's scroll size, which no longer
// matches the view once the diagram is panned, and moves it off screen.
function centerInContainer(graph: Graph) {
	const bounds = graph.getGraphBounds()
	const { scale, translate } = graph.view
	const dx = (graph.container.clientWidth - bounds.width) / 2 - bounds.x
	const dy = (graph.container.clientHeight - bounds.height) / 2 - bounds.y
	graph.view.setTranslate(translate.x + dx / scale, translate.y + dy / scale)
}

const ZOOM_FACTOR = 1.2

// mxGraph's zoomIn/zoomOut keep the translate, so the diagram grows from its
// origin and drifts off-centre. This keeps the point under (x, y), in container
// pixels, fixed on screen.
function zoomAt(graph: Graph, factor: number, x: number, y: number) {
	const { scale, translate } = graph.view
	const next = scale * factor
	graph.view.scaleAndTranslate(next, translate.x + x / next - x / scale, translate.y + y / next - y / scale)
}

function zoomAtCenter(graph: Graph, factor: number) {
	zoomAt(graph, factor, graph.container.clientWidth / 2, graph.container.clientHeight / 2)
}

const PAN_THRESHOLD = 3

// mxGraph's own panning replaces the canvas transform with a bare translate while
// dragging. The viewer keeps the zoom in that transform, so the diagram drops to
// 100% until release. This pans by prefixing the transform, which also avoids a
// redraw on every move, and commits the offset once on release.
function installPanning(graph: Graph) {
	// The viewer forces mxGraph's panning on whenever the diagram overflows the
	// container. That pan would be committed on release on top of this one.
	graph.panningHandler.isForcePanningEvent = () => false
	const container = graph.container
	let drag: { pointerId: number; x: number; y: number; dx: number; dy: number; transform: string; active: boolean } | null =
		null

	container.style.cursor = 'grab'
	container.addEventListener('pointerdown', (event) => {
		if (event.button !== 0) return
		drag = {
			pointerId: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			dx: 0,
			dy: 0,
			transform: graph.view.getCanvas().getAttribute('transform') ?? '',
			active: false,
		}
	})
	container.addEventListener('pointermove', (event) => {
		if (!drag || event.pointerId !== drag.pointerId) return
		drag.dx = event.clientX - drag.x
		drag.dy = event.clientY - drag.y
		// Below the threshold a press stays a click, so links in the diagram work.
		if (!drag.active && Math.hypot(drag.dx, drag.dy) < PAN_THRESHOLD) return
		if (!drag.active) {
			drag.active = true
			container.setPointerCapture(event.pointerId)
			container.style.cursor = 'grabbing'
		}
		graph.view.getCanvas().setAttribute('transform', `translate(${drag.dx},${drag.dy}) ${drag.transform}`)
	})
	const end = (event: PointerEvent) => {
		if (!drag || event.pointerId !== drag.pointerId) return
		if (drag.active) {
			const { scale, translate } = graph.view
			graph.view.setTranslate(translate.x + drag.dx / scale, translate.y + drag.dy / scale)
			container.style.cursor = 'grab'
		}
		drag = null
	}
	container.addEventListener('pointerup', end)
	container.addEventListener('pointercancel', end)
}

function getLayers(graph: Graph): Cell[] {
	const { model } = graph
	return Array.from({ length: model.getChildCount(model.root) }, (_, index) => model.getChildAt(model.root, index))
}

/**
 * A draw.io diagram in the interactive draw.io viewer, at natural size in the
 * content area. The server and the first client render show the static image; it stays
 * when the viewer fails to load.
 */
export default function DrawioView({ xml, src, title }: { xml: string; src: string; title: string }) {
	const ref = useRef<HTMLDivElement>(null)
	const [viewer, setViewer] = useState<GraphViewer | null>(null)
	const viewerRef = useRef(viewer)
	viewerRef.current = viewer
	// Page and layer changes happen inside the viewer; this re-renders the controls.
	const [, refreshControls] = useReducer((count: number) => count + 1, 0)

	useEffect(() => {
		const container = ref.current
		if (!container) return

		let cancelled = false
		let dark: boolean | undefined
		let page = 0
		// The viewer reads `dark-mode` only when it is created, so a theme change
		// recreates it on the page the reader was on.
		const render = (graphViewer: GraphViewerStatic) => {
			if (cancelled || dark === isDark()) return
			dark = isDark()
			const element = document.createElement('div')
			element.style.width = '100%'
			element.style.height = '100%'
			element.setAttribute(
				'data-mxgraph',
				JSON.stringify({
					xml,
					page,
					resize: false,
					'allow-zoom-in': true,
					lightbox: false,
					nav: true,
					editable: false,
					'dark-mode': dark ? 'dark' : 'light',
				}),
			)
			container.replaceChildren(element)
			graphViewer.createViewerForElement(element, (created) => {
				if (cancelled) return
				installPanning(created.graph)
				created.addListener('graphChanged', () => {
					page = created.currentPage
					showAtNaturalSize(created.graph)
					refreshControls()
				})
				showAtNaturalSize(created.graph)
				setViewer(created)
			})
		}

		// Plain wheel keeps scrolling the page; Ctrl+wheel (and trackpad pinch,
		// which browsers report as Ctrl+wheel) zooms the diagram.
		const onWheel = (event: WheelEvent) => {
			const graph = viewerRef.current?.graph
			if (!event.ctrlKey || !graph) return
			event.preventDefault()
			const rect = graph.container.getBoundingClientRect()
			zoomAt(graph, event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR, event.clientX - rect.left, event.clientY - rect.top)
		}
		container.addEventListener('wheel', onWheel, { passive: false })

		// The viewer rescales to the width on window resize; the frame delay runs
		// this after it.
		const resizeObserver = new ResizeObserver(() => {
			requestAnimationFrame(() => {
				if (viewerRef.current) showAtNaturalSize(viewerRef.current.graph)
			})
		})
		resizeObserver.observe(container)

		let observer: MutationObserver | undefined
		loadViewer()
			.then((graphViewer) => {
				render(graphViewer)
				observer = new MutationObserver(() => render(graphViewer))
				observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
			})
			.catch((error) => console.error(error))

		return () => {
			cancelled = true
			observer?.disconnect()
			resizeObserver.disconnect()
			container.removeEventListener('wheel', onWheel)
			container.replaceChildren()
		}
	}, [xml])

	return (
		<div className="relative min-h-0 flex-1">
			{!viewer && <img src={src} alt={title} className="absolute inset-0 m-auto max-h-full" />}
			<div ref={ref} className="drawio-view absolute inset-0" />
			{viewer && <DiagramControls viewer={viewer} onChange={refreshControls} />}
		</div>
	)
}

function DiagramControls({ viewer, onChange }: { viewer: GraphViewer; onChange: () => void }) {
	const t = useT()
	const { graph } = viewer
	const layers = getLayers(graph)

	return (
		<div className="absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-md border bg-background/90 p-1 shadow-sm backdrop-blur-sm">
			{viewer.diagrams.length > 1 && (
				<>
					<ControlButton label={t('previousPage')} onClick={() => viewer.selectPage(viewer.currentPage - 1)}>
						<ChevronLeft />
					</ControlButton>
					<span className="px-1 text-xs tabular-nums text-muted-foreground">
						{viewer.currentPage + 1} / {viewer.diagrams.length}
					</span>
					<ControlButton label={t('nextPage')} onClick={() => viewer.selectPage(viewer.currentPage + 1)}>
						<ChevronRight />
					</ControlButton>
					<Separator />
				</>
			)}
			<ControlButton label={t('zoomOut')} onClick={() => zoomAtCenter(graph, 1 / ZOOM_FACTOR)}>
				<Minus />
			</ControlButton>
			<ControlButton label={t('zoomIn')} onClick={() => zoomAtCenter(graph, ZOOM_FACTOR)}>
				<Plus />
			</ControlButton>
			<ControlButton label={t('zoomToFit')} onClick={() => fitToContainer(graph)}>
				<Shrink />
			</ControlButton>
			<ControlButton label={t('centerDiagram')} onClick={() => centerInContainer(graph)}>
				<Crosshair />
			</ControlButton>
			{layers.length > 1 && (
				<>
					<Separator />
					<DropdownMenu
						align="end"
						label={t('layers')}
						className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-8')}
						trigger={() => <Layers />}
					>
						{layers.map((layer, index) => {
							const visible = graph.model.isVisible(layer)
							return (
								<button
									key={index}
									type="button"
									role="menuitemcheckbox"
									aria-checked={visible}
									onClick={() => {
										graph.model.setVisible(layer, !visible)
										onChange()
									}}
									className={cn(
										'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent',
										!visible && 'text-muted-foreground',
									)}
								>
									{visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
									{typeof layer.value === 'string' && layer.value ? layer.value : t('backgroundLayer')}
								</button>
							)
						})}
					</DropdownMenu>
				</>
			)}
			<Separator />
			<ControlButton label={t('fullscreen')} onClick={() => viewer.showLocalLightbox()}>
				<Maximize />
			</ControlButton>
		</div>
	)
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
	return (
		<Button variant="ghost" size="icon" className="size-8" title={label} aria-label={label} onClick={onClick}>
			{children}
		</Button>
	)
}

function Separator() {
	return <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
}
