# Nofida Internal Library Catalog

Shared Penpot library files served at `/nofida/libraries/` inside the branded frontend.

## Structure

```
libraries/
  catalog.json          — machine-readable index (loaded by AI Core)
  catalog.example.json  — annotated example showing available fields
  files/                — .penpot library files (binary, tracked via Git LFS)
  README.md             — this file
```

## Adding a library

1. Export the Penpot project as `.penpot` and place it in `files/`.
2. Add an entry to `catalog.json` referencing the filename.
3. Rebuild the frontend image: `docker compose build penpot-frontend`.

## Served path

After build, libraries are available at:
```
https://engine.sys.bachopus.com/nofida/libraries/catalog.json
https://engine.sys.bachopus.com/nofida/libraries/files/<name>.penpot
```
