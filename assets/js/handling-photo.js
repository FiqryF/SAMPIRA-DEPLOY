// Keep phone evidence below small MySQL packet limits without changing the
// original file on the device. Small images keep their original bytes/type.
export async function prepareHandlingPhoto(file) {
    const maxBytes=750*1024;
    if(file.size<=maxBytes)return file;
    const url=URL.createObjectURL(file);
    const image=new Image();
    const canvas=document.createElement('canvas');
    try {
        image.src=url;
        await image.decode();
        if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>16_000_000)throw new Error('Resolusi foto maksimal 16 megapiksel.');
        const context=canvas.getContext('2d',{alpha:false});
        if(!context)throw new Error('Foto belum dapat dioptimalkan. Pilih foto dengan ukuran lebih kecil.');
        for(let edge=1920;edge>=480;edge=Math.floor(edge*.75)){
            const scale=Math.min(1,edge/Math.max(image.naturalWidth,image.naturalHeight));
            canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
            canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
            context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
            context.drawImage(image,0,0,canvas.width,canvas.height);
            for(const quality of [.85,.7,.55,.4]){
                const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
                if(blob?.type==='image/jpeg'&&blob.size<=maxBytes){
                    return new File([blob],'bukti-penanganan.jpg',{type:'image/jpeg',lastModified:file.lastModified});
                }
            }
        }
        throw new Error('Foto belum dapat diperkecil. Pilih foto lain atau foto beresolusi lebih rendah.');
    } finally {
        URL.revokeObjectURL(url);canvas.width=canvas.height=0;
    }
}
