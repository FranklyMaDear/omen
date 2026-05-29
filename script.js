const API_BASE = 'https://franklymadear-omenread.hf.space';
const BOT_USERNAME = 'omenread_bot';
const ADS_BLOCK_ID = '32708';
const ANALYSIS_COST = 15;

let tgWebApp = null;
let currentUserId = null;
let currentLang = localStorage.getItem('omen_lang') || 'el';
let images = [];   // 3 base64 εικόνες
let adController = null;
let isAdsReady = false;
let isUserReady = false;

// ====== ADSGRAM ======
function initAdsgram() {
    if (typeof window.Adsgram !== 'undefined') {
        adController = window.Adsgram.init({ blockId: ADS_BLOCK_ID });
        isAdsReady = true;
        enableButtons();
    } else setTimeout(initAdsgram, 1000);
}

// ====== ΓΛΩΣΣΑ (ΜΟΝΟ ΑΠΟ CONSENT) ======
function changeLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('omen_lang', lang);
}

async function applyTranslation() {
    if (currentLang === 'el') {
        restoreOriginals();
        return;
    }
    // Μετάφραση όλων των data-translate στοιχείων
    const elements = document.querySelectorAll('[data-translate="true"]');
    for (const el of elements) {
        const original = el.getAttribute('data-original') || el.textContent.trim();
        if (!el.getAttribute('data-original')) el.setAttribute('data-original', original);
        if (original.length > 0 && original.length < 1500) {
            try {
                const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${currentLang}&dt=t&q=${encodeURIComponent(original)}`);
                const data = await res.json();
                if (data?.[0]) {
                    let translated = '';
                    for (const part of data[0]) if (part[0]) translated += part[0];
                    el.textContent = translated;
                }
            } catch (e) {}
        }
    }
    // Μετάφραση αποτελέσματος αν υπάρχει
    const resultText = document.getElementById('result-text');
    if (resultText && resultText.textContent.trim().length > 0) {
        try {
            const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${currentLang}&dt=t&q=${encodeURIComponent(resultText.textContent.trim())}`);
            const data = await res.json();
            if (data?.[0]) {
                let translated = '';
                for (const part of data[0]) if (part[0]) translated += part[0];
                resultText.textContent = translated;
            }
        } catch (e) {}
    }
}

function restoreOriginals() {
    document.querySelectorAll('[data-translate="true"]').forEach(el => {
        const original = el.getAttribute('data-original');
        if (original) el.textContent = original;
    });
}

// Αποθήκευση αυθεντικών κειμένων για restore
(function() {
    document.querySelectorAll('[data-translate="true"]').forEach(el => {
        el.setAttribute('data-original', el.textContent.trim());
    });
})();

// Ανίχνευση γλώσσας συσκευής
(function() {
    const deviceLang = (navigator.language || 'el').split('-')[0];
    const supported = ['el','en','de','fr','es','it','ar','zh','ja','ru','tr','nl','pt','sv','no','da','fi','pl','cs','ro','bg','uk','ko','hi','vi','th','id','iw'];
    if (!localStorage.getItem('omen_lang') && supported.includes(deviceLang)) {
        currentLang = deviceLang;
        localStorage.setItem('omen_lang', currentLang);
    }
    document.getElementById('consent-lang-select').value = currentLang;
})();

// ====== ΠΟΝΤΟΙ ======
function getPoints() {
    return parseInt(localStorage.getItem('omen_points') || '0');
}
function setPoints(val) {
    localStorage.setItem('omen_points', val);
    document.getElementById('points-display').textContent = val;
}

// ====== 3 SLOTS ======
function setupSlots() {
    const container = document.getElementById('photo-slots');
    container.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const slot = document.createElement('div');
        slot.className = 'photo-slot';
        slot.innerHTML = `📸 ${i+1}/3`;
        slot.onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const img = new Image();
                    img.onload = () => {
                        // Συμπίεση
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        let width = img.width, height = img.height;
                        const maxWidth = 800;
                        if (width > maxWidth) {
                            height = height * (maxWidth / width);
                            width = maxWidth;
                        }
                        canvas.width = width;
                        canvas.height = height;
                        ctx.drawImage(img, 0, 0, width, height);
                        images[i] = canvas.toDataURL('image/jpeg', 0.7);
                        slot.style.backgroundImage = `url(${images[i]})`;
                        slot.innerHTML = '';
                        if (images.filter(x => x).length === 3) {
                            document.getElementById('analyze-btn').disabled = false;
                        }
                    };
                    img.src = ev.target.result;
                };
                reader.readAsDataURL(file);
            };
            input.click();
        };
        container.appendChild(slot);
    }
}

