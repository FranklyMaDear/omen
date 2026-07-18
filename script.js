
const API = 'https://franklymadear-omenread.hf.space';
const BOT = 'omenread_bot';
const ADS_BLOCK = '32708';
const COST = 15;

let tg = null, uid = null;
// Αυτόματη ανίχνευση γλώσσας αν δεν έχει οριστεί
let lang = localStorage.getItem('omen_lang') || (() => {
    const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    const browserLang = (navigator.language || 'en').substring(0,2);
    return (tgLang === 'el' || browserLang === 'el') ? 'el' : (tgLang || browserLang || 'en');
})();
let currentImage = null;
let isAnalyzing = false;
let adReady = false;
let AdController = null;

// ====== ADSGRAM ======
function initAds() {
    if (typeof window.Adsgram !== 'undefined') {
        AdController = window.Adsgram.init({ blockId: ADS_BLOCK });
        adReady = true;
    } else setTimeout(initAds, 1000);
}

// ====== ΓΛΩΣΣΑ & ΜΕΤΑΦΡΑΣΗ ======
function setLang(l) { 
    lang = l;
    localStorage.setItem('omen_lang', l); 
    applyTranslation(); // άμεση εφαρμογή νέας γλώσσας
}

async function applyTranslation(targetElement = null) {
    if (lang === 'el') { restoreOriginals(); return; }
    
    const els = targetElement ? [targetElement] : document.querySelectorAll('[data-translate="true"]');
    
    for (const el of els) {
        const orig = el.getAttribute('data-original') || el.textContent.trim();
        if (!el.getAttribute('data-original')) el.setAttribute('data-original', orig);
        if (orig.length > 0 && orig.length < 1500) {
            try {
                const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(orig)}`);
                const data = await res.json();
                if (data && data[0] && data[0][0]) el.textContent = data[0][0][0];
            } catch(e) { console.error(e); }
        }
    }
}

function restoreOriginals() {
    document.querySelectorAll('[data-translate="true"]').forEach(el => {
        const orig = el.getAttribute('data-original');
        if (orig) el.textContent = orig;
    });
}

// ====== ΦΥΛΟ (GENDER) ======
function setGender(g) {
    localStorage.setItem('omen_gender', g);
    const maleBtn = document.getElementById('gender-male');
    const femaleBtn = document.getElementById('gender-female');
    if (maleBtn) maleBtn.classList.toggle('active', g === 'male');
    if (femaleBtn) femaleBtn.classList.toggle('active', g === 'female');
}

// ====== NAVIGATION ======
function goToScan() {
    document.getElementById('splash').classList.remove('active');
    document.getElementById('scan').classList.add('active');
    updatePointsDisplay();
}
function goToSplash() {
    document.getElementById('scan').classList.remove('active');
    document.getElementById('splash').classList.add('active');
}

// ====== ΠΟΝΤΟΙ & ΣΥΓΚΑΤΑΘΕΣΗ ======
function acceptConsent() {
    document.getElementById('consent-overlay').classList.add('hidden');
    localStorage.setItem('omen_consent', 'true');
    applyTranslation();
}

async function updatePointsDisplay() {
    if (!uid) return;
    try {
        const res = await fetch(`${API}/api/user/${uid}`);
        const data = await res.json();
        const pts = data.points !== undefined ? data.points : 0;
        document.getElementById('points-display').textContent = pts;
        document.getElementById('analyze-btn').disabled = (pts < COST || !currentImage || isAnalyzing);
    } catch(e) { console.error(e); }
}

// ====== ΔΙΑΧΕΙΡΙΣΗ ΦΩΤΟΓΡΑΦΙΑΣ (PHOTO SLOT) ======
function handleFileSelect(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        currentImage = e.target.result;
        const slot = document.getElementById('photo-slot');
        
        slot.style.backgroundImage = `url('${currentImage}')`;
        slot.classList.add('loaded');
        
        updatePointsDisplay();
    };
    reader.readAsDataURL(file);
}

// ====== ΑΝΑΛΥΣΗ ΦΛΙΤΖΑΝΙΟΥ (ΜΕ ΑΠΟΣΤΟΛΗ ΦΥΛΟΥ) ======
async function performAnalysis() {
    if (!currentImage || isAnalyzing) return;
    isAnalyzing = true;
    
    const btn = document.getElementById('analyze-btn');
    const spinner = document.getElementById('analyze-spinner');
    const btnText = document.getElementById('analyze-btn-text');
    
    btn.disabled = true;
    spinner.style.display = 'inline-block';
    if(btnText) btnText.style.display = 'none';

    try {
        // Προσθέτουμε το φύλο στο body
        const gender = localStorage.getItem('omen_gender') || 'male';
        const res = await fetch(`${API}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: uid, image: currentImage, gender: gender })
        });
        const data = await res.json();
        
        if (data.error) {
            alert(data.error);
        } else if (data.analysis) {
            const modalText = document.getElementById('modal-result-text');
            modalText.textContent = data.analysis;
            // Αποθήκευση του πρωτότυπου ελληνικού κειμένου
            modalText.setAttribute('data-original', data.analysis);
            
            // Αν η γλώσσα ΔΕΝ είναι Ελληνικά, μετάφρασε το κείμενο της ανάλυσης
            // και επίσης όλα τα σταθερά κείμενα του modal (τίτλος, κουμπί)
            if (lang !== 'el') {
                await applyTranslation(modalText);       // μετάφραση ανάλυσης
                await applyTranslation();                // μετάφραση υπόλοιπων στοιχείων modal
            }
            
            openResultModal();
        }
    } catch(e) {
        console.error(e);
        alert('Σφάλμα σύνδεσης με τον διακομιστή.');
    } finally {
        isAnalyzing = false;
        spinner.style.display = 'none';
        if(btnText) btnText.style.display = 'inline-block';
        updatePointsDisplay();
    }
}

