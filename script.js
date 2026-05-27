/**
 * Omen - Καφεμαντεία Mini App
 * Frontend Logic: Referral System, Telegram Stars, AI Analysis, Translations, Lifeline Rollup, Sound Effects
 * Επίσημο Bot: @omenread_bot
 */

// ====== GLOBAL VARIABLES ======
let tgWebApp = null;
let currentUserId = null;        // null αν δεν υπάρχει Telegram ID
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
let audioCtx = null;

// ====== SOUND EFFECTS ======
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playMysticSound() {
    try {
        initAudio();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(660, audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
    } catch (e) {}
}

function playSuccessSound() {
    try {
        initAudio();
        const notes = [523, 659, 784];
        notes.forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.15);
            gain.gain.setValueAtTime(0.25, audioCtx.currentTime + i * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.15 + 0.3);
            osc.start(audioCtx.currentTime + i * 0.15);
            osc.stop(audioCtx.currentTime + i * 0.15 + 0.3);
        });
    } catch (e) {}
}

function playAnalysisSound() {
    try {
        initAudio();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(500, audioCtx.currentTime + 0.5);
        osc.frequency.linearRampToValueAtTime(200, audioCtx.currentTime + 1.0);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 1.2);
    } catch (e) {}
}

// ====== TELEGRAM WEBAPP INITIALIZATION ======
function initTelegramWebApp() {
    if (window.Telegram && window.Telegram.WebApp) {
        tgWebApp = window.Telegram.WebApp;
        tgWebApp.ready();
        tgWebApp.expand();
        tgWebApp.setHeaderColor('#0a0a12');
        tgWebApp.setBackgroundColor('#0a0a12');

        if (tgWebApp.initDataUnsafe && tgWebApp.initDataUnsafe.user) {
            currentUserId = tgWebApp.initDataUnsafe.user.id;
            console.log('✅ Telegram User ID:', currentUserId);
        } else {
            console.warn('⚠️ No initData, leaving currentUserId null');
            currentUserId = null;
        }

        tgWebApp.onEvent('viewportChanged', () => {
            document.body.style.height = tgWebApp.viewportHeight + 'px';
        });

        console.log('✅ Telegram WebApp initialized');
    } else {
        console.log('⚠️ Not running inside Telegram Mini App');
        currentUserId = null;
    }
}

// ====== USER DATA MANAGEMENT ======
async function loadUserData() {
    if (!currentUserId) {
        // Δημιουργία guest ID: guest_ + timestamp
        currentUserId = 'guest_' + Date.now();
        console.log('🔹 Generated guest ID:', currentUserId);
    }

    try {
        const response = await fetch(`/api/user/${currentUserId}`);
        if (response.ok) {
            const userData = await response.json();
            localStorage.setItem('omen_user_data', JSON.stringify(userData));
            updateUIWithUserData(userData);
        }
    } catch (e) {
        console.error('Failed to load user data:', e);
    }
}

function updateUIWithUserData(userData) {
    if (userData.points !== undefined) {
        setPoints(userData.points);
    }
    userStarsUnlocks = userData.stars_unlocks_remaining || 0;
    updateScanButton();
}

// ====== POINTS SYSTEM ======
function getPoints() {
    const userData = JSON.parse(localStorage.getItem('omen_user_data') || '{}');
    return parseInt(userData.points || '0');
}

function setPoints(val) {
    const userData = JSON.parse(localStorage.getItem('omen_user_data') || '{}');
    userData.points = val;
    localStorage.setItem('omen_user_data', JSON.stringify(userData));
    updatePointsDisplay();
}

function addPoints(amount) {
    const current = getPoints();
    setPoints(current + amount);
    showFloatingPoints(amount);
    playSuccessSound();
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
    const pointsValue = document.getElementById('points-value');
    if (pointsValue) pointsValue.textContent = getPoints();
}

function showFloatingPoints(amount) {
    const el = document.createElement('div');
    el.className = 'floating-points';
    el.textContent = '+' + amount;
    const badge = document.getElementById('points-inline');
    if (badge) {
        const rect = badge.getBoundingClientRect();
        el.style.left = rect.left + 'px';
        el.style.top = rect.top + 'px';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1500);
    }
}

