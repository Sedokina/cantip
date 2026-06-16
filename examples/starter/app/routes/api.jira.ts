// Jira publishing endpoint (/api/jira). The Publish-to-Jira button on doc pages
// talks to this route; it reads JIRA_* env vars server-side (see cantip's
// jira.server.ts) and stays inert until they're set.
export { loader, action } from 'cantip/routes/api.jira'
