const tabs = document.querySelectorAll(".sidebar-item.hub-tab");
function syncNavigation() {
    for (const control of document.querySelectorAll(".sp-user-mobile [data-sp-user-tab]")) {
        const current = Array.from(tabs).some(tab => tab.dataset.target === control.dataset.spUserTab && tab.classList.contains("active"));
        if (current) control.setAttribute("aria-current", "page");
        else control.removeAttribute("aria-current");
    }
}
document.addEventListener("click", event => {
    const control = event.target.closest("[data-sp-user-tab]");
    if (!control) return;
    Array.from(tabs).find(tab => tab.dataset.target === control.dataset.spUserTab)?.click();
    if (control.dataset.reportView) window.dispatchEvent(new CustomEvent("sampira:user-report-view", {
        detail: {view: control.dataset.reportView}
    }));
});
window.addEventListener("sampira:user-view", syncNavigation);
syncNavigation();
