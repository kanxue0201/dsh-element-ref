import sys, re

path = sys.argv[1]
tokens = sys.argv[2:]
raw = open(path, encoding='utf-8').read()

for tok in tokens:
    print(f'=== {tok} ===')
    for m in re.finditer(re.escape(tok), raw):
        s = max(0, m.start() - 320)
        e = min(len(raw), m.end() + 520)
        print(f'--- @{m.start()} ---')
        print(raw[s:e].replace('\n', ' ')[:900])
        print()
