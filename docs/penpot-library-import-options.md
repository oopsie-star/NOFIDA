# Penpot Library Import Options

This patch does **not** auto-import `.penpot` files into Penpot itself.

The new NOFIDA library store is a server-side distribution layer:

- vendored files live in `/opt/nofida-core/library-store/files/`
- the public catalog lives at `/nofida/libraries/catalog.json`
- Penpot users can download approved files from the same origin

## 1. Official Manual Import Path

This is the safest and most supportable option today.

1. Open NOFIDA in the browser.
2. Download an approved `.penpot` file from `/nofida/libraries/files/...`.
3. In Penpot, use `File -> Import`.
4. Open the imported file and publish/share it as a team library.

Why this is recommended now:

- uses supported Penpot UX
- no database coupling
- no reliance on internal APIs
- easiest path for legal review and human approval

## 2. Service-Account / Browser Automation Option

This option uses browser automation to drive the same UI flow as a human:

1. sign in with a dedicated NOFIDA service account
2. open the dashboard
3. upload a `.penpot` file through the import flow
4. publish/share the file as a library

Pros:

- avoids direct DB writes
- closer to supported product behavior
- can be limited to approved catalog entries only

Risks:

- UI selectors can break across Penpot upgrades
- requires secure handling of service-account credentials
- upload/publish flows may need retries and human fallback

## 3. Internal API / RPC Option To Investigate

Penpot has internal RPC-style backend flows used by the web app. A future spike can inspect whether the import flow can be driven safely with authenticated requests instead of browser automation.

Questions for that spike:

- is there an authenticated import endpoint for `.penpot` files
- can files be imported directly into a chosen team/project
- can a library be published/shared through the same API family
- are these endpoints stable enough to support across upgrades

Pros:

- cleaner automation than browser-driving if supported
- easier to batch imports and record outcomes

Risks:

- not guaranteed public or stable
- may require reverse-engineering request payloads
- could break silently on Penpot updates

## 4. Risks Of Direct DB Import

Direct Postgres import is **not recommended** for this workflow.

Reasons:

- Penpot file import likely touches more than one table and may depend on backend-side transforms
- backend/business logic can change between versions
- it bypasses product validation, migrations, permissions, and audit boundaries
- corrupt or partial writes would be hard to unwind safely

This patch intentionally avoids Postgres, Valkey, and any backend data-path changes.

## Recommended Next Spike

Recommended order:

1. keep production on manual import for approved libraries
2. build a tiny browser-automation proof of concept for 1 approved file
3. inspect Penpot network traffic during a manual import/publish flow
4. only then decide whether internal RPC automation is stable enough to replace browser-driving

Success criteria for that spike:

- imports one approved file end to end
- publishes it as a reusable library
- records deterministic logs and errors
- survives at least one Penpot version bump rehearsal
