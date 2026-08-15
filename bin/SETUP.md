# Capture setup

Three ways things get into the vault without you typing them. All of them write
**files** — there is no server, no API and no upload.

Everything here needs one variable:

```sh
export BRAIN_DIR="$HOME/Brain"      # wherever your vault actually is
```

The scripts refuse to run without it, and refuse a `BRAIN_DIR` inside this
repo. That is deliberate: a misconfigured launchd job should fail loudly, not
quietly fill a publishable repo with private notes.

Logs go to `~/Library/Logs/canon-vault/`, never into the vault — they churn on
every run and would show up in Obsidian and in every commit.

> **Upgrading from an older checkout?** The launchd label and the log directory
> were renamed from `second-brain` to `canon-vault`. Unload the old agent before
> loading the new one, or you will have two watchers running:
>
> ```sh
> launchctl unload ~/Library/LaunchAgents/com.secondbrain.screenshot-watcher.plist 2>/dev/null
> rm -f ~/Library/LaunchAgents/com.secondbrain.screenshot-watcher.plist
> ```

---

## 1. Screenshots

Copies new screenshots into `attachments/screenshots/<YYYY-MM>/`. No page is
created: the app's inspo grid shows every image in the vault, so the file is
enough.

```sh
BRAIN_DIR="$HOME/Brain" bin/screenshot-sync.sh
```

To run it automatically, generate the launchd plist from the template — it needs
literal absolute paths, so substitute them in:

```sh
mkdir -p ~/Library/LaunchAgents ~/Library/Logs/canon-vault
sed -e "s|__SCRIPTS__|$(pwd)|g" \
    -e "s|__BRAIN_DIR__|$HOME/Brain|g" \
    -e "s|__SCREENSHOTS__|$HOME/Desktop/Screenshots|g" \
    -e "s|__LOGS__|$HOME/Library/Logs/canon-vault|g" \
    bin/launchd/com.canonvault.screenshot-watcher.plist.template \
    > ~/Library/LaunchAgents/com.canonvault.screenshot-watcher.plist

launchctl unload ~/Library/LaunchAgents/com.canonvault.screenshot-watcher.plist 2>/dev/null
launchctl load  ~/Library/LaunchAgents/com.canonvault.screenshot-watcher.plist
```

Check it: take a screenshot, then

```sh
ls -t "$HOME/Brain/attachments/screenshots"/*/ | head
tail ~/Library/Logs/canon-vault/screenshot-sync.log
```

## 2. Voice memos

Transcribes with whisper.cpp and writes a note into `notes/`, with the audio
filed under `attachments/voice/`.

```sh
brew install whisper-cpp ffmpeg
mkdir -p ~/.whisper-models
curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin \
     -o ~/.whisper-models/ggml-base.en.bin

# drop memos here, then:
BRAIN_DIR="$HOME/Brain" bin/voice-transcribe.sh
```

The note it writes is in exactly the shape `CONVENTION.md` specifies — a real
ULID `id`, `kind: note`, `created`/`updated`, plus `captured` and `source`. It
passes the validator unmodified:

```sh
node scripts/verify-vault.mjs --vault "$HOME/Brain"
```

## 3. Web clipping — Obsidian Web Clipper

Use the official [Obsidian Web Clipper](https://obsidian.md/clipper) rather than
a custom extension. It is maintained, it extracts article content in the page
(which is the only way to get around CORS without a server), and it writes
markdown straight into a vault folder.

Configure one template:

- **Behaviour:** create new note
- **Note location:** `notes/`
- **Title:** `{{title}}`

**Properties** — these four are required by the convention, the rest are the
useful extras:

| Property | Value |
| --- | --- |
| `id` | `{{date:YYYYMMDDHHmmss}}{{random:12}}` — see the note below |
| `kind` | `note` |
| `created` | `{{date:YYYY-MM-DDTHH:mm:ssZ}}` |
| `updated` | `{{date:YYYY-MM-DDTHH:mm:ssZ}}` |
| `url` | `{{url}}` |
| `captured` | `{{date:YYYY-MM-DDTHH:mm:ssZ}}` |
| `author` | `{{author}}` |
| `og_title` | `{{title}}` |
| `og_image` | `{{image}}` |
| `og_site_name` | `{{site}}` |
| `tags` | `{{tags}}` |

> **On `id`:** the clipper has no ULID generator. Any stable, unique,
> URL-safe string is acceptable to the validator — it accepts a 26-char ULID or
> a lowercase slug. If your template can only produce a timestamp, that is fine;
> what matters is that it never changes afterwards.

`url` plus `og_image` is what makes the app render the clip as a bookmark card
rather than a plain article — the chrome follows the frontmatter, not a kind.

After your first clip:

```sh
node scripts/verify-vault.mjs --vault "$HOME/Brain"
```

If it complains, the template is wrong — fix it once and every later clip is
correct.
