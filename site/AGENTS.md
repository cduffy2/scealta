<!-- figma-cli rules 4a4616b7c9 (managed by figma-cli; edits inside this block are replaced on update) -->
# Using figma-cli

figma-cli controls **Figma Desktop** directly (no API key). It runs in any
terminal. Open Figma Desktop, then `figma-cli connect` once per session.

## Golden rules
1. **Create frames with `render` / `render-batch`** — they have smart positioning.
   NEVER use `eval` to create visual nodes (no positioning, bypasses guards).
2. **"N buttons/cards" = N separate top-level nodes**, not one wrapper frame
   containing N children. Use `render-batch '[...]'` or `shadcn add <c> --count N`.
3. **Never delete the user's existing nodes.**
4. After creating, **verify**: `figma-cli verify "<id>" --measure` (returns a
   screenshot + real w/h so you catch size bugs by numbers, not by eye).

Every command you need for everyday work is on this page. Only run
`figma-cli <command> --help` when a task needs a command not listed here.
**Each tool call costs a full agent turn, so do a whole task in ONE call where
you can**: one `eval` that reads everything, one `render` that builds the
whole structure.

## Reading: `eval` runs Figma Plugin API code
`figma-cli eval '<code>'` runs JavaScript in the open file and prints the
result as compact JSON. Top-level `await` works. A single expression returns
itself; statements need an explicit `return`. Long code: `eval --file q.js`.
- The file loads pages lazily: call `await figma.loadAllPagesAsync()` before
  searching beyond the current page, and use the async APIs
  (`getNodeByIdAsync`, `getMainComponentAsync`, `getLocalVariablesAsync`,
  `getStyleByIdAsync`); the sync ones throw.
- `findAllWithCriteria({types: [...]})` is much faster than `findAll`.
- Return only what answers the question (counts, names, ids). Output over
  20,000 characters is cut.
- A variable binding: `node.fills[0].boundVariables.color.id` → `getVariableByIdAsync`.
  Resolve an alias by following `valuesByMode` values of type `VARIABLE_ALIAS`.

Helpers available inside `eval` (they handle the Figma pitfalls for you):
- `await $page(name)` switch to a page, creating it when missing
- `await $var(name)` local variable by full name; `await $bind(node, varName, 'fills'|'strokes'|field)`
- `await $style(name)` any local style by name
- `await $component(name)` component or component set by name, whole file
- `await $instance(name, 'axis=value, axis=value', {text, parent})` instance of a
  variant; unspecified axes use the default variant
- `await $fontSafe(node)` load fonts and replace fonts that are not installed
- `await $describe(node)` compact one-line-per-node summary of a subtree
- Loops are fine: e.g. one instance per variant of a set in a single `eval`:
  `for (const v of (await $component('Name')).children) await $instance(v.id, '', {parent: frame})`

## Writing: `render`
- `--page "Name"` renders on that page and creates it when missing.
- `var:` takes any variable by full name: `bg="var:bgColor/muted"`, `color="var:fgColor/default"`.
- Styles by name: `<Frame effectStyle="shadow/small">`, `<Text textStyle="Body/Medium">`.
- Existing components, any page: `<Instance component="Button" variant="variant=danger, size=large" text="Delete" />`
  (`text` relabels the first text layer, `tint="var:accent"` recolors an icon instance).
- A component text or style whose font is not installed is switched to Inter
  automatically and reported as a `note:` line. You do not need to fix fonts.
- Images from the web: `<Frame image="https://..." imageScale="fill|fit" .../>` or
  `<Image src="https://..." w={320} h={200} />`. figma-cli downloads the file itself.
- Overlays and badges: `position="absolute" x={0} y={0}` takes a child out of the
  auto-layout flow (a named child). Clip children to rounded corners with `overflow="hidden"`.
- Text in a column with `items="center"` is centered automatically; set `align` to override.
- Long or generated JSX: write it to a file and run `render --file ui.jsx`
  (`render-batch --file frames.json` takes a JSON array). No shell quoting to get wrong.
