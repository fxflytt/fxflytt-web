from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
N="#0d2a3f"; O="#ff7a1a"; W="#ffffff"; G="#5b6b78"
EB="/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"; SB="/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
def text_path(txt, fontfile, size, track=0, skew=0):
    f=TTFont(fontfile); gs=f.getGlyphSet(); cmap=f.getBestCmap(); upm=f["head"].unitsPerEm
    s=size/upm; pen=SVGPathPen(gs); cx=0
    for ch in txt:
        g=cmap[ord(ch)]
        gs[g].draw(TransformPen(pen,(s,0,s*skew,-s,cx,0))); cx+=gs[g].width*s+track
    return pen.getCommands(), cx
fx,_=text_path("FX",EB,46,-1,0.21)
def mark(bg=N, fg=W):
    return (f'<rect width="120" height="120" rx="28" fill="{bg}"/>'
            f'<rect x="12" y="43" width="24" height="8" rx="4" fill="{O}"/><rect x="6" y="57" width="32" height="8" rx="4" fill="{O}"/><rect x="16" y="71" width="20" height="8" rx="4" fill="{O}"/>'
            f'<path transform="translate(40 78)" d="{fx}" fill="{fg}"/>')
name,nw=text_path("FX Flytt",EB,60,-1)
sub,sw=text_path("FLYTT EXPRESS",SB,19.5,5.2)
def full(bg=N, fg=W, word=N, subc=G):
    return (f'<g>{mark(bg,fg)}</g><path transform="translate(144 62)" d="{name}" fill="{word}"/>'
            f'<path transform="translate(146 96)" d="{sub}" fill="{subc}"/>')
WF=int(146+max(nw,sw)+4)
S=lambda vb,body:f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">{body}</svg>'
files={"fxflytt-logo":S(f"0 0 {WF} 120",full()),"fxflytt-logo-vit":S(f"0 0 {WF} 120",full(W,N,W,"#9fb3c4")),
       "fxflytt-ikon":S("0 0 120 120",mark()),"fxflytt-ikon-vit":S("0 0 120 120",mark(W,N))}
for n,s in files.items(): open(f"{n}.svg","w").write(s)
import re
p=open("logo-pdf.html").read()
p=re.sub(r'<svg xmlns[\s\S]*?</svg>', lambda m: "@@", p)
order=["fxflytt-logo","fxflytt-logo-vit","fxflytt-ikon","fxflytt-ikon-vit","fxflytt-ikon","fxflytt-ikon","fxflytt-ikon"]
for n in order: p=p.replace("@@",files[n],1)
open("logo-pdf.html","w").write(p)

# ---- web assets ----
import subprocess, os
OUT="/home/claude/fxflytt-web/public"
for n,s in files.items(): open(f"{OUT}/{n}.svg","w").write(s)
open(f"{OUT}/favicon.svg","w").write(files["fxflytt-ikon"])
sq=S("0 0 120 120",mark().replace('rx="28"','rx="0"'))
open("/tmp/apple.svg","w").write(sq)
subprocess.run(["rsvg-convert","-w","180","-h","180","/tmp/apple.svg","-o",f"{OUT}/apple-touch-icon.png"],check=True)
open("/tmp/ic.svg","w").write(files["fxflytt-ikon"])
for z in (16,32,48,192,512):
    subprocess.run(["rsvg-convert","-w",str(z),"-h",str(z),"/tmp/ic.svg","-o",f"/tmp/ic{z}.png"],check=True)
subprocess.run(["convert","/tmp/ic16.png","/tmp/ic32.png","/tmp/ic48.png",f"{OUT}/favicon.ico"],check=True)
for z in (192,512): os.replace(f"/tmp/ic{z}.png",f"{OUT}/icon-{z}.png")
# share image 1200x630
tag,tw=text_path("Flytt och flyttstäd med fasta priser",SB,40)
url,uw=text_path("fxflytt.se",EB,34)
scale=2.0; lw=WF*scale
og=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="{N}"/>'
    f'<rect x="0" y="600" width="1200" height="30" fill="{O}"/>'
    f'<g transform="translate({(1200-lw)/2:.1f} 110) scale({scale})">{full(W,N,W,"#9fb3c4")}</g>'
    f'<path transform="translate({(1200-tw)/2:.1f} 455)" d="{tag}" fill="#ffffff"/>'
    f'<path transform="translate({(1200-uw)/2:.1f} 530)" d="{url}" fill="{O}"/></svg>')
open("/tmp/og.svg","w").write(og)
subprocess.run(["rsvg-convert","-w","1200","-h","630","/tmp/og.svg","-o",f"{OUT}/og-image.png"],check=True)
# inline marks for the header/footer
open("/home/claude/logo/mark-inline.txt","w").write(mark())
open("/home/claude/logo/mark-inline-white.txt","w").write(mark(W,N))
print("web assets ok")
