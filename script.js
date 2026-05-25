// ===== CONSENT =====
function checkConsent() {
    const consent = localStorage.getItem('omen_consent');
    if (consent === 'true') {
        document.getElementById('consent-overlay').classList.add('hidden');
        startLifelineCycle();
    } else {
        document.getElementById('consent-overlay').classList.remove('hidden');
    }
}

function acceptConsent() {
    localStorage.setItem('omen_consent', 'true');
    document.getElementById('consent-overlay').classList.add('hidden');
    startLifelineCycle();
}

// ===== POINTS SYSTEM =====
const BLOCK_ID = '32708'; // Adsgram block ID
const ANALYSIS_COST = 15;
const DAILY_LIMIT = 5;
const AD_POINTS = 10; // Πόντοι που δίνονται για 1 διαφήμιση

let isWatchingAds = false; // Για αποφυγή double click

function getPoints() {
    return parseInt(localStorage.getItem('omen_points') || '0');
}

function setPoints(val) {
    localStorage.setItem('omen_points', val);
    updatePointsBadge();
}

function addPoints(amount) {
    const current = getPoints();
    setPoints(current + amount);
    showFloatingPoints(amount);
    // Κάνε pop animation
    const badge = document.getElementById('points-badge');
    badge.classList.add('pop');
    setTimeout(() => badge.classList.remove('pop'), 600);
}

function deductPoints(amount) {
    const current = getPoints();
    if (current >= amount) {
        setPoints(current - amount);
        return true;
    }
    return false;
}

function updatePointsBadge() {
    document.getElementById('points-value').textContent = getPoints();
}

function showFloatingPoints(amount) {
    const el = document.createElement('div');
    el.className = 'floating-points';
    el.textContent = '+' + amount;
    // Τοποθέτηση κοντά στο badge
    const badge = document.getElementById('points-badge');
    const rect = badge.getBoundingClientRect();
    el.style.left = rect.left + 'px';
    el.style.top = rect.top + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
}

// ===== DAILY LIMIT =====
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

function updateScanButton() {
    const btn = document.getElementById('scanBtn');
    const points = getPoints();
    const analyses = getDailyAnalyses();
    const canDo = points >= ANALYSIS_COST && analyses < DAILY_LIMIT;
    btn.disabled = !canDo;
    if (!canDo) {
        if (points < ANALYSIS_COST) {
            btn.textContent = '🔒 Χρειάζεσαι 15 πόντους (Κέρδισε με διαφήμιση)';
        } else {
            btn.textContent = '🔒 Ημερήσιο όριο (5/5 αναλύσεις)';
        }
    } else {
        btn.textContent = '🔮 Ανάλυση Φλιτζανιού (15 πόντοι)';
    }
}

// ===== EARN POINTS (1 ad, 10 points) =====
async function earnPoints() {
    if (isWatchingAds) return;
    isWatchingAds = true;

    const earnBtn = document.getElementById('earnBtn');
    const originalText = earnBtn.textContent;
    earnBtn.disabled = true;
    earnBtn.textContent = '⏳ Φόρτωση διαφήμισης...';

    try {
        await showAd();
        // Επιτυχής προβολή
        addPoints(AD_POINTS);
        alert('Συγχαρητήρια! Κέρδισες 10 πόντους!');
    } catch (error) {
        // Αποτυχία ή κλείσιμο
        alert('Η διαφήμιση δεν ολοκληρώθηκε. Δοκίμασε ξανά.');
    } finally {
        isWatchingAds = false;
        earnBtn.disabled = false;
        earnBtn.textContent = originalText;
        updateScanButton();
    }
}

function showAd() {
    return new Promise((resolve, reject) => {
        try {
            const controller = new SAD.Adsgram({ blockId: BLOCK_ID });
            controller.show().then(() => {
                // Επιτυχής προβολή
                resolve();
            }).catch((err) => {
                // Αποτυχία ή κλείσιμο
                reject(err);
            });
        } catch (e) {
            reject(e);
        }
    });
}

// ===== LIFELINE ROLL-UP BANNER =====
let lifelineShowTimer = null;
let lifelineHideTimer = null;

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

function hideLifelineRollup() {
    stopLifelineCycle();
}

// ===== LEGAL OVERLAYS =====
function showLegal(type) {
    if (type === 'terms') {
        document.getElementById('terms-overlay').classList.add('active');
    } else if (type === 'privacy') {
        document.getElementById('privacy-overlay').classList.add('active');
    }
}

function closeLegal(type) {
    if (type === 'terms') {
        document.getElementById('terms-overlay').classList.remove('active');
    } else if (type === 'privacy') {
        document.getElementById('privacy-overlay').classList.remove('active');
    }
}

document.addEventListener('click', function(e) {
    if (e.target.classList.contains('legal-overlay')) {
        e.target.classList.remove('active');
    }
});

