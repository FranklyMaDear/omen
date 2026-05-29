/**
 * Omen - Καφεμαντεία Mini App
 * Full Frontend Logic v2.0
 * Περιλαμβάνει: 3-Photo Analysis, Shop, Adsgram, Referral, Translation, Points System
 */

// ====== CONFIGURATION ======
const API_BASE = 'https://franklymadear-omenread.hf.space';
const OFFICIAL_BOT_USERNAME = 'omenread_bot';
const ADSGRAM_BLOCK_ID = '32708';
const ANALYSIS_COST = 15;

// ====== GLOBAL STATE ======
let tgWebApp = null;
let currentUserId = null;
let currentLang = localStorage.getItem('omen_lang') || 'el';
let originalTexts = {};
let originalResultText = '';
let currentImages = [];          // Αποθήκευση έως 3 base64 εικόνες
let selectedGender = 'f';
let AdController = null;
let isAdsReady = false;
let isUserReady = false;
let isWatchingAds = false;

// ====== ADSGRAM INIT ======
function initAdsgram() {
    if (typeof window.Adsgram !== 'undefined') {
        AdController = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
        console.log('✅ Adsgram initialized');
        isAdsReady = true;
        enableButtonsWhenReady();
    } else {
        console.log('⏳ Adsgram not ready, retrying...');
        setTimeout(initAdsgram, 1000);
    }
}

function showRewardedAd() {
    if (!AdController) return Promise.reject('not_ready');
    return AdController.show().then(res => {
        console.log('✅ Ad finished');
        return res;
    }).catch(err => {
        console.warn('⚠️ Ad skipped/error', err);
        throw err;
    });
}

// ====== LANGUAGE / TRANSLATION ======
const correctionMap = {
    'en': {
        'Καφεμαντεία': 'Coffee Reading',
        'Ανάλυση Φλιτζανιού': 'Cup Analysis',
        'Η Ετυμηγορία του Καφέ': 'The Coffee Verdict',
        'Μαντάμ Ζαΐρα': 'Madame Zaira',
        'Χρειάζεσαι': 'You need',
        'πόντους': 'points',
        'Ημερήσιο όριο': 'Daily limit',
        'αναλύσεις': 'analyses',
        'Κέρδισε με διαφήμιση': 'Earn with ad'
    }
};

function saveOriginalTexts() {
    document.querySelectorAll('[data-translate="true"]').forEach(el => {
        const key = el.outerHTML;
        if (!originalTexts[key]) originalTexts[key] = el.innerHTML.trim();
    });
}
saveOriginalTexts();

function applyCorrections(text, lang) {
    if (!correctionMap[lang]) return text;
    for (const [wrong, correct] of Object.entries(correctionMap[lang])) {
        const regex = new RegExp(wrong.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
        text = text.replace(regex, correct);
    }
    return text;
}

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('omen_lang', lang);
}

function getStoredLanguage() {
    return localStorage.getItem('omen_lang') || 'el';
}

async function translateText(text, targetLang) {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data?.[0]) {
            let translated = '';
            for (const part of data[0]) if (part[0]) translated += part[0];
            return translated;
        }
    } catch (e) { console.error('Translation error', e); }
    return text;
}

async function translateResult(original, targetLang) {
    if (targetLang === 'el') {
        document.getElementById('result-text').textContent = original;
        return;
    }
    const translated = await translateText(original, targetLang);
    document.getElementById('result-text').textContent = applyCorrections(translated, targetLang);
}

async function translatePage(targetLang) {
    const elements = document.querySelectorAll('[data-translate="true"]');
    for (const el of elements) {
        const text = el.textContent.trim();
        if (text.length > 0 && text.length < 1500) {
            const translated = await translateText(text, targetLang);
            el.textContent = applyCorrections(translated, targetLang);
        }
    }
    // Μετάφραση δυναμικών κουμπιών
    updateScanButtonText();
}

function restoreOriginalTexts() {
    document.querySelectorAll('[data-translate="true"]').forEach(el => {
        const key = el.outerHTML;
        if (originalTexts[key]) el.innerHTML = originalTexts[key];
    });
    updateScanButtonText();
}

function startTranslation() {
    const lang = document.getElementById('language-select').value;
    if (lang === 'el') {
        restoreOriginalTexts();
        document.getElementById('reset-lang-btn').style.display = 'none';
        return;
    }
    setLanguage(lang);
    translatePage(lang).then(() => {
        document.getElementById('reset-lang-btn').style.display = 'flex';
    });
}