// ====== ΔΙΑΧΕΙΡΙΣΗ MODAL ΑΠΟΤΕΛΕΣΜΑΤΩΝ ======
function openResultModal() {
    document.getElementById('result-modal-overlay').classList.add('active');
}

function closeResultModal(shouldReset = false) {
    document.getElementById('result-modal-overlay').classList.remove('active');
    
    if (shouldReset) {
        currentImage = null;
        const slot = document.getElementById('photo-slot');
        slot.style.backgroundImage = '';
        slot.classList.remove('loaded');
        document.getElementById('file-input').value = '';
        updatePointsDisplay();
    }
}

// ====== ΔΙΑΦΗΜΙΣΕΙΣ (ADSGRAM) ======
function earnPoints() {
    if (!adReady || !AdController) {
        alert('Η διαφήμιση δεν είναι έτοιμη ακόμα. Δοκιμάστε ξανά σε λίγα δευτερόλεπτα.');
        return;
    }
    AdController.show().then(async (result) => {
        if (result.done) {
            try {
                const res = await fetch(`${API}/api/earn`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: uid, points: 10 })
                });
                const d = await res.json();
                alert(d.message || 'Κερδίσατε 10 πόντους!');
                updatePointsDisplay();
            } catch(e) { console.error(e); }
        }
    }).catch((err) => {
        console.error(err);
        alert('Η διαφήμιση έκλεισε νωρίς ή προέκυψε σφάλμα.');
    });
}

// ====== SHOP (αφαιρέθηκε) ======
// Το σύστημα αγοράς πόντων με Telegram Stars έχει αφαιρεθεί.

// ====== REFERRALS ======
function openReferralPopup() {
    if (uid) {
        document.getElementById('referral-key-display').textContent = `OmenRef_${uid}`;
    }
    document.getElementById('referral-overlay').style.display = 'flex';
}
function closeReferralPopup(e) {
    if (!e || e.target === document.getElementById('referral-overlay') || e.target.tagName === 'BUTTON') {
        document.getElementById('referral-overlay').style.display = 'none';
    }
}
function copyReferralKey() {
    const key = document.getElementById('referral-key-display').textContent;
    navigator.clipboard.writeText(key).then(() => alert('Το κλειδί αντιγράφηκε!'));
}
function shareReferralLink() {
    const key = `OmenRef_${uid}`;
    const text = encodeURIComponent(`🔮 Μόλις χρησιμοποίησα το Omen για να διαβάσω το φλιτζάνι μου! Χρησιμοποίησε το κλειδί μου ${key} κατά την είσοδο για να πάρεις +20 δωρεάν διαμάντια! ✨`);
    window.open(`https://t.me/share/url?url=https://t.me/${BOT}&text=${text}`);
}

// ====== LEGAL ======
function showLegal(type) { document.getElementById(`${type}-overlay`).classList.add('active'); }
function closeLegal(type) { document.getElementById(`${type}-overlay`).classList.remove('active'); }

// ====== BACKGROUND ANIMATION (CANVAS) ======
(function() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let stars = [];
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();
    for (let i = 0; i < 45; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 1.5 + 0.5,
            dx: (Math.random() - 0.5) * 0.2,
            dy: (Math.random() - 0.5) * 0.2,
            alpha: Math.random()
        });
    }
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

// ====== ΠΡΟΣΘΗΚΗ ΣΤΗΝ ΑΡΧΙΚΗ ΟΘΟΝΗ (install) ======
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the install prompt');
            } else {
                console.log('User dismissed the install prompt');
            }
            deferredPrompt = null;
        });
    } else {
        alert('Για να προσθέσετε την εφαρμογή στην αρχική οθόνη, πατήστε το κουμπί "Προσθήκη στην αρχική οθόνη" από το μενού του browser σας.');
    }
}

// ====== INIT (ΦΟΡΤΩΣΗ ΦΥΛΟΥ ΚΑΙ ΑΥΤΟΜΑΤΗ ΜΕΤΑΦΡΑΣΗ) ======
async function init() {
    initAds();
    if (window.Telegram?.WebApp) {
        tg = window.Telegram.WebApp; 
        tg.ready(); 
        tg.expand();
        uid = tg.initDataUnsafe?.user?.id || parseInt(localStorage.getItem('tid') || Date.now());
    } else {
        uid = parseInt(localStorage.getItem('tid') || Date.now());
    }
    localStorage.setItem('tid', uid);
    
    // Φόρτωση αποθηκευμένου φύλου (default: 'male')
    const savedGender = localStorage.getItem('omen_gender') || 'male';
    setGender(savedGender);
    
    // Εμφάνιση του consent overlay
    document.getElementById('consent-overlay').classList.remove('hidden');

    try {
        const startParam = tg?.initDataUnsafe?.start_param || '';
        const firstName = tg?.initDataUnsafe?.user?.first_name || '';
        
        const res = await fetch(`${API}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: uid, start_param: startParam, first_name: firstName })
        });
        
        await updatePointsDisplay();
        
        const d = await res.json();
        if (d.show_lifeline) {
            document.getElementById('lifeline-rollup').classList.add('visible');
        }
    } catch(e) { 
        console.error(e);
        updatePointsDisplay();
    }

    // Αν η γλώσσα δεν είναι Ελληνικά, μετάφραση όλης της σελίδας
    if (lang !== 'el') {
        applyTranslation(); 
    }
}
window.onload = init;
