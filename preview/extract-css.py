import re, os

src = r'D:\dsh_asar\dsh\node_modules\@deepseek-ai\dsh-client-ui-sidebar-browser\lib\client.js'
text = open(src, encoding='utf-8').read()

m = re.search(r'const css = "((?:[^"\\]|\\.)*)";', text)
assert m, 'css literal not found'
css = m.group(1).replace('\\"', '"').replace('\\n', '\n')
css = css.replace('.bZwPEG_', '.sb_')

os.makedirs('preview', exist_ok=True)
open('preview/toolbar.css', 'w', encoding='utf-8', newline='\n').write(
    '/* 从 DSH 内置右栏浏览器 @deepseek-ai/dsh-client-ui-sidebar-browser 抽出，\n'
    '   仅把 CSS Modules 的哈希前缀 bZwPEG_ 换成 sb_。改版后重新抽取即可。 */\n'
    + css.replace('}', '}\n')
)
print('rules:', css.count('{'))
print('chars:', len(css))
