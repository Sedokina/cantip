# Task: Add Jira issue backlinks to cantip pages

## Context
cantip (https://github.com/Sedokina/cantip) is a Remix-based custom docs site that renders Markdown files at routes like /pages/task1/. We want each rendered page to display a "Linked Jira Issues" block listing every Jira
issue whose Web Links point at the current page.

Linking happens *in Jira* using its built-in Web Links feature (no Jira-side plugin). The cantip backend is responsible for discovering those links and surfacing them on the docs page.

Start by reading the cantip repo to understand its routing, loader conventions, styling, and how pages are resolved.

## Architecture (already decided — implement this, don't redesign)

In-memory reverse index, rebuilt periodically by the Remix server.

1. A backend service holds Map<pagePath, JiraIssueRef[]> in memory.
2. A background job rebuilds the map on server startup and every JIRA_REFRESH_INTERVAL_MINUTES (default 10).
3. Rebuild logic:
    - Paginate through POST /rest/api/3/search/jql (the new enhanced search endpoint) with JQL project in (<JIRA_PROJECT_KEYS>), fields summary,status.
    - For each returned issue, fetch GET /rest/api/3/issue/{key}/remotelink.
    - Keep web links whose object.url starts with CANTIP_BASE_URL. Normalize each URL to a path (strip base, query, hash, trailing slash) and use that as the map key.
    - Build a fresh map, then atomically swap it in (never mutate the live map partially).
4. Page loader for docs routes calls getLinksForPath(currentPath) and passes the result to the component.
5. Component renders the block (issue key, summary, status with status-category color, link to Jira issue). Empty list → render nothing.

## Configuration (env vars)
- JIRA_BASE_URL — e.g. https://yourcompany.atlassian.net
- JIRA_EMAIL — for basic auth
- JIRA_API_TOKEN — never exposed to the browser
- JIRA_PROJECT_KEYS — comma-separated, e.g. ENG,DOCS
- CANTIP_BASE_URL — used to recognize and strip cantip URLs, e.g. https://cantip.example.com
- JIRA_REFRESH_INTERVAL_MINUTES — default 10

If any required var is missing, log a clear warning and have getLinksForPath return [] (don't crash the server, don't block page render).

## Types

  ```ts
  type JiraIssueRef = {
    key: string;            // "ENG-123"
    url: string;            // full Jira issue URL
    title: string;          // issue summary
    status: string;         // "In Progress"
    statusCategory: "new" | "indeterminate" | "done";
  };
  ```

## Constraints
- Token stays server-side. No Jira calls from the browser, no token in client bundles.
- The first rebuild runs on startup but does not block page rendering. Until it completes, getLinksForPath returns [].
- Use the issue's self URL or construct ${JIRA_BASE_URL}/browse/${key} for the issue link.
- Handle Jira pagination (nextPageToken on the new endpoint).
- On any Jira request failure: log, retry with exponential backoff up to 3 times, then skip and continue. A failed rebuild keeps the previous map intact.
- Don't add a database. In-memory only.
- Don't add tests for the Jira HTTP layer beyond a minimal unit test for the URL normalization + the map lookup. Don't mock the whole API.

## Acceptance criteria
- Visiting a docs page that has matching Jira web links shows the linked issues with current status.
- Visiting a page with no matches renders the page unchanged (no empty block, no errors).
- Adding a web link in Jira appears in cantip within JIRA_REFRESH_INTERVAL_MINUTES.
- Killing Jira connectivity does not break docs pages — they render with whatever was last in the map (or empty if never built).
- No Jira credentials appear in the client bundle (verify by grepping the build output).

## Out of scope (do not build)
- Jira webhook receiver.
- Persistent storage / DB.
- Per-viewer permission filtering.
- Editing links from the cantip side.
- A Forge app or any Jira-side UI.