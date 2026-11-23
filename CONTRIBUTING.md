# Contributing

Thanks for helping improve the AdSentinel integrations.

## Setup

Node.js 22 or later (see `.nvmrc`), then:

```sh
npm ci
npx nx run-many -t lint typecheck build test
npm run guard
```

The WordPress plugin is checked with `npx nx run-many -t lint package -p wordpress`
(the PHP syntax check needs `php` on your machine; CI always runs it).

## Rules

- Everything is written in English: code, identifiers, file names, comments, docs.
- File and identifier names say what the code does.
- Every integration is **fail-open**: a control-plane outage, bad credentials or
  malformed input must never break or slow down the host site.
- A change to the `EdgeBundle` contract follows `packages/plugin-core/src/contract.ts`:
  adding an optional field is fine; removing, renaming or retyping one needs a new
  contract version.
- `npm run guard` must pass (see `tools/public-hygiene-guard.mjs`).

## Releasing a package change

Releases use [Nx Release](https://nx.dev/features/manage-releases) with version plans.
With your change, add a version plan describing it:

```sh
npx nx release plan
```

Maintainers then run `npm run release` (versions, changelogs, commit and
`@adsentinel/<package>@<version>` tags), push the commit and the tags, and the
**Publish to npm** workflow publishes each tagged package with npm Trusted
Publishing and provenance.

The WordPress plugin is versioned by its `Version:` header and `Stable tag:` in
`wordpress/readme.txt`; pushing a `wordpress@<version>` tag builds the zip and
attaches it to a GitHub release.

## Pull requests

Keep one topic per pull request, with tests for behaviour changes. CI must be green.
