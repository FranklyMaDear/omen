const API = 'https://franklymadear-omenread.hf.space';
const BOT = 'omenread_bot';
const ADS_BLOCK = '32708';
const COST = 15;

let tg = null, uid = null, lang = localStorage.getItem('omen_lang') || 'el';
let images = [];   // έως 3
let adReady = false, userReady = false;
let AdController = null;

// ====== ADSGRAM ======
function initAds() {
    if (typeof window.Adsgram !== 'undefined') {
        AdController = window.Adsgram.init({ blockId: ADS_BLOCK });
        adReady = true;
    } else setTimeout(initAds, 1000);
}

// ====== ΓΛΩΣΣΑ (ΜΟΝΟ ΑΠΟ CONSENT) ======
function setLang(l) { lang = l; localStorage.setItem('omen_lang', l); }
async function applyTranslation() {
    if (lang === 'el') { restoreOriginals(); return; }
    const els = document.querySelectorAll('[data-translate="true"]');
    for (const el of els) {
        const orig = el.getAttribute('data-original') || el.textContent.trim();
        if (!el.getAttribute('data-original')) el.setAttribute('data-original', orig);
        if (orig.length > 0 && orig.length < 1500) {
            try {
                const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(orig)}`);
                const d = await res.json();
                if (d?.[0]) { let t = ''; for (const p of d[0]) if (p[0]) t += p[0]; el.textContent = t; }
            } catch (e) {}
        }
    }
    // μετάφραση αποτελέσματος
    const rt = document.getElementById('result-text');
    if (rt && rt.textContent.trim()) {
        try {
            const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(rt.textContent.trim())}`);
            const d = await res.json();
            if (d?.[0]) { let t = ''; for (const p of d[0]) if (p[0]) t += p[0]; rt.textContent = t; }
        } catch (e) {}
    }
}
function restoreOriginals() {
    document.querySelectorAll('[data-translate="true"]').forEach(el => {
        const orig = el.getAttribute('data-original');
        if (orig) el.textContent = orig;
    });
}
(function() {
    document.querySelectorAll('[data-translate="true"]').forEach(el => el.setAttribute('data-original', el.textContent.trim()));
    const devLang = (navigator.language || 'el').split('-')[0];
    const supported = ['el','en','de','fr','es','it','ar','zh','ja','ru','tr','nl','pt','sv','no','da','fi','pl','cs','ro','bg','uk','ko','hi','vi','th','id','iw'];
    if (!localStorage.getItem('omen_lang') && supported.includes(devLang)) {
        lang = devLang; localStorage.setItem('omen_lang', lang);
    }
    document.getElementById('consent-lang-select').value = lang;
})();

// ====== ΠΟΝΤΟΙ ======
function getP() { return parseInt(localStorage.getItem('omen_points') || '0'); }
function setP(v) { localStorage.setItem('omen_points', v); document.getElementById('points-display').textContent = v; }

// ====== SLOTS (1-3 φωτο) ======
function setupSlots() {
    const c = document.getElementById('photo-slots');
    c.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const slot = document.createElement('div');
        slot.className = 'photo-slot';
        slot.innerHTML = `📸 ${i+1}/3`;
        slot.onclick = () => {
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = 'image/*';
            inp.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        let w = img.width, h = img.height;
                        if (w > 800) { h = h * (800/w); w = 800; }
                        canvas.width = w; canvas.height = h;
                        ctx.drawImage(img, 0, 0, w, h);
                        images[i] = canvas.toDataURL('image/jpeg', 0.7);
                        slot.style.backgroundImage = `url(${images[i]})`;
                        slot.innerHTML = '';
                        document.getElementById('analyze-btn').disabled = (images.filter(x=>x).length === 0);
                    };
                    img.src = ev.target.result;
                };
                reader.readAsDataURL(file);
            };
            inp.click();
        };
        c.appendChild(slot);
    }
}

// ====== ΑΝΑΛΥΣΗ ======
async function performAnalysis() {
    const valid = images.filter(x => x);
    if (!uid || valid.length === 0) { alert('Ανεβάστε τουλάχιστον 1 φωτογραφία'); return; }
    if (getP() < COST) { alert('Δεν έχετε αρκετούς πόντους'); return; }
    const btn = document.getElementById('analyze-btn');
    btn.disabled = true; btn.textContent = '⏳ Η Ζαΐρα διαβάζει...';
    try {
        const res = await fetch(`${API}/api/analyze-multi`, {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ user_id: uid, images: valid, gender: 'f' })
        });
        const data = await res.json();
        if (data.success) {
            setP(getP() - COST);
            document.getElementById('result-text').textContent = data.symbols;
            document.getElementById('result-area').style.display = 'block';
            if (lang !== 'el') await applyTranslation();
            images = []; setupSlots();
        } else alert(data.error || 'Σφάλμα');
    } catch (e) { alert('Σφάλμα δικτύου'); }
    finally { btn.disabled = false; btn.textContent = '🔮 Ανάλυση (15 πόντοι)'; }
}

