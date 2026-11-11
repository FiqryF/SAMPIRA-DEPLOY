const base = "/api/ecorecycle/education";
const publicPage = "/assets/education.html";
const statuses = { draft: "Draf", published: "Terbit", archived: "Arsip" };
const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });

function node(tag, content, className) {
    const element = document.createElement(tag);
    if (content) element.textContent = content;
    if (className) element.className = className;
    return element;
}

async function request(path, method = "GET", body) {
    const response = await fetch(base + path, {
        credentials: "same-origin", method,
        ...(body && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.data) {
        const message = response.status === 401 ? "Sesi berakhir. Masuk kembali."
            : response.status === 403 ? "Akun ini tidak memiliki akses."
            : response.status === 404 ? "Artikel atau layanan edukasi belum tersedia."
            : result?.message || "Layanan edukasi gagal dimuat. Coba lagi.";
        throw Object.assign(new Error(message), { status: response.status });
    }
    return result.data;
}

function articleLink(item) {
    return publicPage + "?" + new URLSearchParams({ artikel: item.slug });
}

function options(select, categories, label) {
    const previous = select.value;
    select.replaceChildren(new Option(label, ""), ...categories.map(item => new Option(item.label, item.key)));
    if (categories.some(item => item.key === previous)) select.value = previous;
}

function card(item, categories) {
    const article = node("article", "", "sp-article-card");
    const category = categories.find(entry => entry.key === item.category)?.label || item.category;
    const label = node("span", category, "sp-kicker");
    const heading = node("h3");
    const link = node("a", item.title);
    link.href = articleLink(item);
    heading.append(link);
    article.append(label, heading, node("p", item.summary));
    if (item.published_at) article.append(node("time", date.format(new Date(item.published_at))));
    return article;
}

for (const preview of document.querySelectorAll("[data-education-preview]")) {
    request("/articles?limit=3").then(data => {
        preview.replaceChildren(...(data.items.length
            ? data.items.slice(0, 3).map(item => card(item, data.categories))
            : [node("p", preview.dataset.emptyText || "Belum ada artikel terbit.")]));
    }).catch(error => { preview.textContent = error.message; });
}

const portalEducation = document.querySelector("[data-portal-education]");
if (portalEducation) {
    const categoryIcons = {"pemilahan-sampah":"fa-boxes-stacked", "pengurangan-sampah":"fa-leaf",
        "daur-ulang":"fa-recycle", pengomposan:"fa-seedling", "bank-sampah":"fa-box",
        "sampah-elektronik":"fa-plug", "panduan-sampira":"fa-book-open"};
    const categoryArtwork = {pengomposan:"waste-organic.svg", "sampah-elektronik":"waste-electronics.svg"};
    const form = portalEducation.querySelector("form");
    const message = portalEducation.querySelector("[role=status]");
    const list = portalEducation.querySelector(".sp-portal-articles");
    const feature = portalEducation.querySelector(".sp-education-feature");
    const categoryGrid = portalEducation.querySelector(".sp-education-category-grid");
    const pageLabel = portalEducation.querySelector(".sp-education-page");
    const prev = portalEducation.querySelector("[data-prev]");
    const next = portalEducation.querySelector("[data-next]");
    let page = 1;
    let sequence = 0;
    let filters = {};

    function artwork(item) {
        const image = node("img");
        image.src = "/assets/img/" + (categoryArtwork[item.category] || "waste-inorganic.svg");
        image.alt = "";
        return image;
    }

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

    function renderFeature(item) {
        feature.hidden = !item;
        if (!item) return;
        const copy = node("div", "", "sp-education-feature-copy");
        const link = node("a", "Baca Selengkapnya →", "sp-button sp-button--quiet");
        link.href = articleLink(item);
        copy.append(node("span", "Artikel Terbaru", "sp-education-feature-label"),
            node("h3", item.title), node("p", item.summary), link);
        feature.replaceChildren(copy, artwork(item));
    }

    async function load() {
        const run = ++sequence;
        prev.disabled = next.disabled = true;
        list.replaceChildren();
        message.textContent = "Memuat artikel…";
        const query = new URLSearchParams({...filters, page: String(page), limit: "6"});
        try {
            const data = await request("/articles?" + query);
            if (run !== sequence) return;
            renderCategories(data.categories);
            if (page === 1 && !filters.q && !filters.category) renderFeature(data.items[0]);
            list.replaceChildren(...data.items.map(item => {
                const article = card(item, data.categories);
                const cover = artwork(item);
                cover.className = "sp-education-cover";
                cover.loading = "lazy";
                article.prepend(cover);
                return article;
            }));
            const start = (page - 1) * 6 + 1;
            message.textContent = data.items.length ? `Menampilkan ${start}–${start + data.items.length - 1} artikel` : "Tidak ada artikel untuk pilihan ini.";
            pageLabel.textContent = page;
            prev.disabled = page <= 1;
            next.disabled = data.next_page === null;
        } catch (error) {
            if (run === sequence) message.textContent = error.message;
        }
    }

    form.addEventListener("submit", event => {
        event.preventDefault();
        const query = form.elements.q.value.trim();
        if (query) filters.q = query;
        else delete filters.q;
        page = 1;
        load();
    });
    categoryGrid.addEventListener("click", event => {
        const button = event.target.closest("button[data-category]");
        if (!button) return;
        if (button.dataset.category) filters.category = button.dataset.category;
        else delete filters.category;
        page = 1;
        load();
    });
    prev.addEventListener("click", () => { page--; load(); });
    next.addEventListener("click", () => { page++; load(); });
    window.addEventListener("sampira:user-view", event => {
        if (event.detail === "edukasi") load();
    });
}

const reader = document.querySelector("#education-reader");
if (reader) {
    const filter = reader.querySelector("form");
    const status = reader.querySelector("[role=status]");
    const results = reader.querySelector("#education-results");
    const next = reader.querySelector("#education-next");
    const previous = reader.querySelector("#education-prev");
    const params = new URLSearchParams(location.search);
    const slug = params.get("artikel");

    if (slug) {
        filter.hidden = true;
        request("/articles/" + encodeURIComponent(slug)).then(item => {
            const article = node("article", "", "sp-reader-article");
            article.append(node("h1", item.title), node("p", item.summary, "sp-deck"));
            if (item.published_at) article.append(node("time", date.format(new Date(item.published_at))));
            article.append(node("div", item.body, "sp-article-body"));
            const sources = node("ul");
            for (const value of item.sources || []) {
                let url;
                try { url = new URL(value); } catch { continue; }
                if (url.protocol !== "https:" || url.username || url.password) continue;
                const source = node("li");
                const link = node("a", url.hostname + url.pathname);
                link.href = url.href;
                link.rel = "noopener noreferrer";
                source.append(link);
                sources.append(source);
            }
            if (sources.childElementCount) article.append(node("h2", "Sumber"), sources);
            results.classList.remove("sp-card-grid");
            results.replaceChildren(article);
            document.title = item.title + " | SAMPIRA";
            status.textContent = "";
        }).catch(error => { status.textContent = error.message; });
    } else {
        const filters = new URLSearchParams();
        for (const key of ["q", "category", "page"]) {
            if (params.get(key)?.trim()) filters.set(key, params.get(key).trim());
        }
        filters.set("limit", "6");
        filter.elements.q.value = filters.get("q") || "";
        request("/articles?" + filters).then(data => {
            options(filter.elements.category, data.categories, "Semua kategori");
            filter.elements.category.value = filters.get("category") || "";
            status.textContent = data.items.length ? "Halaman " + data.page : "Tidak ada artikel untuk pilihan ini.";
            results.replaceChildren(...data.items.map(item => card(item, data.categories)));
            for (const [link, page] of [[previous, data.page > 1 ? data.page - 1 : null], [next, data.next_page]]) {
                if (!page) continue;
                filters.set("page", String(page));
                const query = new URLSearchParams(filters);
                query.delete("limit");
                link.href = publicPage + "?" + query;
                link.hidden = false;
            }
        }).catch(error => {
            status.textContent = error.message;
            request("/articles?limit=1").then(data => options(filter.elements.category, data.categories, "Semua kategori")).catch(() => {});
        });
        filter.addEventListener("submit", event => {
            event.preventDefault();
            const query = new URLSearchParams();
            for (const [key, value] of new FormData(filter)) if (value.trim()) query.set(key, value.trim());
            location.assign(publicPage + (query.size ? "?" + query : ""));
        });
    }
}

const cms = document.querySelector("#education-cms");
if (cms) {
    const path = "/manage/articles";
    const filters = cms.querySelector("#education-filters");
    const rows = cms.querySelector("tbody");
    const status = cms.querySelector("[role=status]");
    const dialog = cms.querySelector("dialog");
    const editor = dialog.querySelector("form");
    const feedback = dialog.querySelector("[role=status]");
    const add = cms.querySelector("#education-add");
    const save = editor.querySelector("[type=submit]");
    const confirm = editor.querySelector("#education-confirmation");
    const actions = editor.querySelectorAll("[data-publication]");
    const fields = ["title", "slug", "category", "summary", "body", "sources"];
    let current = null;
    let page = 1;
    let revision = 0;
    let detailRevision = 0;

    async function load() {
        const run = ++revision;
        status.textContent = "Memuat artikel…";
        add.disabled = true;
        rows.replaceChildren();
        for (const button of cms.querySelectorAll("[data-education-page]")) button.disabled = true;
        const query = new URLSearchParams({ page, limit: "10" });
        for (const [key, value] of new FormData(filters)) if (value.trim()) query.set(key, value.trim());
        try {
            const data = await request(path + "?" + query);
            if (run !== revision) return;
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
            if (run === revision) status.textContent = error.message;
        }
    }

    function render(item) {
        current = item;
        const editable = !item || item.status === "draft";
        editor.reset();
        dialog.querySelector("h3").textContent = item ? "Artikel · " + statuses[item.status] : "Buat draf";
        for (const name of fields) {
            const field = editor.elements[name];
            field.disabled = !editable;
            field.value = name === "sources" ? (item?.sources || []).join("\n") : item?.[name] || "";
        }
        save.hidden = !editable;
        confirm.hidden = true;
        for (const action of actions) action.hidden = !item || item.status === "archived" ||
            (action.dataset.publication === "published" && !editable);
        feedback.textContent = "";
        renderEditorPreview();
    }

    async function open(id) {
        const run = ++detailRevision;
        try {
            const item = id ? await request(path + "/" + id) : null;
            if (run !== detailRevision) return;
            render(item);
            if (!dialog.open) dialog.showModal();
        } catch (error) {
            if (run === detailRevision) status.textContent = error.message;
        }
    }

    async function mutate(url, method, data) {
        if (editor.getAttribute("aria-busy") === "true") return;
        editor.setAttribute("aria-busy", "true");
        feedback.textContent = "Menyimpan…";
        save.disabled = true;
        try {
            const item = await request(url, method, data);
            render(item);
            feedback.textContent = "Tersimpan · " + statuses[item.status];
            await load();
        } catch (error) {
            if (error.status === 409 && current) {
                const fresh = await request(path + "/" + current.id).catch(() => null);
                if (fresh) render(fresh);
                feedback.textContent = fresh ? error.message + " Versi terbaru dimuat. Periksa kembali sebelum menyimpan." : error.message;
            } else feedback.textContent = error.message;
        } finally {
            save.disabled = false;
            editor.removeAttribute("aria-busy");
        }
    }

    filters.addEventListener("submit", event => { event.preventDefault(); page = 1; load(); });
    cms.querySelector("#education-retry").addEventListener("click", load);
    add.addEventListener("click", () => open());
    for (const button of cms.querySelectorAll("[data-education-page]")) {
        button.addEventListener("click", () => { page += Number(button.dataset.educationPage); load(); });
    }
    dialog.querySelector("#education-close").addEventListener("click", () => dialog.close());
    const preview = editor.querySelector('.sp-admin-article-preview');
    function renderEditorPreview() {
        if (!preview) return;
        for (const name of ['title', 'summary', 'body']) {
            preview.querySelector('[data-preview-' + name + ']').textContent = editor.elements[name].value.trim();
        }
    }
    editor.addEventListener('input', renderEditorPreview);
    editor.addEventListener("submit", event => {
        event.preventDefault();
        const data = {};
        for (const name of fields) data[name] = editor.elements[name].value.trim();
        data.sources = data.sources.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
        if (current) data.version = current.version;
        mutate(path + (current ? "/" + current.id : ""), current ? "PUT" : "POST", data);
    });
    for (const action of actions) action.addEventListener("click", () => {
        if (editor.getAttribute("aria-busy") === "true") return;
        confirm.hidden = false;
        confirm.querySelector("p").textContent = action.dataset.publication === "published"
            ? "Artikel akan tersedia bagi publik. Gunakan versi draf yang telah disimpan."
            : "Artikel akan diarsipkan permanen dan hilang dari daftar publik.";
        const accept = confirm.querySelector("button");
        accept.onclick = () => {
            confirm.hidden = true;
            mutate(path + "/" + current.id + "/publication", "POST", { version: current.version, status: action.dataset.publication });
        };
        accept.focus();
    });
    cms.addEventListener("sampira:open", load);
}
