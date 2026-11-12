# Change entries

Every branch with a change users can see adds one file here, `changes/<branch>.json`, before it is merged.
The release notes of each store are built from these files, per platform.

```json
{ "platforms": ["android", "ios", "web"], "ar": "…", "en": "…" }
```

- `platforms`: where users see the change (`android`, `ios`, `web`). A server change that users notice in
  the apps lists the apps.
- `ar`, `en`: one short sentence each, written for users, not developers. Play allows 500 characters for
  all of a release's notes in one language.
- Changes users can't see (tests, tooling, docs) add no file.
- Never edit or delete a file after it is merged: each store's notes are the files added since its last
  release (`release/<channel>/<version>` tags).