function resetToGreek() {
    restoreOriginalTexts();
    setLanguage('el');
    document.getElementById('language-select').value = 'el';
    document.getElementById('reset-lang-btn').style.display = 'none';
}

// ====== POINTS SYSTEM ======
function getPoints() {
    return parseInt(localStorage.getItem('omen_points') || '0');
}
function setPoints(val) {
    localStorage.setItem('omen_points', val);
    document.getElementById('points-value').textContent = val;
}
function addPoints(amount) {
    setPoints(getPoints() + amount);
    showFloatingPoints(amount);
}
function deductPoints(amount) {
    const current = getPoints();
    if (current >= amount) {
        setPoints(current - amount);
        return true;
    }
    return false;
}
function showFloatingPoints(amount) {
    const el = document.createElement('div');
    el.className = 'floating-points';
    el.textContent = '+' + amount;
    const badge = document.getElementById('points-inline');
    if (!badge) return;
    const rect = badge.getBoundingClientRect();
    el.style.left = rect.left + 'px';
    el.style.top = rect.top + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
}

// ====== DAILY LIMIT (τοπικό) ======
function getToday() {
    return new Date().toISOString().split('T')[0];
}
function getDailyAnalyses() {
    const today = getToday();
    const saved = localStorage.getItem('omen_daily_date');
    if (saved !== today) {
        localStorage.setItem('omen_daily_date', today);
        localStorage.setItem('omen_daily_count', '0');
        return 0;
    }
    return parseInt(localStorage.getItem('omen_daily_count') || '0');
}
function incrementDailyAnalyses() {
    const count = getDailyAnalyses() + 1;
    localStorage.setItem('omen_daily_count', count);
}

// ====== 3-PHOTO UI ======
function setupPhotoSlots() {
    const container = document.getElementById('photo-slots');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const slot = document.createElement('div');
        slot.className = 'photo-slot';
        slot.id = `slot-${i}`;
        slot.innerHTML = `<span>📸 ${i+1}/3</span>`;
        slot.onclick = () => triggerUpload(i);
        container.appendChild(slot);
    }
}

function triggerUpload(index) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            // Συμπίεση εικόνας πριν αποθήκευση
            const img = new Image();
            img.onload = () => {
                const compressed = compressImage(img, 800, 0.7);
                currentImages[index] = compressed;
                const slot = document.getElementById(`slot-${index}`);
                slot.style.backgroundImage = `url(${compressed})`;
                slot.innerHTML = '';
                checkAllPhotosReady();
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

function compressImage(image, maxWidth, quality) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let width = image.width;
    let height = image.height;
    if (width > maxWidth) {
        const ratio = maxWidth / width;
        width = maxWidth;
        height = height * ratio;
    }
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
}

function checkAllPhotosReady() {
    const ready = currentImages.filter(img => img !== undefined && img !== null).length === 3;
    const btn = document.getElementById('analyze-multi-btn');
    if (btn) btn.disabled = !ready;
}

// ====== MAIN ANALYSIS ======
async function performMultiAnalysis() {
    if (!currentUserId) {
        alert('Σφάλμα ταυτοποίησης χρήστη. Φόρτωσε ξανά.');
        return;
    }
    const validImages = currentImages.filter(img => img !== undefined && img !== null);
    if (validImages.length !== 3) {
        alert('Ανέβασε και τις 3 φωτογραφίες πρώτα.');
        return;
    }
    const points = getPoints();
    if (points < ANALYSIS_COST) {
        alert('Δεν έχεις αρκετούς πόντους! Κέρδισε πόντους ή αγόρασε πακέτο.');
        return;
    }

    const btn = document.getElementById('analyze-multi-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Η Ζαΐρα διαβάζει...';

    try {
        const res = await fetch(`${API_BASE}/api/analyze-multi`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUserId,
                images: validImages,
                gender: selectedGender
            })
        });
        const data = await res.json();
        if (data.success) {
            deductPoints(ANALYSIS_COST);
            incrementDailyAnalyses();
            originalResultText = data.symbols;
            document.getElementById('result-text').textContent = data.symbols;
            document.getElementById('result-area').style.display = 'block';
            addStarsToResult();

            if (currentLang !== 'el') {
                await translateResult(originalResultText, currentLang);
            }

            // Reset
            currentImages = [];
            setupPhotoSlots();
            btn.textContent = '🔮 Ανάλυση (3 φωτ.) - 15 πόντοι';
        } else {
            alert('Σφάλμα: ' + (data.error || 'Άγνωστο σφάλμα'));
        }
    } catch (e) {
        alert('Σφάλμα δικτύου. Προσπάθησε ξανά.');
    } finally {
        btn.disabled = false;
    }
}

