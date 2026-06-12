# syntax=docker/dockerfile:1
#
# Generic cantip docs-host image.
#
# Bakes a content-AGNOSTIC cantip Remix app into the image: the app shell is
# scaffolded by `create-cantip` itself (single source of truth — no duplicated
# stub files), then its dependencies are installed. The client's docs —
# `docs.config.ts`, the content sources it references, and `public/` branding —
# are supplied at RUNTIME via a volume mounted at /docs.
#
# Content is split out of the app bundle (cantip >=0.5.0 reads content.json via fs
# at runtime), so once running, content can be refreshed WITHOUT a rebuild — send
# SIGHUP to regenerate in place. See entrypoint.sh and README.md.
#
#   docker build -f docker/Dockerfile -t cantip-host:latest .
#   docker run --rm -p 3000:3000 -v /path/to/client-docs:/docs cantip-host:latest
#
# Build args:
#   CANTIP_VERSION   cantip line to scaffold (default: latest). Pin for repeatable
#                    images, e.g. --build-arg CANTIP_VERSION=0.5.0
#   WITH_MERMAID     "true" (default) installs Playwright Chromium so ```mermaid
#                    diagrams render. Set "false" for a ~1.5GB-smaller image when
#                    your docs use no mermaid.
#
ARG CANTIP_VERSION=latest
ARG WITH_MERMAID=true

FROM node:22-slim AS base
# NOTE: do NOT set NODE_ENV=production here — it makes `npm install` skip
# devDependencies (@remix-run/dev, vite), which the boot-time `remix vite:build`
# needs. The build happens at runtime, so the full toolchain must be present.
WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends tini git ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# ── App shell (content-agnostic), scaffolded by create-cantip ────────────────
# `create-cantip` writes the canonical Remix app shell (vite.config, route/entry
# re-export stubs) + a seed docs.config + seed content, with the cantip version
# baked in. We scaffold into /app so the image is identical to a fresh `npm create
# cantip` project — the one source of truth for the app shell.
ARG CANTIP_VERSION
RUN npx --yes create-cantip@${CANTIP_VERSION} . \
	&& echo "scaffolded cantip app shell (cantip@${CANTIP_VERSION})"

# Install deps (devDependencies included — the boot-time `remix vite:build` needs
# vite/remix), plus the optional peers a generic host should support: pagefind
# (search) and rehype-mermaid (mermaid diagrams). create-cantip's template omits
# these (they're optional), so add them here.
RUN npm install --include=dev --no-audit --no-fund \
	&& npm install --no-audit --no-fund pagefind rehype-mermaid

# Mermaid diagrams render via Playwright Chromium at generate time. Install the
# browser + system libs unless WITH_MERMAID=false.
ARG WITH_MERMAID
RUN if [ "$WITH_MERMAID" = "true" ]; then \
		npx playwright install --with-deps chromium ; \
	else \
		echo "skipping Chromium (WITH_MERMAID=$WITH_MERMAID) — mermaid diagrams will not render" ; \
	fi

EXPOSE 3000
ENV PORT=3000 HOST=0.0.0.0

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
