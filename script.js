/**
 * Omen - Καφεμαντεία Mini App
 * Frontend Logic: Referral System (with milestone & ads), Telegram Stars, AI Analysis, Translations, Lifeline Rollup
 * Επίσημο Bot: @omenread_bot
 */

// ====== GLOBAL VARIABLES ======
let tgWebApp = null;
let currentUserId = null;      // Πάντα αριθμός (integer)
let currentLang = 'el';
let originalTexts = {};
let originalResultText = '';

const API_URL = '/api/analyze';
const ANALYSIS_COST = 15;
const DAILY_LIMIT = 5;
const REFERRAL_REWARD = 20;
const OFFICIAL_BOT_USERNAME = 'omenread_bot';

let isWatchingAds = false;
let isAnalyzing = false;
let currentImageBase64 = null;
let selectedGender = 'f';
let currentStream = null;
let AdController = null;
let userStarsUnlocks = 0;

let lifelineShowTimer = null;
let lifelineHideTimer = null;

// ====== ADSGRAM ======
const ADSGRAM_BLOCK_ID = '32221';

function initAdsgram() {
    if (typeof window.Adsgram !== 'undefined') {
        AdController = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
        console.log('✅ Adsgram initialized');
    } else {
        setTimeout(initAdsgram, 1000);
    }
}

function showRewardedAd() {
    if (!AdController) {
        alert('Οι διαφημίσεις δεν είναι ακόμα διαθέσιμες. Δοκίμασε ξανά σε λίγο.');
        return Promise.reject('not_ready');
    }
    return AdController.show()
        .then((result) => {
            console.log('✅ Ad finished:', result);
            return result;
        })
        .catch((result) => {
            console.warn('⚠️ Ad error or skipped:', result);
            throw result;
        });
}

// ====== CONSENT (εμφάνιση πάντα) ======
function checkConsent() {
    const consentOverlay = document.getElementById('consent-overlay');
    if (consentOverlay) consentOverlay.classList.remove('hidden');
    // Εφαρμογή γλώσσας που ανιχνεύθηκε ή αποθηκεύτηκε
    const storedLang = getStoredLanguage();
    document.getElementById('language-select').value = storedLang;
    document.getElementById('consent-lang-select').value = storedLang;
    if (storedLang !== 'el') {
        startTranslation(); // θα μεταφράσει όλη τη σελίδα
    }
    startLifelineCycle();
}

function acceptConsent() {
    document.getElementById('consent-overlay').classList.add('hidden');
}

// ====== CONSENT TRANSLATION ======
function changeConsentLang(lang) {
    setLanguage(lang);
    document.getElementById('language-select').value = lang;
}

async function translateConsent() {
    const lang = document.getElementById('consent-lang-select').value;
    if (lang === 'el') {
        restoreOriginalTexts();
        document.getElementById('reset-lang-btn').style.display = 'none';
        return;
    }
    const btn = document.querySelector('#consent-modal .consent-lang-bar button');
    btn.textContent = '⟳';
    btn.disabled = true;
    
    setLanguage(lang);
    await translatePage(lang);
    
    btn.textContent = '▶';
    btn.disabled = false;
    document.getElementById('reset-lang-btn').style.display = 'flex';
}

// ====== LEGAL ======
function showLegal(type) {
    if (type === 'terms') document.getElementById('terms-overlay').classList.add('active');
    else document.getElementById('privacy-overlay').classList.add('active');
}

function closeLegal(type) {
    if (type === 'terms') document.getElementById('terms-overlay').classList.remove('active');
    else document.getElementById('privacy-overlay').classList.remove('active');
}

document.addEventListener('click', function(e) {
    if (e.target.classList.contains('legal-overlay')) {
        e.target.classList.remove('active');
    }
});

