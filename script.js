const API = 'https://franklymadear-omenread.hf.space';
const BOT = 'omenread_bot';
const ADS_BLOCK = '32708';
const COST = 15;

let tg = null, uid = null, lang = localStorage.getItem('omen_lang') || 'el';
let currentImage = null;
let adReady = false;
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
    // Δεν μεταφράζουμε το αποτέλεσμα της ανάλυσης (το κάνει ήδη το backend)
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

// ====== UPLOAD ======
function triggerUpload() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
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
                currentImage = canvas.toDataURL('image/jpeg', 0.7);
                // Ενημέρωση του photo slot
                const slot = document.getElementById('photo-slot');
                slot.style.backgroundImage = `url(${currentImage})`;
                slot.innerHTML = '';
                // Ενεργοποίηση του κουμπιού ανάλυσης
                document.getElementById('analyze-btn').disabled = false;
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    };
    inp.click();
}

// ====== ΑΝΑΛΥΣΗ (One-Shot με Gemini) ======
async function performAnalysis() {
    if (!uid || !currentImage) {
        alert('Ανεβάστε μια φωτογραφία πρώτα');
        return;
    }
    if (getP() < COST) {
        alert('Δεν έχετε αρκετούς πόντους. Κερδίστε ή αγοράστε!');
        return;
    }

    const btn = document.getElementById('analyze-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Η Ζαΐρα διαβάζει...';

    try {
        const res = await fetch(`${API}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: uid,
                image: currentImage,
                gender: 'f',
                language_code: lang   // <-- στέλνουμε τη γλώσσα
            })
        });
        const data = await res.json();
        if (data.success) {
            setP(getP() - COST);
            document.getElementById('result-text').textContent = data.symbols;
            document.getElementById('result-area').style.display = 'block';
            // Καθαρισμός για επόμενη ανάλυση
            currentImage = null;
            const slot = document.getElementById('photo-slot');
            slot.style.backgroundImage = '';
            slot.innerHTML = '📸 Ανέβασε φωτογραφία';
            document.getElementById('analyze-btn').disabled = true;
        } else {
            alert(data.error || 'Σφάλμα ανάλυσης');
        }
    } catch (e) {
        alert('Σφάλμα δικτύου');
    } finally {
        btn.disabled = false;
        btn.textContent = '🔮 Ανάλυση (15 πόντοι)';
    }
}

// ====== EARN POINTS (AD) ======
async function earnPoints() {
    if (!adReady) { alert('Οι διαφημίσεις δεν είναι έτοιμες'); return; }
    try { await AdController.show(); setP(getP() + 10); } catch (e) { alert('Η διαφήμιση δεν ολοκληρώθηκε'); }
}

// ====== REFERRAL POPUP ======
function openReferralPopup() {
    if (!uid) {
        alert('Η εφαρμογή ακόμα αρχικοποιείται. Δοκίμασε σε λίγο.');
        return;
    }
    document.getElementById('referral-key-display').textContent = `OmenRef_${uid}`;
    document.getElementById('referral-overlay').classList.add('active');
}

function closeReferralPopup(e) {
    if (!e || e.target === document.getElementById('referral-overlay') || e.target.tagName === 'BUTTON') {
        document.getElementById('referral-overlay').classList.remove('active');
    }
}

function copyReferralKey() {
    const key = `OmenRef_${uid}`;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(key).then(() => {
            alert('✅ Το κλειδί αντιγράφηκε!');
        }).catch(() => fallbackCopy(key));
    } else fallbackCopy(key);
}

function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    alert('✅ Το κλειδί αντιγράφηκε!');
}

function shareReferralLink() {
    if (!uid) return;
    const key = `OmenRef_${uid}`;
    const link = `https://t.me/${BOT}?start=ref_${uid}`;
    const message = `🎁 Μπες στο Omen και κέρδισε 20 Πόντους (💎)! Χρησιμοποίησε το κλειδί μου: ${key} 🔮\n${link}`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(message)}`;
    if (tg) tg.openTelegramLink(shareUrl);
    else window.open(shareUrl, '_blank');
    closeReferralPopup();
}

// ====== SHOP ======
function openShop() { document.getElementById('shop-modal-overlay').classList.add('active'); }
function closeShop(e) {
    if (!e || e.target === document.getElementById('shop-modal-overlay') || e.target.classList.contains('btn-green') || e.target.tagName === 'BUTTON') {
        document.getElementById('shop-modal-overlay').classList.remove('active');
    }
}
async function buyPackage(pkg) {
    if (!uid) return;
    await fetch(`${API}/api/shop/buy`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: uid, package: pkg })
    });
    alert('Ελέγξτε το chat σας στο bot για την πληρωμή!');
    closeShop();
}

// ====== NAVIGATION ======
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
    currentImage = null;
    document.getElementById('photo-slot').style.backgroundImage = '';
    document.getElementById('photo-slot').innerHTML = '📸 Ανέβασε φωτογραφία';
    document.getElementById('result-area').style.display = 'none';
    document.getElementById('analyze-btn').disabled = true;
}
function acceptConsent() {
    document.getElementById('consent-overlay').classList.add('hidden');
    localStorage.setItem('omen_consent', 'true');
    setTimeout(() => {
        if (document.getElementById('splash').classList.contains('active')) {
            document.getElementById('lifeline-rollup').classList.add('visible');
            setTimeout(() => document.getElementById('lifeline-rollup').classList.remove('visible'), 5000);
        }
    }, 5000);
}
function showLegal(type) { document.getElementById(type + '-overlay').classList.add('active'); }
function closeLegal(type) { document.getElementById(type + '-overlay').classList.remove('active'); }

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
    document.getElementById('consent-overlay').classList.remove('hidden');
    if (lang !== 'el') await applyTranslation();
    // Αρχικά το κουμπί ανάλυσης είναι απενεργοποιημένο (θα ενεργοποιηθεί με το upload)
    document.getElementById('analyze-btn').disabled = true;
}

document.addEventListener('DOMContentLoaded', init);
