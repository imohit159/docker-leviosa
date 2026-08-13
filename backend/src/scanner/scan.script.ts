import { ScanProtocol } from '../config/index.config.js';

const { PREFIX: P, DELIMITER: D, Record: R, EntryKind: K, Error: E, Env: V, Mode: M } = ScanProtocol;

/**
 * The measurement probe that runs inside the sidecar.
 *
 * Design constraints, all deliberate:
 *  - Pure POSIX sh, BusyBox-compatible: the base image is plain Alpine and we
 *    install nothing at scan time.
 *  - No caller-supplied value is ever interpolated into this text. The target path
 *    arrives through the environment, so a volume or directory named
 *    `; rm -rf /` is inert data, not shell syntax.
 *  - The path is resolved with `cd -P` and re-checked against the mount root, which
 *    defeats a symlink inside the volume pointing at the container filesystem.
 *  - `du -x -d 1` yields the recursive total (the line for the base itself) and every
 *    immediate child directory's size from a single walk of the tree.
 *  - Records are emitted raw; Node parses them. Filenames containing newlines will
 *    yield one unparseable record, which the parser drops, rather than corrupting
 *    the totals.
 */
export const ScanScript = Object.freeze({
  build(): string {
    return `set -u

ROOT="\${${V.ROOT}}"
REL="\${${V.PATH}}"
MODE="\${${V.MODE}}"
WITH_LAST_WRITE="\${${V.WITH_LAST_WRITE}}"
MAX_ENTRIES="\${${V.MAX_ENTRIES}}"

emit() { printf '%s\\n' "$*"; }
fail() { emit "${P}${D}${R.ERROR}${D}$1"; emit "${P}${D}${R.END}"; exit 0; }

if [ "$REL" = "/" ]; then TARGET="$ROOT"; else TARGET="$ROOT$REL"; fi
[ -d "$TARGET" ] || fail ${E.NOT_A_DIRECTORY}

BASE=$(cd -P "$TARGET" 2>/dev/null && pwd -P) || BASE=""
[ -n "$BASE" ] || fail ${E.NOT_A_DIRECTORY}
case "$BASE" in
  "$ROOT") ;;
  "$ROOT"/*) ;;
  *) fail ${E.OUTSIDE_ROOT} ;;
esac

emit "${P}${D}${R.BASE}${D}$BASE"

du -xk -d 1 "$BASE" 2>/dev/null | awk -F'\\t' '{ printf "${P}${D}${R.DU}${D}%s${D}%s\\n", $1, $2 }'

count=0
truncated=0
for entry in "$BASE"/* "$BASE"/.[!.]* "$BASE"/..?*; do
  if [ ! -e "$entry" ] && [ ! -L "$entry" ]; then continue; fi
  count=$((count + 1))
  if [ "$count" -gt "$MAX_ENTRIES" ]; then truncated=1; break; fi
  if [ -L "$entry" ]; then
    kind=${K.SYMLINK}; size=0
  elif [ -d "$entry" ]; then
    kind=${K.DIRECTORY}; size=0
  elif [ -f "$entry" ]; then
    kind=${K.FILE}; size=$(stat -c '%s' "$entry" 2>/dev/null || echo 0)
  else
    kind=${K.OTHER}; size=0
  fi
  mtime=$(stat -c '%Y' "$entry" 2>/dev/null || echo 0)
  emit "${P}${D}${R.STAT}${D}$kind${D}$size${D}$mtime${D}$entry"
done

if [ "$truncated" -eq 1 ]; then emit "${P}${D}${R.TRUNCATED}${D}1"; fi

if [ "$MODE" = "${M.MEASURE}" ]; then
  emit "${P}${D}${R.FILE_COUNT}${D}$(find "$BASE" -xdev -type f 2>/dev/null | wc -l | tr -d ' ')"
  emit "${P}${D}${R.DIR_COUNT}${D}$(find "$BASE" -xdev -type d 2>/dev/null | wc -l | tr -d ' ')"
  if [ "$WITH_LAST_WRITE" = "1" ]; then
    newest=$(find "$BASE" -xdev -print0 2>/dev/null | xargs -0 -r stat -c '%Y' 2>/dev/null | awk 'BEGIN { m = 0 } { if ($1 + 0 > m) m = $1 + 0 } END { print m }')
    emit "${P}${D}${R.LAST_WRITE}${D}\${newest:-0}"
  fi
fi

emit "${P}${D}${R.END}"
`;
  },
});