// ===== TRANSLATION =====
var originalTexts = {};
var currentLang = 'el';

function saveOriginalTexts() {
    document.querySelectorAll('[data-translate="true"]').forEach(function(el) {
        var key = el.outerHTML;
        if (!originalTexts[key]) {
            originalTexts[key] = el.innerHTML.trim();
        }
    });
}
saveOriginalTexts();

var correctionMap = {
    'en': {
        'Coffee schop': 'Coffee Reading', 'coffee schop': 'Coffee Reading',
        'Coffee shop': 'Coffee Reading', 'coffee shop': 'Coffee Reading',
        'Καφεμαντεία': 'Coffee Reading', 'καφεμαντεία': 'Coffee Reading',
        'Καφεμαντεία με AI': 'Coffee Reading with AI', 'καφεμαντεία με AI': 'Coffee Reading with AI',
        'Ανάλυση Φλιτζανιού': 'Cup Analysis', 'ανάλυση φλιτζανιού': 'Cup Analysis',
        'Η Ετυμηγορία του Καφέ': 'The Coffee Verdict', 'η ετυμηγορία του καφέ': 'The Coffee Verdict'
    },
    'de': {
        'Coffee schop': 'Kaffee Lesen', 'coffee schop': 'Kaffee Lesen',
        'Coffee shop': 'Kaffee Lesen', 'coffee shop': 'Kaffee Lesen',
        'Καφεμαντεία': 'Kaffee Lesen', 'καφεμαντεία': 'Kaffee Lesen',
        'Καφεμαντεία mit AI': 'Kaffee Lesen mit AI', 'καφεμαντεία mit AI': 'Kaffee Lesen mit AI'
    },
    'fr': {
        'Coffee schop': 'Lecture de Café', 'coffee schop': 'Lecture de Café',
        'Coffee shop': 'Lecture de Café', 'coffee shop': 'Lecture de Café',
        'Καφεμαντεία': 'Lecture de Café', 'καφεμαντεία': 'Lecture de Café',
        'Καφεμαντεία avec AI': 'Lecture de Café avec AI', 'καφεμαντεία avec AI': 'Lecture de Café avec AI'
    },
    'es': {
        'Coffee schop': 'Lectura de Café', 'coffee schop': 'Lectura de Café',
        'Coffee shop': 'Lectura de Café', 'coffee shop': 'Lectura de Café',
        'Καφεμαντεία': 'Lectura de Café', 'καφεμαντεία': 'Lectura de Café',
        'Καφεμαντεία con AI': 'Lectura de Café con AI', 'καφεμαντεία con AI': 'Lectura de Café con AI'
    },
    'it': {
        'Coffee schop': 'Lettura del Caffè', 'coffee schop': 'Lettura del Caffè',
        'Coffee shop': 'Lettura del Caffè', 'coffee shop': 'Lettura del Caffè',
        'Καφεμαντεία': 'Lettura del Caffè', 'καφεμαντεία': 'Lettura del Caffè',
        'Καφεμαντεία con AI': 'Lettura del Caffè con AI', 'καφεμαντεία con AI': 'Lettura del Caffè con AI'
    },
    'ar': { 'Coffee schop': 'قراءة الفنجان', 'Coffee shop': 'قراءة الفنجان', 'Καφεμαντεία': 'قراءة الفنجان' },
    'zh-CN': { 'Coffee schop': '咖啡占卜', 'Coffee shop': '咖啡占卜', 'Καφεμαντεία': '咖啡占卜' },
    'ja': { 'Coffee schop': 'コーヒー占い', 'Coffee shop': 'コーヒー占い', 'Καφεμαντεία': 'コーヒー占い' },
    'ru': { 'Coffee schop': 'Гадание на кофе', 'Coffee shop': 'Гадание на кофе', 'Καφεμαντεία': 'Гадание на кофе' },
    'tr': { 'Coffee schop': 'Kahve Falı', 'Coffee shop': 'Kahve Falı', 'Καφεμαντεία': 'Kahve Falı' }
};

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
        currentLang = 'el';
        document.getElementById('reset-lang-btn').style.display = 'none';
        return;
    }

    var btn = document.getElementById('translate-btn');
    btn.classList.add('translating');
    btn.textContent = '⟳';

    translatePage(lang);
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
        document.getElementById('translate-btn').classList.remove('translating');
        document.getElementById('translate-btn').textContent = '▶';
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
        } catch (e) {
            console.log('Translation error:', e);
        }
    }

    currentLang = targetLang;
    document.getElementById('translate-btn').classList.remove('translating');
    document.getElementById('translate-btn').textContent = '▶';
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
            if (data[0][i][0]) {
                translatedText += data[0][i][0];
            }
        }
        translations = translatedText.split('|||');
    }
    return translations;
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
    currentLang = 'el';
    document.getElementById('language-select').value = 'el';
    document.getElementById('reset-lang-btn').style.display = 'none';
}

