---
"@changesets/ghcommit": minor
---

Improve force-push handling so updating an existing branch no longer temporarily resets the target branch to the base commit, avoiding cases where GitHub closes open pull requests during the update.