// ====== EARN / REFERRAL / SHOP ======
async function earnPoints() {
    if (!adReady) { alert('Οι διαφημίσεις δεν είναι έτοιμες'); return; }
    try { await AdController.show(); setP(getP() + 10); } catch (e) { alert('Η διαφήμιση δεν ολοκληρώθηκε'); }
}
async function shareReferral() {
    if (!adReady || !uid) { alert('Περιμένετε...'); return; }
    try {
        await AdController.show();
        const link = `https://t.me/${BOT}?start=ref_${uid}`;
        const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('☕ Omen Καφεμαντεία!')}`;
        if (tg) tg.openTelegramLink(url); else window.open(url, '_blank');
    } catch (e) { alert('Πρέπει να δείτε τη διαφήμιση'); }
}
async function buyPackage(pkg) {
    if (!uid) return;
    await fetch(`${API}/api/shop/buy`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: uid, package: pkg })
    });
    alert('Ελέγξτε το chat σας στο bot!');
}

// ====== NAVIGATION / UI ======
function goToScan() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('scan').classList.add('active');
    document.getElementById('lifeline-rollup').classList.remove('visible');
}
function goToSplash() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('splash').classList.add('active');
}
function resetScan() {
    images = []; setupSlots();
    document.getElementById('result-area').style.display = 'none';
    document.getElementById('analyze-btn').disabled = true;
}
function acceptConsent() {
    document.getElementById('consent-overlay').classList.add('hidden');
    localStorage.setItem('omen_consent', 'true');
    // start lifeline
    setTimeout(() => {
        if (document.getElementById('splash').classList.contains('active')) {
            document.getElementById('lifeline-rollup').classList.add('visible');
            setTimeout(() => document.getElementById('lifeline-rollup').classList.remove('visible'), 5000);
        }
    }, 5000);
}
function showLegal(type) {
    document.getElementById(type + '-overlay').classList.add('active');
}
function closeLegal(type) {
    document.getElementById(type + '-overlay').classList.remove('active');
}

// ====== BACKGROUND STARS ======
(function() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let stars = [];
    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    window.addEventListener('resize', resize); resize();
    for (let i = 0; i < 150; i++) stars.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, r: Math.random()*1.5+0.5, dx: (Math.random()-0.5)*0.4, dy: (Math.random()-0.5)*0.4, alpha: Math.random()*0.8+0.2 });
    function draw() {
        ctx.clearRect(0,0,canvas.width,canvas.height);
        stars.forEach(s => {
            s.x += s.dx; s.y += s.dy;
            if (s.x<0||s.x>canvas.width) s.dx*=-1;
            if (s.y<0||s.y>canvas.height) s.dy*=-1;
            ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
            ctx.fillStyle = `rgba(255,215,150,${s.alpha*0.7})`; ctx.fill();
        });
        requestAnimationFrame(draw);
    }
    draw();
})();

// ====== INIT ======
async function init() {
    setupSlots();
    initAds();

    if (window.Telegram?.WebApp) {
        tg = window.Telegram.WebApp; tg.ready(); tg.expand();
        uid = tg.initDataUnsafe?.user?.id || parseInt(localStorage.getItem('tid') || Date.now());
    } else {
        uid = parseInt(localStorage.getItem('tid') || Date.now());
    }
    localStorage.setItem('tid', uid);

    try {
        const res = await fetch(`${API}/api/register`, {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ user_id: uid, start_param: tg?.initDataUnsafe?.start_param || '', first_name: tg?.initDataUnsafe?.user?.first_name || '' })
        });
        const data = await res.json();
        setP(data.points);
    } catch (e) {}

    userReady = true;

    // Consent εμφανίζεται ΠΑΝΤΑ
    document.getElementById('consent-overlay').classList.remove('hidden');

    // Αυτόματη μετάφραση αν χρειάζεται
    if (lang !== 'el') await applyTranslation();
}

document.addEventListener('DOMContentLoaded', init);