// ====== TRANSLATION ======
var correctionMap = {
    'en': {
        'Coffee schop': 'Coffee Reading', 'coffee schop': 'Coffee Reading',
        'Coffee shop': 'Coffee Reading', 'coffee shop': 'Coffee Reading',
        'Καφεμαντεία': 'Coffee Reading', 'καφεμαντεία': 'Coffee Reading',
        'Καφεμαντεία με AI': 'Coffee Reading with AI', 'καφεμαντεία με AI': 'Coffee Reading with AI',
        'Ανάλυση Φλιτζανιού': 'Cup Analysis', 'ανάλυση φλιτζανιού': 'Cup Analysis',
        'Η Ετυμηγορία του Καφέ': 'The Coffee Verdict', 'η ετυμηγορία του καφέ': 'The Coffee Verdict',
        'Μαντάμ Ζαΐρα': 'Madame Zaira', 'μαντάμ ζαΐρα': 'Madame Zaira',
        'Χρειάζεσαι': 'You need', 'χρειάζεσαι': 'You need',
        'πόντους': 'points', 'πόντοι': 'points',
        'Ημερήσιο όριο': 'Daily limit', 'ημερήσιο όριο': 'Daily limit',
        'αναλύσεις': 'analyses',
        'Κέρδισε με διαφήμιση': 'Earn with ad', 'κέρδισε με διαφήμιση': 'Earn with ad'
    }
};

function saveOriginalTexts() {
    document.querySelectorAll('[data-translate="true"]').forEach(function(el) {
        var key = el.outerHTML;
        if (!originalTexts[key]) {
            originalTexts[key] = el.innerHTML.trim();
        }
    });
}
saveOriginalTexts();

