import {educationArticleBody,educationPhotos,educationPhotoFigure as photoFigure} from './education-photos.js?v=maps-reader-9';
const base = "/api/ecorecycle/education";
const publicPage = "/assets/education.html";
// Version the document as well as its assets: browsers cache each ?page=N URL separately.
function publicURL(query){const params=new URLSearchParams(query);params.set('ui','education-unified-19');return publicPage+'?'+params;}
const statuses = { draft: "Draf", published: "Terbit", archived: "Arsip" };
const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });

function node(tag, content, className) {
    const element = document.createElement(tag);
    if (content) { element.textContent = content; }
    if (className) { element.className = className; }
    return element;
}

async function request(path, body, method = "GET") {
    const response = await fetch(base + path, {
        credentials: "same-origin", method,
        ...(body instanceof FormData?{body}:body&&{ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.data) {
        let displayValue1; if (response.status === 401) { displayValue1 = "Sesi berakhir. Masuk kembali."; } else if (response.status === 403) { displayValue1 = "Akun ini tidak memiliki akses."; } else if (response.status === 404) { displayValue1 = "Artikel atau layanan edukasi belum tersedia."; } else { displayValue1 = result?.message || "Layanan edukasi gagal dimuat. Coba lagi."; }
const message = displayValue1;
        throw Object.assign(new Error(message), { status: response.status });
    }
    return result.data;
}

function articleLink(item) {
    return publicURL({artikel:item.slug});
}

function options(select, categories, label) {
    const previous = select.value;
    select.replaceChildren(new Option(label, ""), ...categories.map(item => new Option(item.label, item.key)));
    if (categories.some(item => item.key === previous)) { select.value = previous; }
}

function card(item, categories) {
    const article = node("article", "", "sp-article-card");
    article.append(photoFigure(educationPhotos(item)[0]));
    const category = categories.find(entry => entry.key === item.category)?.label || item.category;
    const label = node("span", category, "sp-kicker");
    const heading = node("h3");
    const link = node("a", item.title);
    link.href = articleLink(item);
    heading.append(link);
    article.append(label, heading, node("p", item.summary));
    if (item.published_at) { article.append(node("time", date.format(new Date(item.published_at)))); }
    return article;
}

await Promise.all([...document.querySelectorAll('[data-education-preview]')].map(async preview=>{
    try{const data=await request('/articles?limit=3');preview.replaceChildren(...(data.items.length?data.items.slice(0,3).map(item=>card(item,data.categories)):[node('p',preview.dataset.emptyText||'Belum ada artikel terbit.')]));}
    catch(error){preview.textContent=error.message;}
}));

const portalEducation = document.querySelector("[data-portal-education]");
if (portalEducation) {
    const categoryIcons = {"pemilahan-sampah":"fa-boxes-stacked", "pengurangan-sampah":"fa-leaf",
        "daur-ulang":"fa-recycle", pengomposan:"fa-seedling", "bank-sampah":"fa-box",
        "sampah-elektronik":"fa-plug", "panduan-sampira":"fa-book-open"};
    const form = portalEducation.querySelector("form");
    const message = portalEducation.querySelector("[role=status], output[aria-live]");
    const list = portalEducation.querySelector(".sp-portal-articles");
    const feature = portalEducation.querySelector(".sp-education-feature");
    const categoryGrid = portalEducation.querySelector(".sp-education-category-grid");
    const pageLabel = portalEducation.querySelector(".sp-education-page");
    const prev = portalEducation.querySelector("[data-prev]");
    const next = portalEducation.querySelector("[data-next]");
    let page = 1;
    let sequence = 0;
    let filters = {};

    function renderCategories(categories) {
        if (!categoryGrid.children.length) {
            for (const {key, label} of [{key:"", label:"Semua"}, ...categories]) {
                const button = node("button");
                button.type = "button";
                button.dataset.category = key;
                const icon = node("i", "", "fas " + (categoryIcons[key] || "fa-layer-group"));
                icon.setAttribute("aria-hidden", "true");
                button.append(icon, node("span", label));
                categoryGrid.append(button);
            }
        }
        for (const button of categoryGrid.children) {
            button.setAttribute("aria-pressed", String(button.dataset.category === (filters.category || "")));
        }
    }

    async function load() {
        const run = ++sequence;
        prev.disabled = next.disabled = true;
        list.replaceChildren();
        feature.hidden = true;
        message.textContent = "Memuat artikel…";
        const query = new URLSearchParams({...filters, page: String(page), limit: "6"});
        try {
            const data = await request("/articles?" + query);
            if (run !== sequence) { return; }
            renderCategories(data.categories);
            list.replaceChildren(...data.items.map(item => {
                const article = card(item, data.categories);
                return article;
            }));
            const start = (page - 1) * 6 + 1;
            message.textContent = data.items.length ? `Menampilkan ${start}–${start + data.items.length - 1} artikel` : "Tidak ada artikel untuk pilihan ini.";
            pageLabel.textContent = page;
            pageLabel.classList.add('sp-button','education-page-current');
            prev.disabled = page <= 1;
            next.disabled = data.next_page === null;
        } catch (error) {
            if (run === sequence) { message.textContent = error.message; }
        }
    }

    form.addEventListener("submit", event => {
        event.preventDefault();
        const query = form.elements.q.value.trim();
        if (query) { filters.q = query; }
        else { delete filters.q; }
        page = 1;
        void load();
    });
    categoryGrid.addEventListener("click", event => {
        const button = event.target.closest("button[data-category]");
        if (!button) { return; }
        if (button.dataset.category) { filters.category = button.dataset.category; }
        else { delete filters.category; }
        page = 1;
        void load();
    });
    prev.addEventListener("click", () => { page--; void load(); });
    next.addEventListener("click", () => { page++; void load(); });
    window.addEventListener("sampira:user-view", event => {
        if (event.detail === "edukasi") { void load(); }
    });
    if (portalEducation.classList.contains('active')) { await load(); }
}

function renderPageNumbers(reader,data,pageURL){
            const pages=reader.querySelector('#education-pages');
            if(pages){
                const known=[...new Set([1,Math.max(1,data.page-1),data.page,...(data.next_page?[data.next_page]:[])])].sort((a,b)=>a-b);
                pages.replaceChildren();let last=0;
                for(const page of known){
                    if(last&&page>last+1){const gap=node('span','…','education-page-gap');gap.setAttribute('aria-hidden','true');pages.append(gap);}
                    const link=node('a',String(page),'education-page');link.href=pageURL(page);link.setAttribute('aria-label','Halaman '+page);
                    if(page===data.page){ link.setAttribute('aria-current','page'); }pages.append(link);last=page;
                }
            }
}

const reader = document.querySelector("#education-reader");
if (reader) {
    const filter = reader.querySelector("form");
    const status = reader.querySelector("output, [role=status]");
    const results = reader.querySelector("#education-results");
    const next = reader.querySelector("#education-next");
    const previous = reader.querySelector("#education-prev");
    const params = new URLSearchParams(location.search);
    const slug = params.get("artikel");
    const back=reader.querySelector('#education-back');
    reader.dataset.view=slug?'article':'catalog';
    if(back&&slug){back.href=publicURL();back.setAttribute('aria-label','Kembali ke pusat edukasi');back.title='Kembali ke pusat edukasi';}

    if (slug) {
        filter.hidden = true;
        reader.querySelector('.sp-pager').hidden=true;
        try { const item=await request("/articles/" + encodeURIComponent(slug));
            const article = node("article", "", "sp-reader-article");
            const heading=node('header','','education-reading-header');
            heading.append(node('p','Pusat edukasi SAMPIRA','sp-kicker'),node("h1", item.title), node("p", item.summary, "sp-deck"));
            if (item.published_at) { heading.append(node("time", date.format(new Date(item.published_at)))); }
            article.append(heading);
            const photos=educationPhotos(item);
            const gallery=node('div','','education-reading-photos');gallery.append(photoFigure(photos[0],true));article.append(gallery);
            article.append(educationArticleBody(item.body));
            if(photos[1]){const supporting=node('div','','education-reading-photos education-reading-support');supporting.append(photoFigure(photos[1],true));article.append(supporting);}
            const sources = node("ul");
            for (const value of item.sources || []) {
                let url;
                try { url = new URL(value); } catch { continue; }
                if (url.protocol !== "https:" || url.username || url.password) { continue; }
                const source = node("li");
                const link = node("a", url.hostname + url.pathname);
                link.href = url.href;
                link.rel = "noopener noreferrer";
                source.append(link);
                sources.append(source);
            }
            if (sources.childElementCount){const references=node('section','','education-reading-sources');references.append(node("h2", "Sumber"),sources);article.append(references);}
            results.classList.remove("sp-card-grid");
            results.replaceChildren(article);
            document.title = item.title + " | SAMPIRA";
            status.textContent = "";
        } catch(error) { status.textContent=error.message; }
    } else {
        const filters = new URLSearchParams();
        for (const key of ["q", "category", "page"]) {
            if (params.get(key)?.trim()) { filters.set(key, params.get(key).trim()); }
        }
        filters.set("limit", "6");
        filter.elements.q.value = filters.get("q") || "";
        try { const data=await request("/articles?" + filters);
            options(filter.elements.category, data.categories, "Semua kategori");
            filter.elements.category.value = filters.get("category") || "";
            status.textContent = data.items.length ? "Halaman " + data.page : "Tidak ada artikel untuk pilihan ini.";
            results.replaceChildren(...data.items.map(item => card(item, data.categories)));
            const pageURL=page=>{
                const query = new URLSearchParams(filters);
                query.set('page',String(page));
                query.delete("limit");
                return publicURL(query);
            };
            for (const [link, page] of [[previous, data.page > 1 ? data.page - 1 : null], [next, data.next_page]]) {
                if(!page){ continue; }
                link.href=pageURL(page);link.removeAttribute('aria-disabled');link.removeAttribute('tabindex');
            }
            renderPageNumbers(reader,data,pageURL);
        } catch(error) { status.textContent=error.message; }
        filter.addEventListener("submit", event => {
            event.preventDefault();
            const query = new URLSearchParams();
            for (const [key, value] of new FormData(filter)) if (value.trim()) { query.set(key, value.trim()); }
            location.assign(publicURL(query));
        });
    }
}

const cms = document.querySelector("#education-cms");
if (cms) {
    const path = "/manage/articles";
    const filters = cms.querySelector("#education-filters");
    const rows = cms.querySelector("tbody");
    const status = cms.querySelector("[role=status], :scope>output");
    const dialog = cms.querySelector("dialog");
    const editor = dialog.querySelector("form");
    const feedback = dialog.querySelector("[role=status], output");
    const add = cms.querySelector("#education-add");
    const save = editor.querySelector("[type=submit]");
    const confirm = editor.querySelector("#education-confirmation");
    const actions = editor.querySelectorAll("[data-publication]");
    const fields = ["title", "slug", "category", "summary", "body", "sources"];
    let current = null;
    let page = 1;
    let revision = 0;
    let detailRevision = 0;
    const photoEditor=editor.querySelector('#education-photo-editor');
    let photoSupported=false,photosChanged=false,photoObjectURLs=[];
    const photoSlots=[];
    function clearPhotoURLs(){for(const url of photoObjectURLs){ URL.revokeObjectURL(url); }photoObjectURLs=[];}
    if(photoEditor){
        for(let i=0;i<1;i++){
            const slot=node('div','','education-photo-slot');
            const modes=node('div','','education-photo-modes');slot.append(modes);
            const values={};
            const labels={};
            for(const[name,label,type]of [['url','Tautan foto internet','url'],['file','Pilih foto','file']]){
                const input=node('input');input.type=type;input.name='photo_'+i+'_'+name;input.id='education-photo-'+i+'-'+name;input.disabled=true;
                if(type==='file'){ input.accept='image/jpeg,image/png,image/webp'; }else {input.maxLength=2048;input.placeholder='https://.../foto.jpg';}
                const caption=node('label',label);caption.htmlFor=input.id;slot.append(caption,input);values[name]=input;labels[name]=caption;
            }
            const image=node('img');image.alt='Pratinjau foto artikel';image.hidden=true;slot.append(image);
            const remove=node('button','Hapus foto','sp-button sp-button--quiet');remove.type='button';remove.disabled=true;slot.append(remove);
            const entry={...values,image,remove,keep:false,modeButtons:[],alt:'',credit:''};photoSlots.push(entry);
            entry.setMode=mode=>{for(const name of ['file','url']){entry[name].hidden=labels[name].hidden=name!==mode;}for(const b of entry.modeButtons){ b.setAttribute('aria-pressed',String(b.dataset.mode===mode)); }};
            for(const [mode,label]of [['file','Upload foto'],['url','Tautan internet']]){const b=node('button',label,'sp-button sp-button--quiet');b.type='button';b.dataset.mode=mode;b.disabled=true;b.addEventListener('click',()=>{entry.setMode(mode);const other=mode==='file'?entry.url:entry.file;if(other.value){other.value='';entry.keep=false;entry.alt=entry.credit='';image.hidden=true;photosChanged=true;}});entry.modeButtons.push(b);modes.append(b);}entry.setMode('file');
            const preview=()=>{photosChanged=true;image.hidden=true;const file=entry.file.files[0];
                if(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){photoEditor.querySelector('[data-photo-status]').textContent='Pilih JPG, PNG atau WEBP maksimal 5 MB.';return;}const url=URL.createObjectURL(file);photoObjectURLs.push(url);image.src=url;image.hidden=false;}
                else if(entry.url.value.trim().startsWith('https://')){image.src=entry.url.value.trim();image.hidden=false;}
            };
            entry.file.addEventListener('change',()=>{entry.keep=false;entry.alt=entry.credit='';entry.url.value='';preview();});entry.url.addEventListener('input',()=>{entry.keep=false;entry.alt=entry.credit='';entry.file.value='';preview();});
            remove.addEventListener('click',()=>{entry.keep=false;entry.alt=entry.credit='';for(const key of ['url','file']){ entry[key].value=''; }image.hidden=true;image.removeAttribute('src');photosChanged=true;});
            photoEditor.querySelector('[data-photo-fields]').append(slot);
        }
        try{await request('/manage/photos');photoSupported=true;setPhotoAccess();photoEditor.querySelector('[data-photo-status]').textContent='';}catch{photoEditor.querySelector('[data-photo-status]').textContent='Penyimpanan foto belum aktif di server ini. Teks artikel tetap dapat dikelola.';}
    }
    function setPhotoAccess(){for(const slot of photoSlots){ for(const field of [slot.url,slot.file,slot.remove,...slot.modeButtons]){ field.disabled=!photoSupported||Boolean(current&&current.status!=='draft'); } }}
    function renderPhotos(item){clearPhotoURLs();photosChanged=false;for(let i=0;i<photoSlots.length;i++){const slot=photoSlots[i],photo=item?.photos?.[i];slot.keep=Boolean(photo?.url.startsWith('/api/ecorecycle/education/media/'));slot.url.value=photo&&!slot.keep?photo.url:'';slot.file.value='';slot.alt=photo?.alt||'';slot.credit=photo?.credit||'';slot.image.hidden=!photo;slot.setMode(photo&&!slot.keep?'url':'file');if(photo){ slot.image.src=photo.url; }else { slot.image.removeAttribute('src'); }}setPhotoAccess();}
    async function preparePhotoSlot(data,slot,i){
        const file=slot.file.files[0],url=slot.url.value.trim();
        if(url){const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password){ throw new Error('Tautan foto harus HTTPS tanpa kredensial.'); }}
        const key='photo_'+i+'_';data.set(key+'url',url);data.set(key+'alt',slot.alt||('Foto artikel: '+editor.elements.title.value.trim()));data.set(key+'credit',slot.credit);data.set(key+'keep',String(slot.keep));
        if(!file){ return; }
        if(file.size>5*1024*1024){ throw new Error('Foto maksimal 5 MB.'); }
        const {prepareHandlingPhoto}=await import('./handling-photo.js');const optimized=await prepareHandlingPhoto(file);data.set(key+'file',optimized,optimized===file?file.name:'artikel.jpg');
    }
    async function preparePhotos(){
        if(!photoSupported){ throw new Error('Layanan foto belum aktif.'); }
        const data=new FormData();let primary=false;
        for(const [i,slot] of photoSlots.entries()){
            const active=Boolean(slot.file.files[0]||slot.url.value.trim()||slot.keep);
            if(i===0){ primary=active; }
            if(i===1&&active&&!primary){ throw new Error('Isi foto utama sebelum foto pendamping.'); }
        }
        await Promise.all(photoSlots.map((slot,i)=>preparePhotoSlot(data,slot,i)));
        if(primary&&current?.photos?.[1]){const old=current.photos[1],keep=old.url.startsWith('/api/ecorecycle/education/media/');data.set('photo_1_url',keep?'':old.url);data.set('photo_1_keep',String(keep));data.set('photo_1_alt',old.alt);data.set('photo_1_credit',old.credit||'');}
        return data;
    }

    async function load() {
        const run = ++revision;
        status.textContent = "Memuat artikel…";
        add.disabled = true;
        rows.replaceChildren();
        for (const button of cms.querySelectorAll("[data-education-page]")) { button.disabled = true; }
        const query = new URLSearchParams({ page, limit: "10" });
        for (const [key, value] of new FormData(filters)) if (value.trim()) { query.set(key, value.trim()); }
        try {
            const data = await request(path + "?" + query);
            if (run !== revision) { return; }
            options(filters.elements.category, data.categories, "Semua kategori");
            options(editor.elements.category, data.categories, "Pilih kategori");
            status.textContent = data.items.length ? "Halaman " + data.page : "Belum ada artikel untuk pilihan ini.";
            add.disabled = false;
            cms.querySelector('[data-education-page="-1"]').disabled = page <= 1;
            cms.querySelector('[data-education-page="1"]').disabled = !data.next_page;
            for (const item of data.items) {
                const row = node("tr");
                const action = node("button", "Buka", "sp-button sp-button--quiet");
                action.type = "button";
                action.setAttribute("aria-label", "Buka " + item.title);
                action.addEventListener("click", () => open(item.id));
                const cell = node("td");
                cell.append(action);
                row.append(node("th", item.title), node("td", data.categories.find(entry => entry.key === item.category)?.label || item.category),
                    node("td", statuses[item.status]), node("td", date.format(new Date(item.updated_at))), cell);
                row.firstChild.scope = "row";
                rows.append(row);
            }
        } catch (error) {
            if (run === revision) { status.textContent = error.message; }
        }
    }

    function render(item) {
        current = item;
        const editable = !item || item.status === "draft";
        editor.reset();
        renderPhotos(item);
        dialog.querySelector("h3").textContent = item ? "Artikel · " + statuses[item.status] : "Buat draf";
        for (const name of fields) {
            const field = editor.elements[name];
            field.disabled = !editable;
            field.value = name === "sources" ? (item?.sources || []).join("\n") : item?.[name] || "";
        }
        save.hidden = !editable;
        confirm.hidden = true;
        for (const action of actions) { action.hidden = !item || item.status === "archived" ||
            (action.dataset.publication === "published" && !editable); }
        feedback.textContent = "";
        renderEditorPreview();
    }

    async function open(id) {
        const run = ++detailRevision;
        try {
            const item = id ? await request(path + "/" + id) : null;
            if (run !== detailRevision) { return; }
            render(item);
            if (!dialog.open) { dialog.showModal(); }
        } catch (error) {
            if (run === detailRevision) { status.textContent = error.message; }
        }
    }

    async function saveArticlePhotos(item,photos){
        current=item;photos.set('version',String(item.version));
        try{return await request(path+'/'+item.id+'/photos',photos,'POST');}
        catch(error){error.message='Teks artikel tersimpan, tetapi foto belum tersimpan. '+error.message;throw error;}
    }
    async function mutate(url, method, data) {
        if (editor.getAttribute("aria-busy") === "true") { return; }
        editor.setAttribute("aria-busy", "true");
        feedback.textContent = "Menyimpan…";
        save.disabled = true;
        try {
            const photos=photosChanged&&data.body!==undefined?await preparePhotos():null;
            let item = await request(url, data, method);
            if(photos){ item=await saveArticlePhotos(item,photos); }
            render(item);
            feedback.textContent = "Tersimpan · " + statuses[item.status];
            await load();
        } catch (error) {
            if (error.status === 409 && current) {
                const fresh = await request(path + "/" + current.id).catch(() => null);
                if (fresh) { render(fresh); }
                feedback.textContent = fresh ? error.message + " Versi terbaru dimuat. Periksa kembali sebelum menyimpan." : error.message;
            } else { feedback.textContent = error.message; }
        } finally {
            save.disabled = false;
            editor.removeAttribute("aria-busy");
        }
    }

    filters.addEventListener("submit", event => { event.preventDefault(); page = 1; void load(); });
    cms.querySelector("#education-retry").addEventListener("click", load);
    add.addEventListener("click", () => open());
    for (const button of cms.querySelectorAll("[data-education-page]")) {
        button.addEventListener("click", () => { page += Number(button.dataset.educationPage); void load(); });
    }
    dialog.querySelector("#education-close").addEventListener("click", () => dialog.close());
    const preview = editor.querySelector('.sp-admin-article-preview');
    function renderEditorPreview() {
        if (!preview) { return; }
        for (const name of ['title', 'summary', 'body']) {
            preview.querySelector('[data-preview-' + name + ']').textContent = editor.elements[name].value.trim();
        }
    }
    editor.addEventListener('input', renderEditorPreview);
    editor.addEventListener("submit", event => {
        event.preventDefault();
        const data = {};
        for (const name of fields) { data[name] = editor.elements[name].value.trim(); }
        data.sources = data.sources.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
        if (current) { data.version = current.version; }
        void mutate(path + (current ? "/" + current.id : ""), current ? "PUT" : "POST", data);
    });
    for (const action of actions) { action.addEventListener("click", () => {
        if (editor.getAttribute("aria-busy") === "true") { return; }
        if(photosChanged){feedback.textContent='Simpan draf beserta foto sebelum mengubah publikasi.';return;}
        confirm.hidden = false;
        confirm.querySelector("p").textContent = action.dataset.publication === "published"
            ? "Artikel akan tersedia bagi publik. Gunakan versi draf yang telah disimpan."
            : "Artikel akan diarsipkan permanen dan hilang dari daftar publik.";
        const accept = confirm.querySelector("button");
        accept.onclick = () => {
            confirm.hidden = true;
            void mutate(path + "/" + current.id + "/publication", "POST", { version: current.version, status: action.dataset.publication });
        };
        accept.focus();
    }); }
    cms.addEventListener("sampira:open", load);
}