// ====== DAILY LIMIT ======
function getDailyAnalyses() {
    const userData = JSON.parse(localStorage.getItem('omen_user_data') || '{}');
    return parseInt(userData.daily_analyses || '0');
}

function incrementDailyAnalyses() {
    const userData = JSON.parse(localStorage.getItem('omen_user_data') || '{}');
    userData.daily_analyses = getDailyAnalyses() + 1;
    localStorage.setItem('omen_user_data', JSON.stringify(userData));
}

function canAnalyze() {
    const points = getPoints();
    const analyses = getDailyAnalyses();
    return (points >= ANALYSIS_COST && analyses < DAILY_LIMIT) || userStarsUnlocks > 0;
}

function getScanButtonText() {
    if (userStarsUnlocks > 0) {
        return `🔮 Ανάλυση με Stars (${userStarsUnlocks} διαθέσιμες)`;
    }
    const points = getPoints();
    const analyses = getDailyAnalyses();
    const canDo = points >= ANALYSIS_COST && analyses < DAILY_LIMIT;
    if (!canDo) {
        if (points < ANALYSIS_COST) return '🔒 Χρειάζεσαι 15 πόντους | Δες επιλογές';
        else return '🔒 Ημερήσιο όριο (5/5) | Δες επιλογές';
    }
    return '🔮 Ανάλυση Φλιτζανιού (15 πόντοι)';
}

function updateScanButton() {
    const btn = document.getElementById('scanBtn');
    if (!btn) return;
    btn.disabled = !canAnalyze();
    btn.textContent = getScanButtonText();
    if (currentLang !== 'el') translateSingleElement(btn, btn.textContent, currentLang);
}

// ====== REFERRAL ======
function createInviteModal() {
    const existingModal = document.getElementById('invite-modal');
    if (existingModal) existingModal.remove();

    const userId = currentUserId || 'unknown';
    const referralLink = `https://t.me/${OFFICIAL_BOT_USERNAME}?start=${userId}`;

    const userData = JSON.parse(localStorage.getItem('omen_user_data') || '{}');
    const invites = userData.successful_invites || 0;
    const maxInvites = 10;

    const modalHTML = `
        <div id="invite-modal" class="legal-overlay" style="display:flex;">
            <div class="legal-modal" style="text-align: center; max-width: 450px;">
                <button class="legal-close-btn" onclick="closeInviteModal()">✕</button>
                <div style="font-size: 3rem; margin-bottom: 10px;">🎁</div>
                <h2 style="color: #f7dc6f;">Κάλεσε Φίλους & Κέρδισε!</h2>
                <p style="color: #d5c8e8; margin: 15px 0; line-height: 1.6;">
                    Κέρδισε <strong style="color: #f7dc6f;">20 πόντους</strong> για κάθε φίλο που 
                    κάνει την πρώτη του ανάλυση καφεμαντείας!
                    <br><br>
                    <span style="background: rgba(241,196,15,0.2); padding: 8px 15px; border-radius: 20px; display: inline-block;">
                        👥 ${invites}/${maxInvites} επιτυχημένες προσκλήσεις
                    </span>
                </p>
                <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 15px; margin: 15px 0; word-break: break-all;">
                    <p style="color: #f7dc6f; font-size: 0.85rem; margin-bottom: 10px;">Το link σου:</p>
                    <code style="color: #b9a6d4; font-size: 0.8rem;">${referralLink}</code>
                    <button class="btn btn-gold" onclick="copyReferralLink()" 
                            style="margin-top: 10px; width: 100%; padding: 10px;">
                        📋 Αντιγραφή Link
                    </button>
                </div>
                <button class="btn btn-purple" onclick="shareViaTelegram()" 
                        style="width: 100%; margin-top: 10px; padding: 12px;">
                    📤 Μοιράσου το στο Telegram
                </button>
                <button class="btn btn-gold" onclick="shareViaWhatsApp()" 
                        style="width: 100%; margin-top: 10px; padding: 12px;">
                    💬 Μοιράσου στο WhatsApp
                </button>
                <p style="color: #b9a6d4; font-size: 0.8rem; margin-top: 15px;">
                    ℹ️ Οι πόντοι αποδίδονται μόλις ο φίλος σου κάνει την πρώτη του ανάλυση
                </p>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function showInviteModal() {
    if (!currentUserId) initTelegramWebApp();
    createInviteModal();
    document.getElementById('invite-modal').style.display = 'flex';
}

function closeInviteModal() {
    const modal = document.getElementById('invite-modal');
    if (modal) modal.style.display = 'none';
}

function copyReferralLink() {
    const referralLink = `https://t.me/${OFFICIAL_BOT_USERNAME}?start=${currentUserId || 'unknown'}`;
    navigator.clipboard.writeText(referralLink).then(() => {
        showToast('✅ Το link αντιγράφηκε! Μοιράσου το με φίλους.');
    }).catch(() => {
        const textArea = document.createElement('textarea');
        textArea.value = referralLink;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('✅ Το link αντιγράφηκε!');
    });
}