function applyCorrections(text, targetLang) {
    if (correctionMap[targetLang]) {
        var corrections = correctionMap[targetLang];
        for (var wrong in corrections) {
            var regex = new RegExp(wrong.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
            text = text.replace(regex, corrections[wrong]);
        }
    }
    return text;
}

function startTranslation() {
    var lang = document.getElementById('language-select').value;
    if (lang === 'el') {
        restoreOriginalTexts();
        setLanguage('el');
        document.getElementById('reset-lang-btn').style.display = 'none';
        updateScanButton();
        if (originalResultText && document.getElementById('result-area').style.display !== 'none') {
            document.getElementById('result-text').textContent = originalResultText;
        }
        return;
    }
    var btn = document.getElementById('translate-btn');
    btn.classList.add('translating');
    btn.textContent = '⟳';
    btn.disabled = true;
    setLanguage(lang);
    translatePage(lang).then(() => {
        updateScanButton();
        if (originalResultText && document.getElementById('result-area').style.display !== 'none') {
            translateResult(originalResultText, lang);
        }
    });
}

async function translateSingleElement(el, text, targetLang) {
    try {
        var translated = await translateText(text, targetLang);
        var corrected = applyCorrections(translated, targetLang);
        el.textContent = corrected;
    } catch (e) { console.log('Translation error for element:', e); }
}

async function translatePage(targetLang) {
    var elements = document.querySelectorAll('[data-translate="true"]');
    var textsToTranslate = [];
    var elementsToUpdate = [];
    elements.forEach(function(el) {
        var text = el.textContent.trim();
        if (text.length > 0 && text.length < 1500) {
            textsToTranslate.push(text);
            elementsToUpdate.push(el);
        }
    });
    if (textsToTranslate.length === 0) {
        finishTranslation();
        return;
    }
    var batchSize = 10;
    for (var i = 0; i < textsToTranslate.length; i += batchSize) {
        var batch = textsToTranslate.slice(i, i + batchSize);
        var batchElements = elementsToUpdate.slice(i, i + batchSize);
        try {
            var translatedTexts = await translateBatch(batch, targetLang);
            for (var j = 0; j < batchElements.length; j++) {
                if (translatedTexts[j]) {
                    var correctedText = applyCorrections(translatedTexts[j], targetLang);
                    batchElements[j].textContent = correctedText;
                }
            }
        } catch (e) { console.log('Translation error:', e); }
    }
    finishTranslation();
}

function finishTranslation() {
    var btn = document.getElementById('translate-btn');
    if (btn) {
        btn.classList.remove('translating');
        btn.textContent = '▶';
        btn.disabled = false;
    }
    document.getElementById('reset-lang-btn').style.display = 'flex';
}

async function translateBatch(texts, targetLang) {
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=el&tl=' + targetLang + '&dt=t&q=' + encodeURIComponent(texts.join('|||'));
    var response = await fetch(url);
    var data = await response.json();
    var translations = [];
    if (data && data[0]) {
        var translatedText = '';
        for (var i = 0; i < data[0].length; i++) {
            if (data[0][i][0]) translatedText += data[0][i][0];
        }
        translations = translatedText.split('|||');
    }
    return translations;
}

async function translateText(text, targetLang) {
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + targetLang + '&dt=t&q=' + encodeURIComponent(text);
    try {
        var response = await fetch(url);
        var data = await response.json();
        if (data && data[0]) {
            var translated = '';
            for (var i = 0; i < data[0].length; i++) {
                if (data[0][i][0]) translated += data[0][i][0];
            }
            return translated;
        }
    } catch (e) { console.error('Translation failed', e); }
    return text;
}

async function translateResult(original, targetLang) {
    if (targetLang === 'el') {
        document.getElementById('result-text').textContent = original;
        return;
    }
    var translated = await translateText(original, targetLang);
    var corrected = applyCorrections(translated, targetLang);
    document.getElementById('result-text').textContent = corrected;
}

function restoreOriginalTexts() {
    document.querySelectorAll('[data-translate="true"]').forEach(function(el) {
        var key = el.outerHTML;
        if (originalTexts[key]) {
            el.innerHTML = originalTexts[key];
        }
    });
}

function resetToGreek() {
    restoreOriginalTexts();
    setLanguage('el');
    document.getElementById('language-select').value = 'el';
    document.getElementById('reset-lang-btn').style.display = 'none';
    updateScanButton();
    if (originalResultText && document.getElementById('result-area').style.display !== 'none') {
        document.getElementById('result-text').textContent = originalResultText;
    }
}

function setLanguage(lang) {
    localStorage.setItem('omen_lang', lang);
    currentLang = lang;
}

function getStoredLanguage() {
    return localStorage.getItem('omen_lang') || 'el';
}

function detectLanguage() {
    // Ανίχνευση γλώσσας συσκευής
    var userLang = navigator.language || navigator.userLanguage;
    var langCode = userLang.split('-')[0];
    var langMap = {
        'el': 'el', 'en': 'en', 'de': 'de', 'fr': 'fr', 'es': 'es',
        'it': 'it', 'ar': 'ar', 'zh': 'zh-CN', 'ja': 'ja', 'ru': 'ru',
        'tr': 'tr', 'nl': 'nl', 'pt': 'pt', 'sv': 'sv', 'no': 'no',
        'da': 'da', 'fi': 'fi', 'pl': 'pl', 'cs': 'cs', 'ro': 'ro',
        'bg': 'bg', 'uk': 'uk', 'ko': 'ko', 'hi': 'hi', 'vi': 'vi',
        'th': 'th', 'id': 'id', 'he': 'iw', 'iw': 'iw'
    };
    var mappedLang = langMap[langCode] || 'el';
    // Αν δεν υπάρχει αποθηκευμένη γλώσσα, χρησιμοποίησε την ανιχνευμένη
    if (!localStorage.getItem('omen_lang')) {
        setLanguage(mappedLang);
    }
    var langSelect = document.getElementById('language-select');
    if (langSelect) { langSelect.value = getStoredLanguage(); }
    var consentLangSelect = document.getElementById('consent-lang-select');
    if (consentLangSelect) { consentLangSelect.value = getStoredLanguage(); }
    
    var labelMap = {
        'el': '🌐 Γλώσσα', 'en': '🌐 Language', 'de': '🌐 Sprache',
        'fr': '🌐 Langue', 'es': '🌐 Idioma', 'it': '🌐 Lingua',
        'ar': '🌐 اللغة', 'zh-CN': '🌐 语言', 'ja': '🌐 言語',
        'ru': '🌐 Язык', 'tr': '🌐 Dil', 'nl': '🌐 Taal',
        'pt': '🌐 Idioma', 'sv': '🌐 Språk', 'no': '🌐 Språk',
        'da': '🌐 Sprog', 'fi': '🌐 Kieli', 'pl': '🌐 Język',
        'cs': '🌐 Jazyk', 'ro': '🌐 Limbă', 'bg': '🌐 Език',
        'uk': '🌐 Мова', 'ko': '🌐 언어', 'hi': '🌐 भाषा',
        'vi': '🌐 Ngôn ngữ', 'th': '🌐 ภาษา', 'id': '🌐 Bahasa',
        'iw': '🌐 שפה'
    };
    var label = document.getElementById('lang-label');
    if (label) { label.textContent = labelMap[getStoredLanguage()] || '🌐 Language'; }
    
    // Αν η γλώσσα δεν είναι ελληνικά και δεν έχει γίνει ήδη μετάφραση, ξεκίνα μετάφραση
    if (getStoredLanguage() !== 'el') {
        setTimeout(function() { startTranslation(); }, 500);
    }
}
detectLanguage();

// ====== BACKGROUND STARS ======
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let stars = [];

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function createStars(count = 150) {
    stars = [];
    for (let i = 0; i < count; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 1.5 + 0.5,
            dx: (Math.random() - 0.5) * 0.4,
            dy: (Math.random() - 0.5) * 0.4,
            alpha: Math.random() * 0.8 + 0.2
        });
    }
}
createStars();

