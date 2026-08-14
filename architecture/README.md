# Architecture diagrams

`components.drawio` is the editable source of truth for the Kino component
diagram. `components.drawio.svg` is the generated, GitHub-facing artifact.

Do not edit or save the generated SVG in draw.io. Open and save the native
source instead:

```bash
cd architecture
drawio components.drawio
```

Close the diagram in draw.io after saving, then regenerate and validate the SVG:

```bash
task export
```

The export task is a thin wrapper around the official draw.io Desktop CLI. It
embeds the editable diagram model in the SVG, validates both XML files, and
verifies that librsvg can render the result. It does not rewrite draw.io's
metadata or generated SVG identifiers.

Draw.io Desktop may update editor metadata when saving, and a draw.io upgrade
may change generated SVG markup or text rendering. Treat the SVG as a generated
artifact, review it visually, and do not repair its metadata by hand.

For an incremental review, keep a native source and generated SVG with matching
names:

```bash
drawio components.example-review.drawio
task export \
  SOURCE=components.example-review.drawio \
  OUTPUT=components.example-review.drawio.svg
```

The generated review SVG is the human-review artifact. After approval, promote
both the native source and its generated SVG; never promote an SVG without its
matching `.drawio` source.

Requirements:

- draw.io Desktop CLI
- `xmllint`
- `rsvg-convert` from `librsvg2-bin`
