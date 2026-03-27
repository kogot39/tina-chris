# Scripts

## create-svelte-template

Create a new package under packages by cloning the Svelte template from packages/example-svelte.

The generated package name is always:

@tina-chris/<folder-name>

## Usage

From repository root:

```bash
pnpm create:svelte-template <folder-name>
```

Interactive mode:

```bash
pnpm create:svelte-template
```

The script will prompt for folder name when no argument is provided.

## Rules for folder name

- Allowed: lowercase letters, numbers, and hyphens
- Must start with a lowercase letter or number
- Examples: my-toolkit, ui2, pkg-abc

## What the script does

- Copies packages/example-svelte to packages/<folder-name>
- Updates packages/<folder-name>/package.json name field to @tina-chris/<folder-name>
- Skips copying node_modules, dist, and .svelte-kit

## Common errors

- Invalid folder name: rename with lowercase letters, numbers, and hyphens
- Target folder already exists: choose another folder name or remove existing folder first
- Template not found: ensure packages/example-svelte exists