- Text: `name="..."` names the layer, `decoration="strikethrough|underline"`.
- `render` prints the new node id and **the structure it built**: sizes, layout,
  padding, gap, bound variables, styles, which component each instance uses.
  Check that output; do not re-read the result with `eval`. `--verify` adds a
  screenshot when the look matters. `figma-cli verify <id> --scale 2` saves a
  sharper PNG to read (the default is a small 0.5x preview).
- Instances on the canvas without a wrapper: `render '<Instance component="Card" />'`
  or several at once with `render-batch`.

## Components
- One component: `render '<Frame ...>' --as-component`.
- A component set with variants in ONE call: `render-batch` with every frame
  named by its variant, plus `--variant-set <Name>`:
  `render-batch '["<Frame name=\"size=small, state=hover\" ...>...</Frame>", ...]' --variant-set Button`
- Component properties (in `eval`): `const k = comp.addComponentProperty('Label', 'TEXT', 'Default')`,
  then `textNode.componentPropertyReferences = { characters: k }`. For `'BOOLEAN'`
  reference `visible`; for `'INSTANCE_SWAP'` reference `mainComponent`.

## Design tokens / variables
- Bind colors at creation with `var:name`, never raw hex when a system is loaded:
  `<Frame bg="var:primary"><Text color="var:on-primary">Go</Text></Frame>`
- Pin a named collection when the user names one: `render-batch ... --collection figma`.
- Import a system: `figma-cli import tailwind.config.js | globals.css | tokens.json`.
- Export the open file's system: `figma-cli extract` → DESIGN.md.

## JSX cheatsheet (render)
- Layout: `flex="row|col" gap={16} p={24} px py pt pr pb pl justify="center|between" items="center"`
- Size: `w={320} h={200} w="fill" w="hug" w="60%"` (percent resolves vs parent)
- Look: `bg="#fff" stroke="#000" strokeWidth={2} rounded={12} shadow="..." opacity={0.8}`
- Text: `<Text size={14} weight="semibold" color="#000" lineHeight={20} truncate maxLines={2} w="fill">`
- Icons (real SVG, never emojis): `<Icon name="lucide:home" size={20} color="var:primary" />`
- Dividers: a thin child (`<Frame w={1} bg="var:border" />`) auto-fills the cross axis.

## Text wrapping (most common bug)
For text to wrap, the parent AND every `<Text>` need `w="fill"`, and the parent
needs `flex="col"` or `flex="row"`.

## Recreating a component from an extracted DESIGN.md (hard rule)
Don't read the structure markdown by hand. Use:
- `figma-cli spec <Component>` → authoritative variant axes + sample size (compact).
  Build EXACTLY to those axes (e.g. Variant × Size = a Component Set, not one node).
- `figma-cli spec <Component> --check <nodeId>` → enforces it (exit 1 on mismatch:
  wrong structure, missing axes, wrong height). Treat non-zero as "not done".

## Handy commands
```
figma-cli connect                      # connect to Figma Desktop (yolo)
figma-cli render '<Frame>...</Frame>'  # one frame
figma-cli render-batch '[ "<Frame>", ... ]' --direction row
figma-cli shadcn add button --count 3  # N distinct shadcn primitives
figma-cli node to-component "<id>"     # promote to a component
figma-cli verify "<id>" --measure      # screenshot + dimensions
figma-cli a11y audit                   # contrast / touch / text checks
```
<!-- /figma-cli rules -->

# Performance rules

The site is held to a budget: `npm run check:budget` after a build, and Lighthouse on every pull request (`.github/workflows/performance.yml`).

- Only the title and the salmon may hold up the opening. Everything else loads in a stage, after the first frame or after the reader first acts (`src/three/splash3d.js`).
- A new scene's images go through `createAssets()` (`src/three/assets.js`), and the scene stays hidden until they're all in. No `await` on assets in a scene.
- Paintings load at 1600 under 1000px wide, 2912 above.
- A browser with no usable GPU gets the flat version. `/?3d=force` runs the 3D there, for testing.