function drawStars() {
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
    requestAnimationFrame(drawStars);
}
drawStars();

// ====== PAGE NAVIGATION ======
function goToScan() {
    hideLifelineRollup();
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('scan').classList.add('active');
    resetScanUI();
    updateScanButton();
}

function goToSplash() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('splash').classList.add('active');
    updateScanButton();
}

// ====== GENDER SELECTION ======
function selectGender(gender, btn) {
    selectedGender = gender;
    document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

// ====== POINTS SYSTEM ======
function getPoints() {
    const userData = JSON.parse(localStorage.getItem('omen_user_data') || '{}');
    return parseInt(userData.points || localStorage.getItem('omen_points') || '0');
}

function setPoints(val) {
    const userData = JSON.parse(localStorage.getItem('omen_user_data') || '{}');
    userData.points = val;
    localStorage.setItem('omen_user_data', JSON.stringify(userData));
    localStorage.setItem('omen_points', val);
    updatePointsDisplay();
}

function addPoints(amount) {
    const current = getPoints();
    setPoints(current + amount);
    showFloatingPoints(amount);
    const inline = document.getElementById('points-inline');
    if (inline) {
        inline.classList.add('pop');
        setTimeout(() => inline.classList.remove('pop'), 600);
    }
}

function deductPoints(amount) {
    const current = getPoints();
    if (current >= amount) {
        setPoints(current - amount);
        return true;
    }
    return false;
}

function updatePointsDisplay() {
    document.getElementById('points-value').textContent = getPoints();
}

function showFloatingPoints(amount) {
    const el = document.createElement('div');
    el.className = 'floating-points';
    el.textContent = '+' + amount;
    const badge = document.getElementById('points-inline');
    const rect = badge.getBoundingClientRect();
    el.style.left = rect.left + 'px';
    el.style.top = rect.top + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
}

// ====== DAILY LIMIT ======
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

function canAnalyze() {
    const points = getPoints();
    const analyses = getDailyAnalyses();
    return points >= ANALYSIS_COST && analyses < DAILY_LIMIT;
}

function getScanButtonText() {
    const points = getPoints();
    const analyses = getDailyAnalyses();
    const canDo = points >= ANALYSIS_COST && analyses < DAILY_LIMIT;

    if (!canDo) {
        if (points < ANALYSIS_COST) {
            return '🔒 Χρειάζεσαι 15 πόντους (Κέρδισε με διαφήμιση)';
        } else {
            return '🔒 Ημερήσιο όριο (5/5 αναλύσεις)';
        }
    } else {
        return '🔮 Ανάλυση Φλιτζανιού (15 πόντοι)';
    }
}

function updateScanButton() {
    const btn = document.getElementById('scanBtn');
    const canDo = canAnalyze();
    btn.disabled = !canDo;
    btn.textContent = getScanButtonText();
    if (currentLang !== 'el') {
        translateSingleElement(btn, btn.textContent, currentLang);
    }
}

// ====== EARN POINTS (Ad) ======
async function earnPoints() {
    if (isWatchingAds) return;
    isWatchingAds = true;

    const earnBtn = document.getElementById('earnBtn');
    const originalText = earnBtn.textContent;
    earnBtn.disabled = true;
    earnBtn.textContent = '⏳ Φόρτωση διαφήμισης...';

    try {
        const result = await showRewardedAd();
        if (result && result.done) {
            addPoints(10);
            alert('Συγχαρητήρια! Κέρδισες 10 πόντους!');
        } else {
            alert('Η διαφήμιση δεν ολοκληρώθηκε. Δοκίμασε ξανά.');
        }
    } catch (error) {
        alert('Σφάλμα διαφήμισης: ' + (error?.message || error));
        console.error('Adsgram error:', error);
    } finally {
        isWatchingAds = false;
        earnBtn.disabled = false;
        earnBtn.textContent = originalText;
        updateScanButton();
    }
}

// ====== LIFELINE ROLLUP ======
// (παραμένει ίδιο)
function startLifelineCycle() {
    stopLifelineCycle();
    function showBanner() {
        const splashPage = document.getElementById('splash');
        if (!splashPage.classList.contains('active')) {
            lifelineShowTimer = setTimeout(showBanner, 1000);
            return;
        }
        const rollup = document.getElementById('lifeline-rollup');
        rollup.classList.add('visible');
        lifelineHideTimer = setTimeout(() => {
            rollup.classList.remove('visible');
            lifelineShowTimer = setTimeout(showBanner, 5000);
        }, 5000);
    }
    lifelineShowTimer = setTimeout(showBanner, 5000);
}
function stopLifelineCycle() {
    if (lifelineShowTimer) { clearTimeout(lifelineShowTimer); lifelineShowTimer = null; }
    if (lifelineHideTimer) { clearTimeout(lifelineHideTimer); lifelineHideTimer = null; }
    const rollup = document.getElementById('lifeline-rollup');
    if (rollup) { rollup.classList.remove('visible'); }
}
function hideLifelineRollup() { stopLifelineCycle(); }

// ====== CAMERA & IMAGE HANDLING ======
// (παραμένει ίδιο με πριν)
// ...

// ====== REGISTRATION & REFERRAL ======
async function registerUser() {
    if (!currentUserId) return;
    const startParam = tgWebApp?.initDataUnsafe?.start_param || '';
    const user = tgWebApp?.initDataUnsafe?.user || {};

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUserId,
                start_param: startParam,
                first_name: user.first_name || '',
                last_name: user.last_name || '',
                username: user.username || '',
                language_code: user.language_code || ''
            })
        });
        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('omen_user_data', JSON.stringify(data));
            updateUIWithUserData(data);
            // Ενημέρωση του referral count αν χρειάζεται
            updateReferralCountDisplay();
        }
    } catch (e) {
        console.error('Registration error:', e);
    }
}