function shareViaTelegram() {
    const referralLink = `https://t.me/${OFFICIAL_BOT_USERNAME}?start=${currentUserId || 'unknown'}`;
    const shareText = encodeURIComponent('🔮 Ανακάλυψε το μέλλον σου με την καφεμαντεία!\nΜπες στο Omen και κέρδισε 20 πόντους! ☕✨\n' + referralLink);
    if (tgWebApp) {
        tgWebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${shareText}`);
    } else {
        window.open(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${shareText}`, '_blank');
    }
}

function shareViaWhatsApp() {
    const referralLink = `https://t.me/${OFFICIAL_BOT_USERNAME}?start=${currentUserId || 'unknown'}`;
    const shareText = encodeURIComponent('🔮 Ανακάλυψε το μέλλον σου με την καφεμαντεία!\nΜπες στο Omen και κέρδισε 20 πόντους! ☕✨\n' + referralLink);
    window.open(`https://wa.me/?text=${shareText}`, '_blank');
}

// ====== STORY SHARING ======
async function shareStory() {
    try {
        const response = await fetch('/api/share-story', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUserId })
        });
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                addPoints(data.bonus_points);
                showToast(`📸 Κέρδισες ${data.bonus_points} πόντους για το story!`);
            }
        }
    } catch (e) {
        console.error('Share story failed:', e);
    }
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Omen - Καφεμαντεία με AI',
                text: 'Ανακάλυψε τι λέει το φλιτζάνι σου! 🔮',
                url: window.location.href
            });
        } catch (e) {
            console.log('Share cancelled');
        }
    }
}

// ====== TELEGRAM STARS ======
async function unlockWithStars() {
    if (!currentUserId) {
        showToast('Πρέπει να είσαι συνδεδεμένος μέσω Telegram.');
        return;
    }
    const unlockBtn = document.getElementById('unlockStarsBtn');
    if (unlockBtn) {
        unlockBtn.disabled = true;
        unlockBtn.textContent = '⏳ Δημιουργία παραγγελίας...';
    }
    try {
        const response = await fetch('/api/create-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUserId })
        });
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                showToast('💎 Έλεγξε το chat σου με το bot για να ολοκληρώσεις την πληρωμή!');
                const optionsModal = document.getElementById('options-modal');
                if (optionsModal) optionsModal.remove();
                startPaymentStatusPolling();
            }
        } else {
            throw new Error('Failed to create invoice');
        }
    } catch (e) {
        console.error('Unlock with stars failed:', e);
        showToast('❌ Σφάλμα κατά τη δημιουργία της παραγγελίας. Προσπάθησε ξανά.');
    } finally {
        if (unlockBtn) {
            unlockBtn.disabled = false;
            unlockBtn.textContent = '💎 Ξεκλείδωσε με 10 Stars';
        }
    }
}

