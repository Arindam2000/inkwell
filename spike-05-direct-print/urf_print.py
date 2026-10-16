"""Spike 05: print one ruler page straight to the printer over IPP as URF raster (no driver, no dialog)."""
import struct, sys, urllib.request
import numpy as np
from PIL import Image, ImageDraw, ImageFont
DPI=600; W,H=4960,7016
mm=lambda v: round(v*DPI/25.4)
img=Image.new('L',(W,H),255); d=ImageDraw.Draw(img)
try: f=ImageFont.truetype('arial.ttf',mm(5)); fs=ImageFont.truetype('arial.ttf',mm(3))
except: f=fs=ImageFont.load_default()
d.text((mm(20),mm(20)),'Inkwell spike 05: direct print (no Android print screen)',font=f,fill=0)
d.text((mm(20),mm(30)),'Each ruler should measure exactly 100 mm.',font=fs,fill=0)
x0,y0=mm(20),mm(60); lw=mm(0.25)
d.rectangle((x0,y0,x0+mm(100),y0+lw),fill=0)
for i in range(101):
    t=mm(6 if i%10==0 else 4 if i%5==0 else 2.5); x=x0+mm(i)
    d.rectangle((x,y0-t,x+lw,y0),fill=0)
    if i%10==0: d.text((x,y0+mm(2)),str(i),font=fs,fill=0,anchor='mt')
x1,y1=mm(30),mm(90)
d.rectangle((x1,y1,x1+lw,y1+mm(100)),fill=0)
for i in range(101):
    t=mm(6 if i%10==0 else 4 if i%5==0 else 2.5); y=y1+mm(i)
    d.rectangle((x1,y,x1+t,y+lw),fill=0)
    if i%10==0: d.text((x1+mm(8),y),str(i),font=fs,fill=0,anchor='lm')
for k in range(8):  # gray steps: quality check
    v=round(k*255/7); d.rectangle((mm(80+k*14),mm(100),mm(92+k*14),mm(115)),fill=v)
a=np.asarray(img)

def enc_line(row):
    out=bytearray(); i=0; n=len(row)
    while i<n:
        j=i
        while j+1<n and row[j+1]==row[i] and j-i<127: j+=1
        if j>i: out+=bytes([j-i,row[i]]); i=j+1; continue
        j=i
        while j+1<n and row[j+1]!=row[j] and j-i<127: j+=1
        if j+1<n and row[j+1]==row[j] and j>i: j-=1
        cnt=j-i+1; out+=bytes([257-cnt if cnt>1 else 0]); out+=bytes(row[i:j+1]) if cnt>1 else bytes([row[i]]); i=j+1
    return out
def urf(a,quality=5):
    h,w=a.shape
    hdr=bytes([8,0,1,quality])+b'\0'*8+struct.pack('>III',w,h,DPI)+b'\0'*8
    body=bytearray(b'UNIRAST\0'+struct.pack('>I',1)+hdr); y=0
    while y<h:
        r=1
        while y+r<h and r<256 and np.array_equal(a[y+r],a[y]): r+=1
        body+=bytes([r-1])+enc_line(a[y].tobytes()); y+=r
    return bytes(body)
def A(tag,name,val):
    v=val if isinstance(val,bytes) else val.encode(); n=name.encode()
    return bytes([tag])+struct.pack('>H',len(n))+n+struct.pack('>H',len(v))+v
host=sys.argv[1]; data=urf(a)
op=(struct.pack('>HHI',0x0200,0x0002,1)+b'\x01'+A(0x47,'attributes-charset','utf-8')+A(0x48,'attributes-natural-language','en')
  +A(0x45,'printer-uri',f'ipp://{host}/ipp/print')+A(0x42,'requesting-user-name','inkwell')+A(0x42,'job-name','inkwell spike 05')
  +A(0x49,'document-format','image/urf')+b'\x02'+A(0x23,'print-quality',struct.pack('>i',5))+A(0x44,'media','iso_a4_210x297mm')+b'\x03')
print('urf bytes',len(data))
r=urllib.request.urlopen(urllib.request.Request(f'http://{host}:631/ipp/print',data=op+data,headers={'Content-Type':'application/ipp'}),timeout=60).read()
print('status 0x%04x'%struct.unpack('>H',r[2:4])[0])