async function shareReferralLink() {
    if (!currentUserId) {
        alert('Πρέπει να είσαι συνδεδεμένος μέσω Telegram.');
        return;
    }
    // Πρώτα προβολή διαφήμισης
    if (!AdController) {
        alert('Η διαφήμιση δεν είναι ακόμα διαθέσιμη. Προσπάθησε ξανά σε λίγο.');
        return;
    }
    try {
        const result = await showRewardedAd();
        if (result && result.done) {
            // Επιτυχής ολοκλήρωση διαφήμισης -> άνοιγμα share link
            const referralLink = `https://t.me/${OFFICIAL_BOT_USERNAME}/app?startapp=ref_${currentUserId}`;
            const shareText = encodeURIComponent('🔮 Ανακάλυψε το μέλλον σου με την καφεμαντεία! Μπες στο Omen και κέρδισε 50 πόντους! ✨\n' + referralLink);
            const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${shareText}`;

            if (tgWebApp) {
                tgWebApp.openTelegramLink(shareUrl);
            } else {
                window.open(shareUrl, '_blank');
            }
        } else {
            alert('Πρέπει να ολοκληρώσεις τη διαφήμιση για να μοιραστείς το link.');
        }
    } catch (error) {
        alert('Η διαφήμιση δεν ολοκληρώθηκε. Δεν μπορείς να μοιραστείς το link τώρα.');
    }
}

async function updateReferralCountDisplay() {
    if (!currentUserId) return;
    try {
        const res = await fetch(`/api/referral-count/${currentUserId}`);
        if (res.ok) {
            const data = await res.json();
            const count = data.successful_invites;
            const max = data.max_invites;
            const inviteBtn = document.querySelector('button[onclick="shareReferralLink()"]');
            if (inviteBtn) {
                inviteBtn.textContent = `👥 Πρόσκληση Φίλων (${count}/${max})`;
                if (currentLang !== 'el') {
                    translateSingleElement(inviteBtn, inviteBtn.textContent, currentLang);
                }
            }
        }
    } catch (e) {}
}

// ====== INIT ======
function initTelegramWebApp() {
    if (window.Telegram && window.Telegram.WebApp) {
        tgWebApp = window.Telegram.WebApp;
        tgWebApp.ready();
        tgWebApp.expand();
        tgWebApp.setHeaderColor('#0a0a12');
        tgWebApp.setBackgroundColor('#0a0a12');
        if (tgWebApp.initDataUnsafe && tgWebApp.initDataUnsafe.user) {
            currentUserId = tgWebApp.initDataUnsafe.user.id;
        } else {
            let id = localStorage.getItem('omen_test_user_id');
            if (!id) {
                id = Date.now();
                localStorage.setItem('omen_test_user_id', id);
            }
            currentUserId = parseInt(id);
        }
        registerUser();
    } else {
        let id = localStorage.getItem('omen_test_user_id');
        if (!id) {
            id = Date.now();
            localStorage.setItem('omen_test_user_id', id);
        }
        currentUserId = parseInt(id);
        registerUser();
    }
}

async function loadUserData() {
    if (!currentUserId) return;
    try {
        const res = await fetch(`/api/user/${currentUserId}`);
        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('omen_user_data', JSON.stringify(data));
            updateUIWithUserData(data);
            updateReferralCountDisplay();
        }
    } catch (e) {}
}

function updateUIWithUserData(data) {
    if (data.points !== undefined) setPoints(data.points);
    userStarsUnlocks = data.stars_unlocks_remaining || 0;
    updateScanButton();
}

// ====== ANALYZE, CAMERA, κλπ. ======
// (Οι υπόλοιπες συναρτήσεις παραμένουν ίδιες όπως στο προηγούμενο πλήρες script.js)
// Εδώ θα βάλω μόνο τα σημεία που αλλάζουν για να μην επαναλάβω ολόκληρο το αρχείο.
// ...