function startPaymentStatusPolling() {
    let pollCount = 0;
    const maxPolls = 30;
    const pollInterval = setInterval(async () => {
        pollCount++;
        try {
            const response = await fetch('/api/check-payment-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: currentUserId })
            });
            if (response.ok) {
                const data = await response.json();
                if (data.has_stars_access && data.stars_unlocks_remaining > userStarsUnlocks) {
                    clearInterval(pollInterval);
                    userStarsUnlocks = data.stars_unlocks_remaining;
                    await loadUserData();
                    showToast('✅ Η πληρωμή ολοκληρώθηκε! Μπορείς να κάνεις την ανάλυσή σου τώρα!');
                    updateScanButton();
                }
            }
        } catch (e) {
            console.error('Payment polling error:', e);
        }
        if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            showToast('⏰ Η επιβεβαίωση πληρωμής καθυστερεί. Έλεγξε το chat σου ή προσπάθησε ξανά.');
        }
    }, 1000);
}

// ====== ANALYSIS OPTIONS MODAL ======
function showAnalysisOptions() {
    const existingModal = document.getElementById('options-modal');
    if (existingModal) existingModal.remove();
    const points = getPoints();
    const analyses = getDailyAnalyses();
    let message = '', buttonsHTML = '';
    if (points < ANALYSIS_COST && userStarsUnlocks === 0) {
        message = 'Δεν έχεις αρκετούς πόντους για ανάλυση. Επίλεξε έναν τρόπο για να συνεχίσεις:';
        buttonsHTML = `
            <button class="btn btn-gold" onclick="document.getElementById('options-modal').remove(); earnPoints();" style="width: 100%; margin-bottom: 10px; padding: 14px;">🎁 Κέρδισε πόντους με διαφήμιση</button>
            <button class="btn btn-purple" onclick="document.getElementById('options-modal').remove(); showInviteModal();" style="width: 100%; margin-bottom: 10px; padding: 14px;">👥 Κάλεσε φίλους (+20 πόντοι)</button>
            <button class="btn btn-gold" id="unlockStarsBtn" onclick="unlockWithStars()" style="width: 100%; margin-bottom: 10px; padding: 14px; background: linear-gradient(145deg, #f7dc6f, #d4ac0d);">💎 Ξεκλείδωσε με 10 Stars</button>
        `;
    } else if (analyses >= DAILY_LIMIT && userStarsUnlocks === 0) {
        message = 'Έφτασες το ημερήσιο όριο αναλύσεων. Θέλεις να συνεχίσεις;';
        buttonsHTML = `
            <button class="btn btn-purple" onclick="document.getElementById('options-modal').remove(); showInviteModal();" style="width: 100%; margin-bottom: 10px; padding: 14px;">👥 Κάλεσε φίλους για bonus πόντους</button>
            <button class="btn btn-gold" id="unlockStarsBtn" onclick="unlockWithStars()" style="width: 100%; margin-bottom: 10px; padding: 14px; background: linear-gradient(145deg, #f7dc6f, #d4ac0d);">💎 Ξεκλείδωσε με 10 Stars (παράκαμψη ορίου)</button>
        `;
    }
    const modalHTML = `
        <div id="options-modal" class="legal-overlay" style="display:flex;">
            <div class="legal-modal" style="text-align: center; max-width: 450px;">
                <button class="legal-close-btn" onclick="document.getElementById('options-modal').remove()">✕</button>
                <div style="font-size: 3rem; margin-bottom: 10px;">🔮</div>
                <h2 style="color: #f7dc6f; margin-bottom: 15px;">Ξεκλείδωσε την Ανάλυση</h2>
                <p style="color: #d5c8e8; margin: 15px 0; line-height: 1.6;">${message}</p>
                ${buttonsHTML}
                <p style="color: #b9a6d4; font-size: 0.8rem; margin-top: 15px;">💡 Με τα Stars μπορείς να παρακάμψεις το ημερήσιο όριο!</p>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// ====== MAIN ANALYSIS ======
async function performAnalysis() {
    if (!currentImageBase64 || isAnalyzing) return;
    if (!canAnalyze()) {
        showAnalysisOptions();
        return;
    }
    const scanBtn = document.getElementById('scanBtn');
    isAnalyzing = true;
    if (scanBtn) scanBtn.disabled = true;

    const inputControls = document.getElementById('inputControls');
    const genderSelect = document.getElementById('gender-select');
    const previewWrapper = document.getElementById('preview-wrapper');
    const loadingBox = document.getElementById('loading-box');
    if (inputControls) inputControls.style.display = 'none';
    if (genderSelect) genderSelect.style.display = 'none';
    if (previewWrapper) previewWrapper.style.display = 'none';
    if (loadingBox) {
        loadingBox.style.display = 'block';
        loadingBox.scrollIntoView({ behavior: 'smooth' });
    }

    playAnalysisSound();

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: currentImageBase64, gender: selectedGender, user_id: currentUserId })
        });
        if (!response.ok) throw new Error((await response.json()).error || `Server error: ${response.status}`);
        const data = await response.json();
        if (data.success && data.symbols) {
            if (data.method_used !== 'stars') {
                deductPoints(ANALYSIS_COST);
                incrementDailyAnalyses();
            } else {
                userStarsUnlocks--;
                await loadUserData();
            }
            originalResultText = data.symbols;
            const resultText = document.getElementById('result-text');
            const resultArea = document.getElementById('result-area');
            if (resultText) resultText.textContent = data.symbols;
            if (resultArea) {
                resultArea.style.display = 'block';
                addStarsToResult();
            }
            playSuccessSound();

            if (currentLang !== 'el') {
                try { await translateResult(originalResultText, currentLang); } catch (e) {}
            }
            if (resultArea) resultArea.scrollIntoView({ behavior: 'smooth' });
            showShareStoryButton();
        } else {
            throw new Error(data.error || 'Unknown error');
        }
    } catch (error) {
        showToast('🔮 Η Μαντάμ Ζαΐρα συνάντησε ένα εμπόδιο. Δοκίμασε ξανά.');
        resetScan();
    } finally {
        if (loadingBox) loadingBox.style.display = 'none';
        isAnalyzing = false;
        updateScanButton();
    }
}

function showShareStoryButton() {
    const resultArea = document.getElementById('result-area');
    if (!resultArea || document.getElementById('shareStoryBtn')) return;
    const shareBtn = document.createElement('button');
    shareBtn.id = 'shareStoryBtn';
    shareBtn.className = 'btn btn-purple';
    shareBtn.style.cssText = 'margin: 15px auto; display: block; width: 80%; max-width: 300px;';
    shareBtn.textContent = '📸 Μοιράσου το αποτέλεσμα (+5 πόντοι)';
    shareBtn.onclick = shareStory;
    const resetBtn = resultArea.querySelector('.btn-reset');
    if (resetBtn) resetBtn.parentNode.insertBefore(shareBtn, resetBtn);
    else resultArea.appendChild(shareBtn);
}

// ====== CAMERA & IMAGE HANDLING ======
async function openCamera(facingMode) {
    resetScanUI();
    try {
        if (currentStream) currentStream.getTracks().forEach(track => track.stop());
        currentStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode } } });
        const video = document.getElementById('webcam');
        if (video) video.srcObject = currentStream;
        const cameraWrapper = document.getElementById('camera-wrapper');
        const captureBtn = document.getElementById('captureBtn');
        if (cameraWrapper) cameraWrapper.style.display = 'block';
        if (captureBtn) {
            captureBtn.style.display = 'flex';
            setTimeout(() => captureBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 300);
        }
    } catch (err) {
        showToast('Δεν μπόρεσα να ανοίξω την κάμερα. Δοκίμασε το ανέβασμα.');
    }
}

function takePhoto() {
    if (!currentStream) return;
    const video = document.getElementById('webcam');
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    currentImageBase64 = canvas.toDataURL('image/jpeg', 0.7);
    if (currentStream) currentStream.getTracks().forEach(track => track.stop());
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
            currentImageBase64 = compressImage(img, 800, 0.7);
            showPreview(currentImageBase64);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function compressImage(image, maxWidth, quality) {
    const canvas = document.createElement('canvas');
    let width = image.width, height = image.height;
    if (width > maxWidth) {
        const ratio = maxWidth / width;
        width = maxWidth;
        height = height * ratio;
    }
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
}

function showPreview(imageSrc) {
    document.getElementById('preview-img').src = imageSrc;
    document.getElementById('preview-wrapper').style.display = 'block';
    updateScanButton();
    setTimeout(() => document.getElementById('scanBtn').scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 200);
}

// ====== UI HELPERS ======
function resetScanUI() {
    ['result-area','camera-wrapper','captureBtn','preview-wrapper','loading-box'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const scanBtn = document.getElementById('scanBtn');
    if (scanBtn) scanBtn.disabled = true;
    document.querySelectorAll('.result-star').forEach(s => s.remove());
    if (currentStream) { currentStream.getTracks().forEach(t => t.stop()); currentStream = null; }
    originalResultText = '';
}

function resetScan() {
    resetScanUI();
    currentImageBase64 = null;
    isAnalyzing = false;
    document.getElementById('inputControls').style.display = 'flex';
    document.getElementById('gender-select').style.display = 'flex';
    document.getElementById('scanBtn').style.display = 'block';
    document.getElementById('fileInput').value = '';
    updateScanButton();
}

function addStarsToResult() {
    const resultArea = document.getElementById('result-area');
    if (!resultArea) return;
    document.querySelectorAll('.result-star').forEach(s => s.remove());
    const emojis = ['✨','⭐','💫','🌟','✨','🔮','💖','🌙','☽','✧'];
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

function showToast(message) {
    const old = document.getElementById('toast-message');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.id = 'toast-message';
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(20,10,40,0.95);backdrop-filter:blur(10px);border:2px solid rgba(241,196,15,0.5);color:#f7dc6f;padding:12px 24px;border-radius:30px;z-index:10000;font-weight:600;text-align:center;max-width:90%;animation:toastFadeIn 0.3s ease;';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastFadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

(function() {
    const style = document.createElement('style');
    style.textContent = '@keyframes toastFadeIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}@keyframes toastFadeOut{from{opacity:1;transform:translateX(-50%) translateY(0)}to{opacity:0;transform:translateX(-50%) translateY(20px)}}';
    document.head.appendChild(style);
})();

function selectGender(gender, btn) {
    selectedGender = gender;
    document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
}

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

// ====== CONSENT (sessionStorage) ======
function checkConsent() {
    if (sessionStorage.getItem('omen_consent') === 'true') {
        document.getElementById('consent-overlay').classList.add('hidden');
        startLifelineCycle();
        playMysticSound();
    } else {
        document.getElementById('consent-overlay').classList.remove('hidden');
    }
}

function acceptConsent() {
    sessionStorage.setItem('omen_consent', 'true');
    document.getElementById('consent-overlay').classList.add('hidden');
    startLifelineCycle();
    playMysticSound();
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

// ====== ADSGRAM ======
const ADSGRAM_BLOCK_ID = '32708';

function initAdsgram() {
    if (typeof window.Adsgram !== 'undefined') {
        AdController = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
    } else {
        setTimeout(initAdsgram, 1000);
    }
}

function showAd() {
    return new Promise((resolve, reject) => {
        if (!AdController) reject('not_ready');
        else AdController.show().then(resolve).catch(reject);
    });
}

async function earnPoints() {
    if (isWatchingAds) return;
    isWatchingAds = true;
    const earnBtn = document.getElementById('earnBtn');
    const originalText = earnBtn ? earnBtn.textContent : '';
    if (earnBtn) { earnBtn.disabled = true; earnBtn.textContent = '⏳ Φόρτωση διαφήμισης...'; }
    try {
        const result = await showAd();
        if (result && result.done) {
            addPoints(10);
            showToast('🎉 Συγχαρητήρια! Κέρδισες 10 πόντους!');
        } else {
            showToast('Η διαφήμιση δεν ολοκληρώθηκε. Δοκίμασε ξανά.');
        }
    } catch (error) {
        showToast('Σφάλμα διαφήμισης');
    } finally {
        isWatchingAds = false;
        if (earnBtn) { earnBtn.disabled = false; earnBtn.textContent = originalText; }
        updateScanButton();
    }
}

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

function setLanguage(lang) {
    sessionStorage.setItem('omen_lang', lang);
    currentLang = lang;
}

function getStoredLanguage() {
    return sessionStorage.getItem('omen_lang') || 'el';
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

async function translateSingleElement(el, text, targetLang) {
    try {
        var translated = await translateText(text, targetLang);
        var corrected = applyCorrections(translated, targetLang);
        el.textContent = corrected;
    } catch (e) { console.log('Translation error for element:', e); }
}

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
    if (btn) { btn.classList.remove('translating'); btn.textContent = '▶'; btn.disabled = false; }
    var btn2 = document.querySelector('#consent-modal .translate-btn');
    if (btn2) { btn2.classList.remove('translating'); btn2.textContent = '▶'; btn2.disabled = false; }
    var resetBtn = document.getElementById('reset-lang-btn');
    if (resetBtn) resetBtn.style.display = 'flex';
    var resetBtn2 = document.querySelector('#consent-modal .reset-lang-btn');
    if (resetBtn2) resetBtn2.style.display = 'flex';
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

function startTranslationFromConsent() {
    var lang = document.getElementById('consent-language-select').value;
    if (lang === 'el') {
        restoreOriginalTexts();
        setLanguage('el');
        document.querySelector('#consent-modal .reset-lang-btn').style.display = 'none';
        return;
    }
    var btn = document.querySelector('#consent-modal .translate-btn');
    btn.classList.add('translating');
    btn.textContent = '⟳';
    btn.disabled = true;
    setLanguage(lang);
    translatePage(lang).then(() => {
        if (originalResultText && document.getElementById('result-area').style.display !== 'none') {
            translateResult(originalResultText, lang);
        }
    });
}

function resetToGreekFromConsent() {
    restoreOriginalTexts();
    setLanguage('el');
    document.getElementById('consent-language-select').value = 'el';
    document.querySelector('#consent-modal .reset-lang-btn').style.display = 'none';
    if (originalResultText && document.getElementById('result-area').style.display !== 'none') {
        document.getElementById('result-text').textContent = originalResultText;
    }
}

// ====== LANGUAGE DETECTION ======
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
    var consentLangSelect = document.getElementById('consent-language-select');
    if (consentLangSelect) { consentLangSelect.value = mappedLang; }
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
    var consentLabel = document.querySelector('#consent-modal .lang-label');
    if (consentLabel) { consentLabel.textContent = labelMap[mappedLang] || '🌐 Language'; }
    if (mappedLang !== 'el') {
        setLanguage(mappedLang);
        setTimeout(function() { startTranslation(); }, 1000);
    } else {
        setLanguage('el');
    }
}
detectLanguage();

// ====== LIFELINE ROLLUP ======
function startLifelineCycle() {
    stopLifelineCycle();

    function showBanner() {
        const splashPage = document.getElementById('splash');
        if (!splashPage || !splashPage.classList.contains('active')) {
            lifelineShowTimer = setTimeout(showBanner, 1000);
            return;
        }
        const rollup = document.getElementById('lifeline-rollup');
        if (!rollup) return;
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

// ====== BACKGROUND STARS ======
(function() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let stars = [];
    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    window.addEventListener('resize', resize);
    resize();
    for (let i = 0; i < 150; i++) stars.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, r: Math.random()*1.5+0.5, dx: (Math.random()-0.5)*0.4, dy: (Math.random()-0.5)*0.4, a: Math.random()*0.8+0.2 });
    function draw() {
        ctx.clearRect(0,0,canvas.width,canvas.height);
        stars.forEach(s => {
            s.x += s.dx; s.y += s.dy;
            if (s.x<0||s.x>canvas.width) s.dx*=-1;
            if (s.y<0||s.y>canvas.height) s.dy*=-1;
            ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
            ctx.fillStyle = `rgba(255,215,150,${s.a*0.7})`; ctx.fill();
        });
        requestAnimationFrame(draw);
    }
    draw();
})();

// ====== INIT ======
document.addEventListener('DOMContentLoaded', () => {
    initTelegramWebApp();
    loadUserData();
    updatePointsDisplay();
    checkConsent();
    updateScanButton();
    initAdsgram();
});

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => {
        initTelegramWebApp();
        loadUserData();
        updatePointsDisplay();
        checkConsent();
        updateScanButton();
        initAdsgram();
    }, 1);
}
