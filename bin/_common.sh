#!/usr/bin/env bash
# Shared by the capture scripts.
#
# Task 7.6: the scripts live in the code repo; everything they produce goes to
# the VAULT. BRAIN_DIR is required and has no repo-relative default, so a
# misconfigured launchd job fails loudly instead of quietly filling the code
# repo with private content.

require_brain_dir() {
    if [ -z "${BRAIN_DIR:-}" ]; then
        echo "ERROR: BRAIN_DIR is not set." >&2
        echo "  Point it at your vault, e.g.  export BRAIN_DIR=\"\$HOME/Brain\"" >&2
        exit 2
    fi
    BRAIN_DIR="${BRAIN_DIR/#\~/$HOME}"
    if [ ! -d "$BRAIN_DIR" ]; then
        echo "ERROR: BRAIN_DIR does not exist: $BRAIN_DIR" >&2
        exit 2
    fi
    # Refuse to write into the repo these scripts live in.
    local repo; repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    case "$(cd "$BRAIN_DIR" && pwd)" in
        "$repo"|"$repo"/*)
            echo "ERROR: BRAIN_DIR is inside the code repo ($repo)." >&2
            echo "  The vault is a sibling, never a subdirectory." >&2
            exit 2 ;;
    esac
}

# Logs never live in the vault: they churn constantly and would show up in
# Obsidian and in every git diff.
log_dir() {
    local d="${BRAIN_LOG_DIR:-$HOME/Library/Logs/canon-vault}"
    mkdir -p "$d"
    printf '%s' "$d"
}

# A real 26-char ULID: 10 chars of millisecond timestamp, 16 of randomness,
# Crockford base32 (no I, L, O or U).
ulid() {
    local enc="0123456789ABCDEFGHJKMNPQRSTVWXYZ"
    local ms=$(( $(date +%s) * 1000 ))
    local out="" i t=$ms
    for ((i = 0; i < 10; i++)); do
        out="${enc:$((t % 32)):1}$out"
        t=$((t / 32))
    done
    for ((i = 0; i < 16; i++)); do
        out="$out${enc:$((RANDOM % 32)):1}"
    done
    printf '%s' "$out"
}

utc_now() { date -u +%Y-%m-%dT%H:%M:%S+00:00; }

# A title using only characters the serializer emits unquoted, so a script can
# write frontmatter by hand and still round-trip byte for byte (task 7.7).
emit_safe_title() {
    local t
    t=$(printf '%s' "$1" | tr -c 'A-Za-z0-9 _.+@-' '-')
    t=$(printf '%s' "$t" | tr -s '-' '-' | sed 's/^[-. ]*//; s/[-. ]*$//')
    [ -n "$t" ] || t="Untitled note"
    printf '%s' "$t"
}

# Write a note in exactly the serializer's field order, with the body preceded
# by one blank line and terminated by a single newline.
write_note() {
    local path="$1" id="$2" title="$3" created="$4" updated="$5" captured="$6" source="$7" body="$8"
    {
        printf -- '---\n'
        printf 'id: %s\n' "$id"
        printf 'kind: note\n'
        printf 'title: %s\n' "$title"
        printf 'created: %s\n' "$created"
        printf 'updated: %s\n' "$updated"
        [ -n "$captured" ] && printf 'captured: %s\n' "$captured"
        [ -n "$source" ] && printf 'source: %s\n' "$source"
        printf -- '---\n\n'
        printf '%s\n' "$body"
    } > "$path"
}
