import io,sys,json,zipfile,warnings
from PIL import Image
Image.MAX_IMAGE_PIXELS=16_000_000
warnings.simplefilter('error', Image.DecompressionBombWarning)
data=sys.stdin.buffer.read()
mime=sys.argv[1]
try:
    if mime.startswith('image/'):
        image=Image.open(io.BytesIO(data))
        expected={'image/jpeg':'JPEG','image/png':'PNG','image/webp':'WEBP','image/gif':'GIF','image/bmp':'BMP','image/avif':'AVIF'}
        if image.format!=expected.get(mime): raise ValueError('File format mismatch')
        image.verify()
        image=Image.open(io.BytesIO(data));image.load()
    elif mime=='application/pdf':
        from pypdf import PdfReader
        if not data.startswith(b'%PDF-') or b'%%EOF' not in data[-2048:]: raise ValueError('Invalid PDF')
        document=PdfReader(io.BytesIO(data),strict=True)
        if document.is_encrypted or len(document.pages)<1: raise ValueError('Unsupported PDF')
    elif mime=='application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        with zipfile.ZipFile(io.BytesIO(data)) as doc:
            if sum(i.file_size for i in doc.infolist())>50*1024*1024: raise ValueError('Document too large')
            if 'word/document.xml' not in doc.namelist() or '[Content_Types].xml' not in doc.namelist(): raise ValueError('Invalid Word document')
            from xml.etree import ElementTree
            ElementTree.fromstring(doc.read('word/document.xml'))
    elif mime=='application/msword':
        if len(data)<512 or len(data)%512 or data[:8]!=bytes.fromhex('D0CF11E0A1B11AE1'): raise ValueError('Invalid Word document')
    else: raise ValueError('Unsupported file format')
    print(json.dumps({'valid':True}))
except Exception:
    print(json.dumps({'valid':False}));sys.exit(1)
