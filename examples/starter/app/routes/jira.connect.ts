// Start the Jira OAuth flow (/jira/connect). Active only when the JIRA_OAUTH_*
// and SESSION_SECRET env vars are set; otherwise 404s.
export { loader } from 'cantip/routes/jira.connect'
