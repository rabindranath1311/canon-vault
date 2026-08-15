# Sync and backup

A vault is a folder. Anything that syncs folders syncs it. Nothing in the app
depends on which you pick — and nothing in the app does it for you.

## The options, honestly

| | Good for | Watch out for |
| --- | --- | --- |
| **git** | history, undo, review — the only one that lets you *see* what an agent changed | manual; no continuous sync; not great for large binaries in `attachments/` |
| **iCloud Drive** | zero-effort desktop + Obsidian mobile | files evict to the cloud and appear missing until downloaded; can be slow to notice external writes |
| **Syncthing** | continuous, private, no third party | needs a device online; conflict files land next to real ones |
| **Obsidian Sync** | mobile, end-to-end encrypted, made for this | paid; syncs the vault, not your git history |
| **Dropbox / Drive** | familiar | the same eviction and conflict-copy behaviour as iCloud |

They combine. git for history plus iCloud or Syncthing for continuous sync is a
reasonable setup, and git is the one worth having if you use agents.

## git

```sh
cd <your-vault>
git init
printf '.trash/\n.history/\n.DS_Store\n' > .gitignore
git add -A && git commit -m "vault"
```

`.obsidian/` **is** worth committing — the config travels with the vault, so a
clone opens with the same settings. `.trash/` and `.history/` are not: they
churn on every write and would bury real history under thousands of snapshots.

Commit before you point an agent at the vault. That is what turns a bad bulk
edit into `git checkout .`.

## Conflicts

The app protects against the one case it can see: a page changed on disk since
it was loaded refuses to be silently overwritten — you get reload-or-overwrite,
and overwriting keeps the disk version as `<name> (conflict YYYY-MM-DD).md`.

It cannot protect against two machines editing the same page while offline. No
file-level sync tool merges markdown; they all just keep both copies. If that
matters to you, use git and merge deliberately.

## Backup is not sync

Sync propagates deletions. `.trash/` and `.history/` are recovery scratch space
inside the vault, so they do not help if the vault itself is lost.

If you want a real backup, take periodic copies somewhere sync cannot reach —
Time Machine, a git remote, `rsync` to another disk. The vault is plain files,
so every ordinary backup tool already handles it correctly.