// ====== ΑΝΑΛΥΣΗ ======
async function analyze() {
    if (!currentUserId) { alert('Περιμένετε την αρχικοποίηση...'); return; }
    if (images.filter(x => x).length !== 3) { alert('Ανεβάστε και τις 3 φωτογραφίες'); return; }
    if (getPoints() < ANALYSIS_COST) { alert('Δεν έχετε αρκετούς πόντους'); return; }

    const btn = document.getElementById('analyze-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Η Ζαΐρα διαβάζει...';

    try {
        const res = await fetch(`${API_BASE}/api/analyze-multi`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUserId,
                images: images.filter(x => x),
                gender: 'f'   // default, μπορείς να προσθέσεις επιλογή
            })
        });
        const data = await res.json();
        if (data.success) {
            setPoints(getPoints() - ANALYSIS_COST);
            document.getElementById('result-text').textContent = data.symbols;
            document.getElementById('result-area').style.display = 'block';
            if (currentLang !== 'el') {
                await applyTranslation();   // μεταφράζει και το αποτέλεσμα
            }
            images = [];   // reset
            setupSlots();
        } else {
            alert(data.error || 'Σφάλμα ανάλυσης');
        }
    } catch (e) {
        alert('Σφάλμα δικτύου');
    } finally {
        btn.disabled = false;
        btn.textContent = '🔮 Ανάλυση (3 φωτ.) - 15 πόντοι';
    }
}

// ====== ΚΕΡΔΟΣ ΑΠΟ ΔΙΑΦΗΜΙΣΗ ======
async function earnPoints() {
    if (!isAdsReady) { alert('Οι διαφημίσεις δεν είναι έτοιμες ακόμα'); return; }
    try {
        await adController.show();
        setPoints(getPoints() + 10);
    } catch (e) {
        alert('Η διαφήμιση δεν ολοκληρώθηκε');
    }
}

// ====== REFERRAL ======
async function shareReferral() {
    if (!isAdsReady || !currentUserId) { alert('Περιμένετε...'); return; }
    try {
        await adController.show();   // υποχρεωτική διαφήμιση
        const link = `https://t.me/${BOT_USERNAME}?start=ref_${currentUserId}`;
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('☕ Ανακάλυψε το μέλλον σου με την καφεμαντεία!')}`;
        if (tgWebApp) tgWebApp.openTelegramLink(shareUrl);
        else window.open(shareUrl, '_blank');
    } catch (e) {
        alert('Πρέπει να δεις τη διαφήμιση για να μοιραστείς το link');
    }
}

// ====== SHOP ======
async function buy(pkg) {
    if (!currentUserId) { alert('Περιμένετε...'); return; }
    try {
        await fetch(`${API_BASE}/api/shop/buy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUserId, package: pkg })
        });
        alert('Ελέγξτε το chat σας στο bot για την πληρωμή!');
    } catch (e) {
        alert('Σφάλμα');
    }
}

// ====== INIT ======
function acceptConsent() {
    document.getElementById('consent-overlay').classList.add('hidden');
    document.getElementById('main').style.display = 'flex';
    localStorage.setItem('omen_consent', 'true');
}

function enableButtons() {
    if (isAdsReady && isUserReady) {
        // Το κουμπί ανάλυσης ενεργοποιείται μόνο όταν έχουν ανέβει 3 φωτογραφίες
    }
}

async function init() {
    setupSlots();
    initAdsgram();

    // Telegram WebApp
    if (window.Telegram?.WebApp) {
        tgWebApp = window.Telegram.WebApp;
        tgWebApp.ready();
        tgWebApp.expand();
        if (tgWebApp.initDataUnsafe?.user) {
            currentUserId = tgWebApp.initDataUnsafe.user.id;
        } else {
            let id = localStorage.getItem('omen_test_id');
            if (!id) { id = Date.now(); localStorage.setItem('omen_test_id', id); }
            currentUserId = parseInt(id);
        }
    } else {
        let id = localStorage.getItem('omen_test_id');
        if (!id) { id = Date.now(); localStorage.setItem('omen_test_id', id); }
        currentUserId = parseInt(id);
    }

    // Εγγραφή χρήστη
    try {
        const res = await fetch(`${API_BASE}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUserId,
                start_param: tgWebApp?.initDataUnsafe?.start_param || '',
                first_name: tgWebApp?.initDataUnsafe?.user?.first_name || ''
            })
        });
        const data = await res.json();
        setPoints(data.points);
    } catch (e) {}

    isUserReady = true;
    enableButtons();

    // Αν έχει ήδη αποδεχτεί, κρύψε το consent
    if (localStorage.getItem('omen_consent') === 'true') {
        acceptConsent();
    }

    // Αυτόματη μετάφραση αν η γλώσσα δεν είναι ελληνικά
    if (currentLang !== 'el') {
        await applyTranslation();
    }
}

document.addEventListener('DOMContentLoaded', init);
