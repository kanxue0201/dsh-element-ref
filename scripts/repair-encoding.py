"""Repair a file that PowerShell round-tripped through cp936.

PowerShell read the UTF-8 file as cp936 and wrote the result back as UTF-8, so every
non-ASCII character turned into the cp936 reading of its UTF-8 bytes, and bytes that
cp936 could not map became '?'. Re-encoding to cp936 gives the original byte stream back,
except at those holes; each hole is one byte, so brute-force the byte that keeps the
stream valid UTF-8 and lands on a printable character.
"""

import sys
from pathlib import Path

CP936 = "cp936"


def to_bytes(text: str) -> list[int | None]:
    out: list[int | None] = []
    for ch in text:
        if ch == "?":
            out.append(None)  # a lost byte
            continue
        try:
            out.extend(ch.encode(CP936))
        except UnicodeEncodeError:
            out.extend(ch.encode("utf-8"))
    return out


def decode_with_holes(data: list[int | None]) -> str:
    text: list[str] = []
    i = 0
    n = len(data)
    holes = 0
    while i < n:
        byte = data[i]
        if byte is None:
            # Brute-force the missing byte so that the following bytes form one character.
            best = None
            for candidate in range(0x20, 0x100):
                trial = list(data)
                trial[i] = candidate
                chunk = bytes(b for b in trial[i:i + 4] if b is not None)
                try:
                    decoded = chunk.decode("utf-8")
                except UnicodeDecodeError:
                    continue
                if decoded and decoded[0].isprintable():
                    best = candidate
                    break
            if best is None:
                text.append("?")
                holes += 1
                i += 1
                continue
            data[i] = best
            holes += 1
        # Normal path: consume one valid UTF-8 character.
        for size in (1, 2, 3, 4):
            window = data[i:i + size]
            if any(b is None for b in window) or len(window) < size:
                continue
            try:
                decoded = bytes(window).decode("utf-8")
            except UnicodeDecodeError:
                continue
            text.append(decoded)
            i += size
            break
        else:
            text.append("?")
            i += 1
    return "".join(text), holes


def main() -> int:
    path = Path(sys.argv[1])
    raw = path.read_text(encoding="utf-8")
    body = raw[1:] if raw.startswith("\ufeff") else raw
    data = to_bytes(body)
    fixed, holes = decode_with_holes(data)
    out = path.with_suffix(path.suffix + ".repaired")
    out.write_text(fixed, encoding="utf-8", newline="\n")
    bad = sum(1 for ch in fixed if ch == "?")
    print(f"{path}: {len(body)} chars -> {len(fixed)} chars, holes={holes}, stray '?'={bad}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
