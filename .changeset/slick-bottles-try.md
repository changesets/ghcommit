---
"@changesets/ghcommit": major
---

Removed all subpath exports. All APIs should be imported from root, e.g. `import { commitChangesFromRepo } from "@changesets/ghcommit"`.