function addStarsToResult() {
    const resultArea = document.getElementById('result-area');
    document.querySelectorAll('.result-star').forEach(s => s.remove());
    const emojis = ['✨', '⭐', '💫', '🌟', '✨', '🔮', '💖', '🌙', '☽', '✧'];
    for (let i = 0; i < 15; i++) {
        const star = document.createElement('span');
        star.className = 'result-star';
        star.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        star.style.left = Math.random() * 90 + '%';
        star.style.top = Math.random() * 90 + '%';
        star.style.animationDelay = Math.random() * 3 + 's';
        star.style.fontSize = (Math.random() * 1.5 + 0.8) + 'rem';
        resultArea.appendChild(star);
    }
}

// ====== SHOP ======
async function buyPackage(pkg) {
    if (!currentUserId) {
        alert('Συνδέσου μέσω Telegram πρώτα.');
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/api/shop/buy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUserId, package: pkg })
        });
        if (res.ok) {
            alert('✅ Έλεγξε το chat σου στο bot για την πληρωμή!');
        } else {
            alert('Σφάλμα κατά την αγορά.');
        }
    } catch (e) {
        alert('Σφάλμα δικτύου.');
    }
}

// ====== EARN POINTS (Ad) ======
async function earnPoints() {
    if (!isAdsReady || !isUserReady) {
        alert('Η λειτουργία δεν είναι ακόμα διαθέσιμη. Περίμενε λίγο...');
        return;
    }
    if (isWatchingAds) return;
    isWatchingAds = true;
    try {
        await showRewardedAd();
        addPoints(10);
        updateScanButtonText();
    } catch (e) {
        alert('Η διαφήμιση δεν ολοκληρώθηκε.');
    } finally {
        isWatchingAds = false;
    }
}