function detectLanguage() {
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

    var langSelect = document.getElementById('language-select');
    if (langSelect) { langSelect.value = mappedLang; }

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
    if (label) { label.textContent = labelMap[mappedLang] || '🌐 Language'; }

    if (mappedLang !== 'el') {
        setTimeout(function() { startTranslation(); }, 1000);
    }
}
detectLanguage();

// ===== BACKGROUND STARS =====
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

// ===== PAGE NAVIGATION =====
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

// ===== GENDER SELECTION =====
let selectedGender = 'f';

function selectGender(gender, btn) {
    selectedGender = gender;
    document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

// ===== API URL =====
const API_URL = 'https://franklymadear-omenread.hf.space/analyze';

const video = document.getElementById('webcam');
let currentStream = null;
let currentImageBase64 = null;
let isAnalyzing = false;

function resetScanUI() {
    document.getElementById('result-area').style.display = 'none';
    document.getElementById('camera-wrapper').style.display = 'none';
    document.getElementById('captureBtn').style.display = 'none';
    document.getElementById('preview-wrapper').style.display = 'none';
    document.getElementById('scanBtn').disabled = true;
    document.getElementById('loading-box').style.display = 'none';
    document.querySelectorAll('.result-star').forEach(s => s.remove());
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
}

function resetScan() {
    resetScanUI();
    currentImageBase64 = null;
    isAnalyzing = false;
    document.getElementById('inputControls').style.display = 'flex';
    document.getElementById('gender-select').style.display = 'flex';
    document.getElementById('scanBtn').style.display = 'block';
    document.getElementById('fileInput').value = "";
    updateScanButton();
}

async function openCamera(facingMode) {
    resetScanUI();
    try {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }
        currentStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facingMode } }
        });
        video.srcObject = currentStream;
        document.getElementById('camera-wrapper').style.display = 'block';
        document.getElementById('captureBtn').style.display = 'flex';
    } catch (err) {
        alert("Δεν μπόρεσα να ανοίξω την κάμερα. Δοκίμασε το 'Ανέβασμα'.");
    }
}

function takePhoto() {
    if (!currentStream) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    currentImageBase64 = canvas.toDataURL('image/jpeg', 0.7);

    currentStream.getTracks().forEach(track => track.stop());
    document.getElementById('camera-wrapper').style.display = 'none';
    document.getElementById('captureBtn').style.display = 'none';
    showPreview(currentImageBase64);
}

function handleUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    resetScanUI();

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const compressed = compressImage(img, 800, 0.7);
            currentImageBase64 = compressed;
            showPreview(currentImageBase64);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
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

function showPreview(imageSrc) {
    document.getElementById('preview-img').src = imageSrc;
    document.getElementById('preview-wrapper').style.display = 'block';
    updateScanButton();
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

async function startAnalysis() {
    if (!currentImageBase64 || isAnalyzing) return;
    if (!canAnalyze()) {
        alert('Δεν έχετε αρκετούς πόντους ή έχετε φτάσει το ημερήσιο όριο.');
        return;
    }

    const scanBtn = document.getElementById('scanBtn');
    isAnalyzing = true;
    scanBtn.disabled = true;
    scanBtn.style.display = 'none';

    document.getElementById('inputControls').style.display = 'none';
    document.getElementById('gender-select').style.display = 'none';
    document.getElementById('preview-wrapper').style.display = 'none';

    const loadingBox = document.getElementById('loading-box');
    loadingBox.style.display = 'block';
    loadingBox.scrollIntoView({ behavior: 'smooth' });

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: currentImageBase64,
                gender: selectedGender
            })
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        const data = await response.json();

        if (data.success && data.symbols) {
            // Αφαίρεση πόντων και αύξηση ημερήσιου μετρητή
            deductPoints(ANALYSIS_COST);
            incrementDailyAnalyses();

            document.getElementById('result-text').textContent = data.symbols;
            document.getElementById('result-area').style.display = 'block';
            addStarsToResult();
            document.getElementById('result-area').scrollIntoView({ behavior: 'smooth' });
        } else {
            throw new Error(data.error || "Άγνωστο σφάλμα");
        }
    } catch (error) {
        alert("🔮 Η Μαντάμ Ζαΐρα συνάντησε ένα πνευματικό εμπόδιο. Δοκίμασε ξανά.");
        resetScan();
    } finally {
        document.getElementById('loading-box').style.display = 'none';
        isAnalyzing = false;
        updateScanButton();
    }
}

// ===== INIT =====
updatePointsBadge();
checkConsent();
updateScanButton();
