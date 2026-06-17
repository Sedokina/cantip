// Start the Jira OAuth flow (/jira/connect). Used only in per-user OAuth mode;
// 404s until the JIRA_OAUTH_* + SESSION_SECRET env vars are set.
export { loader } from 'cantip/routes/jira.connect'