// ====== REFERRAL ======
async function shareReferralLink() {
    if (!currentUserId) {
        alert('Η εφαρμογή ακόμα αρχικοποιείται.');
        return;
    }
    if (!isAdsReady) {
        alert('Η διαφήμιση δεν είναι ακόμα έτοιμη.');
        return;
    }
    try {
        await showRewardedAd();
        const link = `https://t.me/${OFFICIAL_BOT_USERNAME}?start=ref_${currentUserId}`;
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('☕ Ανακάλυψε το μέλλον σου με την καφεμαντεία! Μπες στο Omen!')}`;
        if (tgWebApp) tgWebApp.openTelegramLink(shareUrl);
        else window.open(shareUrl, '_blank');
    } catch (e) {
        alert('Πρέπει να ολοκληρώσεις τη διαφήμιση για να μοιραστείς το link.');
    }
}

// ====== UI HELPERS ======
function updateScanButtonText() {
    const btn = document.getElementById('analyze-multi-btn');
    if (!btn) return;
    const points = getPoints();
    const analyses = getDailyAnalyses();
    const canDo = points >= ANALYSIS_COST && analyses < 5;
    if (!canDo) {
        if (points < ANALYSIS_COST) {
            btn.textContent = '🔒 Χρειάζεσαι 15 πόντους (Κέρδισε με διαφήμιση)';
        } else {
            btn.textContent = '🔒 Ημερήσιο όριο (5/5 αναλύσεις)';
        }
    } else {
        btn.textContent = '🔮 Ανάλυση (3 φωτ.) - 15 πόντοι';
    }
    if (currentLang !== 'el') {
        translateText(btn.textContent, currentLang).then(t => btn.textContent = t);
    }
}

// ====== CONSENT & LANGUAGE DETECTION ======
function detectLanguage() {
    const userLang = navigator.language || navigator.userLanguage;
    const langCode = userLang.split('-')[0];
    const langMap = {
        'el': 'el', 'en': 'en', 'de': 'de', 'fr': 'fr', 'es': 'es',
        'it': 'it', 'ar': 'ar', 'zh': 'zh-CN', 'ja': 'ja', 'ru': 'ru',
        'tr': 'tr', 'nl': 'nl', 'pt': 'pt', 'sv': 'sv', 'no': 'no',
        'da': 'da', 'fi': 'fi', 'pl': 'pl', 'cs': 'cs', 'ro': 'ro',
        'bg': 'bg', 'uk': 'uk', 'ko': 'ko', 'hi': 'hi', 'vi': 'vi',
        'th': 'th', 'id': 'id', 'he': 'iw', 'iw': 'iw'
    };
    const mapped = langMap[langCode] || 'el';
    if (!localStorage.getItem('omen_lang')) {
        setLanguage(mapped);
    }
    document.getElementById('language-select').value = getStoredLanguage();
    const consentLang = document.getElementById('consent-lang-select');
    if (consentLang) consentLang.value = getStoredLanguage();
}

function acceptConsent() {
    document.getElementById('consent-overlay').classList.add('hidden');
}

// ====== INIT ======
async function initTelegramWebApp() {
    if (window.Telegram?.WebApp) {
        tgWebApp = window.Telegram.WebApp;
        tgWebApp.ready();
        tgWebApp.expand();
        tgWebApp.setHeaderColor('#0a0a12');
        tgWebApp.setBackgroundColor('#0a0a12');

        if (tgWebApp.initDataUnsafe?.user) {
            currentUserId = tgWebApp.initDataUnsafe.user.id;
        } else {
            let id = localStorage.getItem('omen_test_user_id');
            if (!id) { id = Date.now(); localStorage.setItem('omen_test_user_id', id); }
            currentUserId = parseInt(id);
        }
    } else {
        let id = localStorage.getItem('omen_test_user_id');
        if (!id) { id = Date.now(); localStorage.setItem('omen_test_user_id', id); }
        currentUserId = parseInt(id);
    }

    try {
        const res = await fetch(`${API_BASE}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUserId,
                start_param: tgWebApp?.initDataUnsafe?.start_param || '',
                first_name: tgWebApp?.initDataUnsafe?.user?.first_name || '',
                username: tgWebApp?.initDataUnsafe?.user?.username || ''
            })
        });
        if (res.ok) {
            const data = await res.json();
            setPoints(data.points);
            if (data.points >= 15 && !localStorage.getItem('welcome_shown')) {
                showToast('🎁 Καλωσόρισες! Έλαβες πόντους δώρο!');
                localStorage.setItem('welcome_shown', 'true');
            }
        }
    } catch (e) {
        console.error('Registration error', e);
    }

    // Φόρτωση δεδομένων χρήστη από backend
    try {
        const userRes = await fetch(`${API_BASE}/api/user/${currentUserId}`);
        if (userRes.ok) {
            const userData = await userRes.json();
            setPoints(userData.points);
            // Αποθήκευση για χρήση στο UI
            localStorage.setItem('omen_user_data', JSON.stringify(userData));
        }
    } catch (e) {}

    isUserReady = true;
    enableButtonsWhenReady();
}

function enableButtonsWhenReady() {
    if (isAdsReady && isUserReady) {
        const btn = document.getElementById('analyze-multi-btn');
        if (btn) btn.disabled = false;
    }
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(20,10,40,0.95);color:#f7dc6f;padding:12px 24px;border-radius:30px;z-index:10000;font-weight:600;';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ====== BACKGROUND STARS ======
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
    for (let i = 0; i < 150; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 1.5 + 0.5,
            dx: (Math.random() - 0.5) * 0.4,
            dy: (Math.random() - 0.5) * 0.4,
            alpha: Math.random() * 0.8 + 0.2
        });
    }
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        stars.forEach(s => {
            s.x += s.dx;
            s.y += s.dy;
            if (s.x < 0 || s.x > canvas.width) s.dx *= -1;
            if (s.y < 0 || s.y > canvas.height) s.dy *= -1;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 215, 150, ${s.alpha * 0.7})`;
            ctx.fill();
        });
        requestAnimationFrame(draw);
    }
    draw();
})();

// ====== EVENT LISTENERS & STARTUP ======
document.addEventListener('DOMContentLoaded', () => {
    detectLanguage();
    setupPhotoSlots();
    initAdsgram();
    initTelegramWebApp();
    document.getElementById('points-value').textContent = getPoints();
    updateScanButtonText();

    // Consent εμφάνιση πάντα (δεν αποθηκεύεται τίποτα)
    const consent = document.getElementById('consent-overlay');
    if (consent) consent.classList.remove('hidden');

    // Language bar listeners
    document.getElementById('translate-btn')?.addEventListener('click', startTranslation);
    document.getElementById('reset-lang-btn')?.addEventListener('click', resetToGreek);
    document.getElementById('language-select')?.addEventListener('change', function() {
        setLanguage(this.value);
    });
});
