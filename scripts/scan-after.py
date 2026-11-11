import sys, re

path, start = sys.argv[1], int(sys.argv[2])
pat = sys.argv[3]
limit = int(sys.argv[4]) if len(sys.argv) > 4 else 8
width = int(sys.argv[5]) if len(sys.argv) > 5 else 700

raw = open(path, encoding='utf-8').read()
seen = 0
for m in re.finditer(pat, raw):
    if m.start() < start:
        continue
    print(f'--- @{m.start()} ---')
    print(raw[m.start():m.start() + width].replace('\n', ' ')[:width])
    print()
    seen += 1
    if seen >= limit:
        break
