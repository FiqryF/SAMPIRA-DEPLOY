// Internet photographs, downloaded at display size. Credits remain visible in article figures.
const pexels='https://www.pexels.com/license/';
const photo=(file,alt,author,source,license=pexels)=>({src:'/assets/img/education-photos/'+file+'.jpg',alt,author,source,license,width:file==='compost'?640:960,height:file==='compost'?480:640,provider:file==='compost'?'Pixabay':'Pexels'});
export const educationPhotoLibrary={
    bins:photo('bins','Wadah terpisah untuk sampah organik, plastik, dan kertas.','Henry Acevedo','https://www.pexels.com/photo/colorful-recycling-bins-outdoors-in-sunlight-32246634/'),
    food:photo('food-waste','Buah dan sisa pangan yang telah dibuang.','Th2city Santana','https://www.pexels.com/photo/discarded-watermelons-and-mixed-food-waste-outdoors-30684081/'),
    compost:photo('compost','Kompos matang dipegang dengan kedua tangan.','Galanthus','https://pixabay.com/photos/fresh-compost-hand-man-2386786/','https://pixabay.com/service/license-summary/'),
    recycling:photo('recycling','Material plastik yang dikumpulkan untuk didaur ulang.','Mikhail Nilov','https://www.pexels.com/photo/a-pile-of-plastic-bags-and-plastic-bottles-7475829/'),
    burning:photo('burning','Asap dari pembakaran tumpukan sampah di ruang terbuka.','Collab Media','https://www.pexels.com/photo/view-of-burning-piles-of-waste-15060364/'),
    batteries:photo('batteries','Baterai rumah tangga yang perlu dikumpulkan secara terpisah.','mohamed abdelghaffar','https://www.pexels.com/photo/close-up-shot-of-black-and-yellow-batteries-6015268/'),
    groceries:photo('groceries','Sayuran segar di meja pembayaran toko bahan pangan.','Kampus Production','https://www.pexels.com/photo/an-assorted-vegetables-at-the-counter-8475149/'),
    community:photo('community','Relawan mengumpulkan sampah yang berserakan.','Thirdman','https://www.pexels.com/photo/volunteer-people-picking-up-trash-and-plastics-7656742/'),
    sorting:photo('sorting','Warga memilah material ke dalam wadah daur ulang.','cottonbro studio','https://www.pexels.com/photo/sorting-waste-according-to-box-6591163/'),
    facilities:photo('facilities','Tempat sampah di kawasan perkotaan yang meluap.','Natalia S','https://www.pexels.com/photo/a-city-street-with-trash-cans-and-cardboard-boxes-27607950/')
};
const articles={
    'mulai-pilah-sampah-dari-rumah':['bins','sorting'],
    'sisa-makanan-dominasi-sampah-indonesia':['food','compost'],
    'panduan-kompos-rumah':['compost','food'],
    'bank-sampah-dan-partisipasi-warga':['recycling','bins'],
    'bahaya-membakar-sampah-terbuka':['burning','recycling'],
    'pisahkan-sampah-elektronik-baterai':['batteries','bins'],
    'cara-mengurangi-food-waste':['groceries','food'],
    'kang-pisman-bandung':['community','sorting'],
    'kebiasaan-memilah-sampah-berbasis-riset':['sorting','bins'],
    'laporkan-sampah-dengan-informasi-jelas':['facilities','community']
};
const categories={'pemilahan-sampah':['bins','sorting'],'pengurangan-sampah':['groceries','food'],'daur-ulang':['recycling','sorting'],pengomposan:['compost','food'],'bank-sampah':['recycling','bins'],'sampah-elektronik':['batteries','bins'],'panduan-sampira':['community','facilities']};
export function educationPhotos(item){
    if(Array.isArray(item.photos)&&item.photos.length){ return item.photos.map(p=>({src:p.url,alt:p.alt,author:p.credit||'',source:p.url.startsWith('https://')?p.url:'',license:'',provider:'',width:960,height:640})); }
    return (articles[item.slug]||categories[item.category]||['bins','sorting']).map(key=>educationPhotoLibrary[key]);
}
export function educationPhotoImage(photo,lazy=true){
    const image=document.createElement('img');image.src=photo.src;image.alt=photo.alt;image.width=photo.width;image.height=photo.height;image.loading=lazy?'lazy':'eager';image.decoding='async';
    image.addEventListener('error',()=>{image.hidden=true;});return image;
}
function photoCredit(photo){if(!photo.author){ return 'Foto artikel'; }return 'Foto: '+photo.author+(photo.provider?' / '+photo.provider:'');}
export function educationPhotoFigure(photo,detail=false){
    const figure=document.createElement('figure');figure.className='sp-article-photo'+(detail?' sp-article-photo-detail':'');
    const caption=document.createElement('figcaption');
    if(detail){const text=document.createElement('span');text.textContent='Ilustrasi: '+photo.alt+' ';caption.append(text);}
    const source=document.createElement(photo.source?'a':'span');source.textContent=photoCredit(photo);if(photo.source){source.href=photo.source;source.rel='noopener noreferrer';}caption.append(source);
    if(detail&&photo.license){const license=document.createElement('a');license.textContent='Lisensi';license.href=photo.license;license.rel='noopener noreferrer';caption.append(document.createTextNode(' · '),license);}
    figure.append(educationPhotoImage(photo),caption);return figure;
}

// Render stored plain text as readable blocks without interpreting HTML.
function articleHeading(block){
    const line=block.replace(/\n$/,'');if(line.includes('\n')){ return null; }
    let count=0;while(count<line.length&&line[count]==='#'){ count++; }
    if(count<1||count>3||!/^\s/.test(line.slice(count))){ return null; }
    const title=line.slice(count).trimStart();return title?[line,title]:null;
}
export function educationArticleBody(text){
    const body=document.createElement('div');body.className='sp-article-body';
    for(const block of String(text||'').split(/\n\s*\n/)){
        const heading=articleHeading(block);
        const element=document.createElement(heading?'h3':'p');
        element.textContent=heading?heading[1]:block;body.append(element);
    }
    return body;
}
