// Presentation only: existing form elements, API handlers and navigation stay intact.
if (document.body.classList.contains('user-reference')) {
    const icons = {
        'fa-home':'House','fa-truck':'Truck','fa-triangle-exclamation':'TriangleAlert',
        'fa-history':'History','fa-ticket':'Tickets','fa-gift':'Gift','fa-book-open':'BookOpen',
        'fa-gear':'Settings','fa-bell':'Bell','fa-leaf':'Leaf','fa-sign-out-alt':'LogOut',
        'fa-angle-right':'ChevronRight','fa-chevron-right':'ChevronRight','fa-chevron-left':'ChevronLeft',
        'fa-chevron-down':'ChevronDown','fa-arrow-right':'ArrowRight','fa-arrow-left':'ArrowLeft',
        'fa-bars':'Menu','fa-circle-check':'CircleCheck','fa-calendar-check':'CalendarCheck',
        'fa-calendar':'Calendar','fa-coins':'Coins','fa-wallet':'Wallet','fa-recycle':'Recycle',
        'fa-trash-can':'Trash2','fa-trash':'Trash2','fa-clipboard':'ClipboardList',
        'fa-weight-hanging':'Weight','fa-location-dot':'MapPin','fa-map-pin':'MapPin',
        'fa-image':'Image','fa-cloud-arrow-up':'CloudUpload','fa-times':'X','fa-save':'Save',
        'fa-address-card':'Contact','fa-phone':'Phone','fa-user':'User','fa-envelope':'Mail',
        'fa-bullhorn':'Megaphone','fa-layer-group':'Layers','fa-ellipsis':'Ellipsis',
        'fa-search':'Search','fa-box':'Package','fa-seedling':'Sprout','fa-laptop':'Laptop',
        'fa-mobile-screen-button':'Smartphone','fa-battery-full':'BatteryFull',
        'fa-desktop':'Monitor','fa-plug':'Plug','fa-barcode':'ScanLine','fa-clock':'Clock',
        'fa-bottle-water':'Milk','fa-wine-bottle':'Milk','fa-car-battery':'BatteryCharging',
        'fa-gears':'Settings','fa-tv':'Tv','fa-boxes-stacked':'Boxes','fa-house':'House',
        'fa-ban':'Ban','fa-clipboard-list':'ClipboardList','fa-clipboard-check':'ClipboardCheck',
        'fa-clock-rotate-left':'History','fa-tag':'Tag','fa-spinner':'LoaderCircle',
        'fa-truck-fast':'Truck','fa-truck-pickup':'Truck'
    };
    function lineIcons(root) {
        if (!window.lucide) { return; } // Existing Font Awesome remains the fallback.
        for (const icon of root.querySelectorAll('i[class*="fa-"]:not([data-ref-icon])')) {
            const key = Object.keys(icons).find(name => icon.classList.contains(name));
            const definition = window.lucide.icons[icons[key]];
            if (!definition) { continue; }
            const svg = window.lucide.createElement(definition, {width:18,height:18,'stroke-width':1.8,'aria-hidden':'true'});
            icon.replaceChildren(svg);
            icon.classList.add('ref-line-icon');
            icon.dataset.refIcon = key;
        }
    }
    function reportLayout() {
        const form = document.getElementById('facility-form');
        if (!form || form.dataset.referenceLayout) { return; }
        form.dataset.referenceLayout = 'ready';
        const panels = [...form.querySelectorAll('.sp-pickup-panel')];
        if (panels.length !== 3) { return; }
        const [map, data, address] = panels;
        const categories = data.querySelector('.sp-report-categories');
        const title = data.querySelector('h4');
        if (categories && title) { title.after(categories); }
        const photo = address.querySelector('.sp-pickup-photo');
        if (photo) {
            const columns = document.createElement('div'); columns.className = 'ref-form-columns';
            const copy = document.createElement('div'), upload = document.createElement('div');
            copy.append(...data.querySelectorAll(':scope>.facility-field')); upload.append(photo);
            columns.append(copy,upload); data.append(columns);
        }
        const fields = form.querySelector('.sp-report-fields');
        // Keep all required controls in the existing enabled/disabled fieldset.
        const holder = map.parentElement;
        map.before(data);
        holder.insertBefore(map, data.nextSibling);
        if (fields && !fields.children.length) { fields.remove(); }
        data.id = 'report-data'; map.id = 'report-map'; address.id = 'report-address';
        const heading = document.getElementById('facility-form-heading');
        if (heading) {
            const hero = document.createElement('header'); hero.className = 'ref-form-hero';
            const copy = document.createElement('div');
            const label = document.createElement('span'); label.className = 'ref-hero-label'; label.textContent = 'Layanan Laporan Warga';
            const description = document.createElement('p'); description.textContent = 'Laporkan kondisi fasilitas persampahan dengan lokasi dan informasi yang jelas.';
            heading.before(hero); copy.append(label, heading, description); hero.append(copy);
        }
        const nav = document.createElement('nav'); nav.className = 'ref-form-navigation'; nav.setAttribute('aria-label','Bagian formulir laporan');
        for (const [index, [id, text]] of [['report-data','Kategori & Detail'],['report-map','Lokasi Fasilitas'],['report-address','Alamat & Konfirmasi']].entries()) {
            const link = document.createElement('a'); link.href = '#' + id;
            const number = document.createElement('span'); number.textContent = String(index + 1);
            link.append(number, document.createTextNode(text)); nav.append(link);
        }
        form.before(nav);
    }
    function decorateStat(stat){
            stat.dataset.referenceStat = 'ready';
            const icon = document.createElement('i'); icon.className = 'fas fa-coins'; icon.setAttribute('aria-hidden','true');
            const label = stat.querySelector('span')?.textContent || '';
            if (/level/i.test(label)) { icon.className = 'fas fa-leaf'; }
            else if (/berat/i.test(label)) { icon.className = 'fas fa-weight-hanging'; }
            else if (/reward|dibayar/i.test(label)) { icon.className = 'fas fa-wallet'; }
            stat.append(icon);
            }
    function contributionLayout() {
        const points = document.querySelector('[data-p9-user]');
        const nav = points?.querySelector('.p9-tabs');
        if (nav && !nav.closest('.ref-tabs-panel')) {
            const panel = document.createElement('div'); panel.className = 'ref-tabs-panel';
            nav.before(panel); panel.append(nav, ...points.querySelectorAll('[data-points-panel]'));
        }
        const wallet = points?.querySelector('[data-wallet]');
        const badges = wallet?.querySelector('.p9-badges');
        if (badges && !badges.closest('details')) {
            const details = document.createElement('details'); details.className = 'ref-achievements';
            const summary = document.createElement('summary'); summary.textContent = 'Pencapaian & aturan poin';
            const heading = badges.previousElementSibling;
            const rule = badges.nextElementSibling;
            heading.before(details); details.append(summary, heading, badges);
            if (rule) { details.append(rule); }
        }
        document.querySelectorAll('.p9-stat:not([data-reference-stat])').forEach(decorateStat);
        const reward = document.querySelector('[data-p9-rewards]');
        const summaryHeading = reward?.querySelector('[data-reward-summary]>.p9-heading');
        if (summaryHeading && !summaryHeading.dataset.referenceCompact) {
            summaryHeading.dataset.referenceCompact = 'ready';
            const refresh = summaryHeading.querySelector('[data-analytics-retry]');
            if (refresh) { reward.querySelector(':scope>.p9-heading')?.append(refresh); }
            summaryHeading.hidden = true;
        }
        const filter = reward?.querySelector('[data-reward-filter]')?.closest('label');
        if (filter && !filter.closest('.ref-reward-history')) {
            const panel = document.createElement('section'); panel.className = 'ref-reward-history';
            const title = document.createElement('h3'); title.textContent = 'Riwayat Penjemputan & Status Pembayaran';
            filter.before(panel); panel.append(title, filter, reward.querySelector('[data-reward-list]'));
        }
    }
    function decorate() {
        reportLayout(); contributionLayout(); lineIcons(document);
        for (const nav of document.querySelectorAll('.ref-form-navigation')) {
            if (!nav.querySelector('[aria-current]')) { nav.querySelector('a')?.setAttribute('aria-current','step'); }
        }
    }
    document.addEventListener('click', event => {
        const link = event.target.closest('.ref-form-navigation a');
        if (!link) { return; }
        for (const item of link.parentElement.children) { item.removeAttribute('aria-current'); }
        link.setAttribute('aria-current','step');
    });
    function appendSupportingPhoto(content,photos,figure){if(photos[1]){ content.append(figure(photos[1],true)); }}
    let articleRequest;
    document.addEventListener('click', async event => {
        const link = event.target.closest('#edukasi a[href*="?artikel="]');
        if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.button > 0) { return; }
        const slug = new URL(link.href).searchParams.get('artikel');
        if (!slug) { return; }
        event.preventDefault();
        document.querySelector('[data-reference-reader]')?.close();
        const controller = new AbortController(); articleRequest = controller;
        const dialog = document.createElement('dialog'); dialog.className = 'p9-dialog ref-article-dialog'; dialog.dataset.referenceReader = '';
        const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Kembali ke Edukasi';
        const content = document.createElement('article'); content.className = 'sp-reader-article';
        const state = document.createElement('p'); state.setAttribute('role','status'); state.textContent = 'Memuat artikel…';
        dialog.setAttribute('aria-label','Detail artikel edukasi'); dialog.append(close, state, content); document.body.append(dialog);
        close.addEventListener('click',()=>dialog.close());
        dialog.addEventListener('close',()=>{controller.abort();dialog.remove();if(link.isConnected){ link.focus(); }},{once:true});
        dialog.showModal();
        try {
            const response = await fetch('/api/ecorecycle/education/articles/'+encodeURIComponent(slug), {credentials:'same-origin',signal:controller.signal});
            if (!response.ok) { throw new Error('Artikel belum dapat dimuat. Tutup lalu coba kembali.'); }
            const {data} = await response.json();
            if (controller.signal.aborted) { return; }
            const title = document.createElement('h2'); title.textContent = data.title;
            const summary = document.createElement('p'); summary.textContent = data.summary;

            const {educationArticleBody,educationPhotos,educationPhotoFigure}=await import('./education-photos.js?v=maps-reader-9');
            if(controller.signal.aborted){ return; }
            const photos=educationPhotos(data);const body=educationArticleBody(data.body);
            content.append(title,summary,educationPhotoFigure(photos[0],true),body);appendSupportingPhoto(content,photos,educationPhotoFigure);
            if (data.published_at) {
                const date = document.createElement('time');date.dateTime = data.published_at;
                date.textContent = new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeZone:'Asia/Jakarta'}).format(new Date(data.published_at));title.after(date);
            }
            const sources = document.createElement('ul');
            for (const raw of data.sources || []) {
                let url;try {url = new URL(raw);} catch {continue;}
                if (url.protocol !== 'https:' || url.username || url.password) { continue; }
                const item = document.createElement('li'), source = document.createElement('a');
                source.textContent = url.hostname+url.pathname;source.href = url.href;source.target = '_blank';source.rel = 'noopener noreferrer';
                item.append(source);sources.append(item);
            }
            if (sources.children.length) {const heading = document.createElement('h3');heading.textContent = 'Sumber';content.append(heading,sources);}
            state.textContent = '';
        } catch (error) {if (!controller.signal.aborted) { state.textContent = error.message; }}
    });
    let queued = false;
    const observer = new MutationObserver(() => {
        if (queued) { return; }
        queued = true;
        requestAnimationFrame(() => { queued = false; decorate(); });
    });
    observer.observe(document.body, {childList:true,subtree:true});
    decorate();
    window.addEventListener('sampira:session-ended', () => {
        observer.disconnect(); articleRequest?.abort();document.querySelector('[data-reference-reader]')?.close();
    }, {once:true});
}
