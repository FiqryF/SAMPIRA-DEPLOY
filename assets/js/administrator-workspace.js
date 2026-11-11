/* Section navigation only; data and transactions stay with the existing modules. */
(() => {
    const nav=document.querySelector('.administrator-refresh .sp-system-nav');
    if(!nav)return;
    const toggle=document.getElementById('system-menu-toggle');
    const title=document.getElementById('system-page-title');
    const links=[...nav.querySelectorAll('a')];
    const panels=links.map(link=>document.getElementById(link.hash.slice(1)));
    nav.id='system-navigation';
    const paths=['M3 10 12 3l9 7v11h-6v-7H9v7H3Z','M4 20V10m8 10V4m8 16v-7','M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m16-13a4 4 0 0 1 0 8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z','M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4Zm9 0v2m0 3v2m0 3v2','M9 4h10v17H5V4h4V2h6v4H9Zm0 7h6m-6 5h6','M21 10c0 7-9 12-9 12S3 17 3 10a9 9 0 1 1 18 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z','M3 11V6l15-4v18L3 16v-5Zm0 0H1m5 6 2 5h4l-2-4','M3 5h18v14H3Zm0 4h18m-5 6h2'];
    links.forEach((link,index)=>{
        const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
        icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
        const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d',paths[index]);icon.append(path);link.prepend(icon);
        link.setAttribute('aria-controls',panels[index].id);
    });
    function close(){document.body.classList.remove('system-menu-open');toggle.setAttribute('aria-expanded','false');}
    function show(){
        let hash=location.hash;
        if(hash==='#reward-payments-title')hash='#system-payments';
        const index=Math.max(0,links.findIndex(link=>link.hash===hash));
        panels.forEach((panel,i)=>{panel.hidden=i!==index;});
        links.forEach((link,i)=>{if(i===index)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
        title.textContent=links[index].textContent.trim();
        close();panels[index].dispatchEvent(new Event('sampira:open'));
        window.scrollTo({top:0,behavior:'instant'});
    }
    toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';document.body.classList.toggle('system-menu-open',open);toggle.setAttribute('aria-expanded',String(open));});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('system-menu-open')){close();toggle.focus();}});
    document.addEventListener('click',event=>{if(document.body.classList.contains('system-menu-open')&&!event.target.closest('.sp-system-sidebar,#system-menu-toggle'))close();});
    window.addEventListener('hashchange',show);show();
})();
