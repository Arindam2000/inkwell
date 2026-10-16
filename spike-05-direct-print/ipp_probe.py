import struct, urllib.request, sys
host=sys.argv[1]
def attr(tag,name,val):
    v=val.encode(); n=name.encode()
    return bytes([tag])+struct.pack('>H',len(n))+n+struct.pack('>H',len(v))+v
uri=f'ipp://{host}/ipp/print'
body=struct.pack('>HHI',0x0200,0x000B,1)+b'\x01'+attr(0x47,'attributes-charset','utf-8')+attr(0x48,'attributes-natural-language','en')+attr(0x45,'printer-uri',uri)+b'\x03'
req=urllib.request.Request(f'http://{host}:631/ipp/print',data=body,headers={'Content-Type':'application/ipp'})
d=urllib.request.urlopen(req,timeout=8).read()
i=8; out={}; name=None
while i<len(d):
    t=d[i]; i+=1
    if t<0x10:
        if t==3: break
        continue
    nl=struct.unpack('>H',d[i:i+2])[0]; i+=2; n=d[i:i+nl].decode(errors='replace'); i+=nl
    vl=struct.unpack('>H',d[i:i+2])[0]; i+=2; v=d[i:i+vl]; i+=vl
    if nl: name=n
    if t in (0x21,0x23) and vl==4: v=struct.unpack('>i',v)[0]
    elif t==0x32 and vl==9: x,y,u=struct.unpack('>iib',v); v=f'{x}x{y}'
    elif t==0x33: a,b=struct.unpack('>ii',v); v=f'{a}-{b}'
    elif t==0x34 or t==0x37: v='<col>'
    else: v=v.decode(errors='replace')
    out.setdefault(name,[]).append(v)
keys=['printer-make-and-model','document-format-supported','print-scaling-supported','print-scaling-default','print-quality-supported','printer-resolution-supported','pwg-raster-document-resolution-supported','urf-supported','media-supported','media-bottom-margin-supported','media-left-margin-supported','sides-supported','pclm-source-resolution-supported','printer-output-tray','output-bin-supported','page-delivery-supported','ipp-versions-supported','printer-firmware-string-version']
for k in keys:
    if k in out: print(k,'=',out[k][:20])
