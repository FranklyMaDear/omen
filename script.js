/**
 * Omen - Καφεμαντεία Mini App
 * Frontend Logic: Referral System, Telegram Stars, AI Analysis
 * Επίσημο Bot: @omenread_bot
 */

// ====== GLOBAL VARIABLES ======
let tgWebApp = null;
let currentUserId = null;
let currentLang = 'el';
let originalTexts = {};
let originalResultText = '';

// Configuration
const API_URL = '/api/analyze';
const ANALYSIS_COST = 15;
const DAILY_LIMIT = 5;
const REFERRAL_REWARD = 20;

// ΕΠΙΣΗΜΟ BOT USERNAME – ΧΡΗΣΙΜΟΠΟΙΕΙΤΑΙ ΠΑΝΤΟΥ
const OFFICIAL_BOT_USERNAME = 'omenread_bot';

// State variables
let isWatchingAds = false;
let isAnalyzing = false;
let currentImageBase64 = null;
let selectedGender = 'f';
let currentStream = null;
let AdController = null;

// Stars & Referral state
let userStarsUnlocks = 0;
let userReferralLink = '';

// ====== TELEGRAM WEBAPP INITIALIZATION ======
function initTelegramWebApp() {
    if (window.Telegram && window.Telegram.WebApp) {
        tgWebApp = window.Telegram.WebApp;
        tgWebApp.ready();
        tgWebApp.expand();

        // Set theme colors
        tgWebApp.setHeaderColor('#0a0a12');
        tgWebApp.setBackgroundColor('#0a0a12');

        // Get user data
        if (tgWebApp.initDataUnsafe && tgWebApp.initDataUnsafe.user) {
            currentUserId = tgWebApp.initDataUnsafe.user.id;
            console.log('✅ Telegram User ID:', currentUserId);
        } else {
            // Fallback αν δεν υπάρχει initData
            console.warn('⚠️ No initData, using fallback');
            currentUserId = getOrCreateTestUserId();
        }

        // Handle viewport changes
        tgWebApp.onEvent('viewportChanged', () => {
            document.body.style.height = tgWebApp.viewportHeight + 'px';
        });

        console.log('✅ Telegram WebApp initialized');
    } else {
        console.log('⚠️ Not running inside Telegram Mini App');
        // Fallback for testing
        currentUserId = getOrCreateTestUserId();
    }
    
    // Τελική δικλείδα ασφαλείας – το currentUserId δεν πρέπει να είναι ποτέ null
    if (!currentUserId) {
        currentUserId = 'unknown_' + Date.now();
        console.error('❌ Could not determine user ID, using emergency fallback:', currentUserId);
    }
}

function getOrCreateTestUserId() {
    let testId = localStorage.getItem('omen_test_user_id');
    if (!testId) {
        testId = 'test_' + Date.now();
        localStorage.setItem('omen_test_user_id', testId);
        console.log('✅ Created test user ID:', testId);
    }
    return testId;
}

// ====== USER DATA MANAGEMENT ======
async function loadUserData() {
    if (!currentUserId) {
        console.warn('⚠️ loadUserData called but currentUserId is null, retrying init...');
        initTelegramWebApp();
        if (!currentUserId) return;
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
    userReferralLink = userData.referral_link || '';

    if (userData.referral_link) {
        localStorage.setItem('omen_referral_link', userData.referral_link);
    }

    updateScanButton();
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
    if (pointsValue) {
        pointsValue.textContent = getPoints();
    }
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

// ====== DAILY LIMIT MANAGEMENT ======
function getToday() {
    return new Date().toISOString().split('T')[0];
}

function getDailyAnalyses() {
    const userData = JSON.parse(localStorage.getItem('omen_user_data') || '{}');
    return parseInt(userData.daily_analyses || localStorage.getItem('omen_daily_count') || '0');
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
        if (points < ANALYSIS_COST) {
            return '🔒 Χρειάζεσαι 15 πόντους | Δες επιλογές';
        } else {
            return '🔒 Ημερήσιο όριο (5/5) | Δες επιλογές';
        }
    } else {
        return '🔮 Ανάλυση Φλιτζανιού (15 πόντοι)';
    }
}

function updateScanButton() {
    const btn = document.getElementById('scanBtn');
    if (!btn) return;

    const canDo = canAnalyze();
    btn.disabled = !canDo;
    btn.textContent = getScanButtonText();

    if (currentLang !== 'el') {
        translateSingleElement(btn, btn.textContent, currentLang);
    }
}

// ====== REFERRAL SYSTEM (ΟΛΑ ΤΑ LINKS ΜΕ omenread_bot) ======

/**
 * Βοηθητική συνάρτηση που επιστρέφει ΠΑΝΤΑ το σωστό referral link
 * Χρησιμοποιεί: 1) το link από το backend (userReferralLink), 
 *               2) αλλιώς το χτίζει με το OFFICIAL_BOT_USERNAME + currentUserId
 *               3) αν όλα αποτύχουν, επιστρέφει το link χωρίς user ID αλλά με σωστό bot
 */
function getReferralLink() {
    // Προτεραιότητα στο link που ήρθε από το backend
    if (userReferralLink && userReferralLink.includes('omenread_bot')) {
        return userReferralLink;
    }
    
    // Αλλιώς χτίζουμε το link με το επίσημο bot username
    if (currentUserId) {
        return `https://t.me/${OFFICIAL_BOT_USERNAME}?start=${currentUserId}`;
    }
    
    // Έσχατη λύση: link χωρίς user ID (ο χρήστης πρέπει να ξαναμπεί)
    console.error('❌ Could not generate referral link - no user ID');
    return `https://t.me/${OFFICIAL_BOT_USERNAME}?start=unknown`;
}

function createInviteModal() {
    // Remove existing modal if present
    const existingModal = document.getElementById('invite-modal');
    if (existingModal) existingModal.remove();

    // ΧΡΗΣΗ ΤΗΣ ΒΟΗΘΗΤΙΚΗΣ ΣΥΝΑΡΤΗΣΗΣ – ΠΑΝΤΑ ΣΩΣΤΟ LINK
    const referralLink = getReferralLink();

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
                    <p style="color: #f7dc6f; font-size: 0.85rem; margin-bottom: 10px;">
                        Το link σου:
                    </p>
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
    // Πριν ανοίξουμε το modal, βεβαιωνόμαστε ότι έχουμε user ID
    if (!currentUserId) {
        console.warn('⚠️ currentUserId is null, reinitializing...');
        initTelegramWebApp();
    }
    createInviteModal();
    document.getElementById('invite-modal').style.display = 'flex';
}

function closeInviteModal() {
    const modal = document.getElementById('invite-modal');
    if (modal) modal.style.display = 'none';
}

function copyReferralLink() {
    const referralLink = getReferralLink();

    navigator.clipboard.writeText(referralLink).then(() => {
        showToast('✅ Το link αντιγράφηκε! Μοιράσου το με φίλους.');
    }).catch(() => {
        // Fallback για παλιότερους browsers
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
    const referralLink = getReferralLink();

    const shareText = encodeURIComponent(
        '🔮 Ανακάλυψε το μέλλον σου με την καφεμαντεία!\n' +
        'Μπες στο Omen και κέρδισε 20 πόντους! ☕✨\n' +
        referralLink
    );

    if (tgWebApp) {
        tgWebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${shareText}`);
    } else {
        window.open(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${shareText}`, '_blank');
    }
}

function shareViaWhatsApp() {
    const referralLink = getReferralLink();

    const shareText = encodeURIComponent(
        '🔮 Ανακάλυψε το μέλλον σου με την καφεμαντεία!\n' +
        'Μπες στο Omen και κέρδισε 20 πόντους! ☕✨\n' +
        referralLink
    );

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

    // Open native share dialog
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

// ====== TELEGRAM STARS (XTR) INTEGRATION ======
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

                // Close any open modals
                const optionsModal = document.getElementById('options-modal');
                if (optionsModal) optionsModal.remove();

                // Start polling for payment status
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
    const maxPolls = 30; // Poll for up to 30 seconds

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
                    // Payment confirmed!
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

    let message = '';
    let buttonsHTML = '';

    if (points < ANALYSIS_COST && userStarsUnlocks === 0) {
        message = 'Δεν έχεις αρκετούς πόντους για ανάλυση. Επίλεξε έναν τρόπο για να συνεχίσεις:';
        buttonsHTML = `
            <button class="btn btn-gold" onclick="document.getElementById('options-modal').remove(); earnPoints();" 
                    style="width: 100%; margin-bottom: 10px; padding: 14px;">
                🎁 Κέρδισε πόντους με διαφήμιση
            </button>
            <button class="btn btn-purple" onclick="document.getElementById('options-modal').remove(); showInviteModal();" 
                    style="width: 100%; margin-bottom: 10px; padding: 14px;">
                👥 Κάλεσε φίλους (+20 πόντοι)
            </button>
            <button class="btn btn-gold" id="unlockStarsBtn" onclick="unlockWithStars()" 
                    style="width: 100%; margin-bottom: 10px; padding: 14px; background: linear-gradient(145deg, #f7dc6f, #d4ac0d);">
                💎 Ξεκλείδωσε με 10 Stars
            </button>
        `;
    } else if (analyses >= DAILY_LIMIT && userStarsUnlocks === 0) {
        message = 'Έφτασες το ημερήσιο όριο αναλύσεων. Θέλεις να συνεχίσεις;';
        buttonsHTML = `
            <button class="btn btn-purple" onclick="document.getElementById('options-modal').remove(); showInviteModal();" 
                    style="width: 100%; margin-bottom: 10px; padding: 14px;">
                👥 Κάλεσε φίλους για bonus πόντους
            </button>
            <button class="btn btn-gold" id="unlockStarsBtn" onclick="unlockWithStars()" 
                    style="width: 100%; margin-bottom: 10px; padding: 14px; background: linear-gradient(145deg, #f7dc6f, #d4ac0d);">
                💎 Ξεκλείδωσε με 10 Stars (παράκαμψη ορίου)
            </button>
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
                <p style="color: #b9a6d4; font-size: 0.8rem; margin-top: 15px;">
                    💡 Με τα Stars μπορείς να παρακάμψεις το ημερήσιο όριο!
                </p>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// ====== MAIN ANALYSIS FUNCTION ======
async function performAnalysis() {
    if (!currentImageBase64 || isAnalyzing) return;

    // Check if user can analyze
    if (!canAnalyze()) {
        showAnalysisOptions();
        return;
    }

    const scanBtn = document.getElementById('scanBtn');
    isAnalyzing = true;
    if (scanBtn) scanBtn.disabled = true;

    // Hide input controls
    const inputControls = document.getElementById('inputControls');
    const genderSelect = document.getElementById('gender-select');
    const previewWrapper = document.getElementById('preview-wrapper');
    const loadingBox = document.getElementById('loading-box');

    if (inputControls) inputControls.style.display = 'none';
    if (genderSelect) genderSelect.style.display = 'none';
    if (previewWrapper) previewWrapper.style.display = 'none';
    if (loadingBox) loadingBox.style.display = 'block';

    // Scroll to loading
    if (loadingBox) loadingBox.scrollIntoView({ behavior: 'smooth' });

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: currentImageBase64,
                gender: selectedGender,
                user_id: currentUserId
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        const data = await response.json();

        if (data.success && data.symbols) {
            // Deduct cost if not using stars
            if (data.method_used !== 'stars') {
                deductPoints(ANALYSIS_COST);
                incrementDailyAnalyses();
            } else {
                userStarsUnlocks--;
                // Refresh user data to get updated stars count
                await loadUserData();
            }

            // Display result
            originalResultText = data.symbols;
            const resultText = document.getElementById('result-text');
            const resultArea = document.getElementById('result-area');

            if (resultText) resultText.textContent = data.symbols;
            if (resultArea) {
                resultArea.style.display = 'block';
                addStarsToResult();
            }

            // Translate if needed
            if (currentLang !== 'el') {
                try {
                    await translateResult(originalResultText, currentLang);
                } catch (e) {
                    console.warn('Translation failed, showing in Greek');
                }
            }

            if (resultArea) resultArea.scrollIntoView({ behavior: 'smooth' });

            // Show share button
            showShareStoryButton();

        } else {
            throw new Error(data.error || 'Unknown error');
        }
    } catch (error) {
        console.error('Analysis error:', error);
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
    if (!resultArea) return;

    // Check if button already exists
    if (document.getElementById('shareStoryBtn')) return;

    const shareBtn = document.createElement('button');
    shareBtn.id = 'shareStoryBtn';
    shareBtn.className = 'btn btn-purple';
    shareBtn.style.cssText = 'margin: 15px auto; display: block; width: 80%; max-width: 300px;';
    shareBtn.textContent = '📸 Μοιράσου το αποτέλεσμα (+5 πόντοι)';
    shareBtn.onclick = shareStory;

    const resetBtn = resultArea.querySelector('.btn-reset');
    if (resetBtn) {
        resetBtn.parentNode.insertBefore(shareBtn, resetBtn);
    } else {
        resultArea.appendChild(shareBtn);
    }
}

// ====== CAMERA & IMAGE HANDLING ======
async function openCamera(facingMode) {
    resetScanUI();

    try {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        currentStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facingMode } }
        });

        const video = document.getElementById('webcam');
        if (video) {
            video.srcObject = currentStream;
        }

        const cameraWrapper = document.getElementById('camera-wrapper');
        const captureBtn = document.getElementById('captureBtn');

        if (cameraWrapper) cameraWrapper.style.display = 'block';
        if (captureBtn) captureBtn.style.display = 'flex';

        if (captureBtn) {
            setTimeout(() => {
                captureBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 300);
        }
    } catch (err) {
        console.error('Camera error:', err);
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
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    currentImageBase64 = canvas.toDataURL('image/jpeg', 0.7);

    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }

    const cameraWrapper = document.getElementById('camera-wrapper');
    const captureBtn = document.getElementById('captureBtn');
    if (cameraWrapper) cameraWrapper.style.display = 'none';
    if (captureBtn) captureBtn.style.display = 'none';

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
    const previewImg = document.getElementById('preview-img');
    const previewWrapper = document.getElementById('preview-wrapper');

    if (previewImg) previewImg.src = imageSrc;
    if (previewWrapper) previewWrapper.style.display = 'block';

    updateScanButton();

    const scanBtn = document.getElementById('scanBtn');
    if (scanBtn) {
        setTimeout(() => {
            scanBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 200);
    }
}

// ====== UI HELPERS ======
function resetScanUI() {
    const elements = {
        'result-area': 'display',
        'camera-wrapper': 'display',
        'captureBtn': 'display',
        'preview-wrapper': 'display',
        'loading-box': 'display'
    };

    Object.keys(elements).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style[elements[id]] = 'none';
    });

    const scanBtn = document.getElementById('scanBtn');
    if (scanBtn) scanBtn.disabled = true;

    // Remove result stars
    document.querySelectorAll('.result-star').forEach(s => s.remove());

    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }

    originalResultText = '';
}

function resetScan() {
    resetScanUI();
    currentImageBase64 = null;
    isAnalyzing = false;

    const elements = {
        'inputControls': 'flex',
        'gender-select': 'flex',
        'scanBtn': 'block'
    };

    Object.keys(elements).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = elements[id];
    });

    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';

    updateScanButton();
}

function addStarsToResult() {
    const resultArea = document.getElementById('result-area');
    if (!resultArea) return;

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

function showToast(message) {
    // Simple toast implementation
    const existingToast = document.getElementById('toast-message');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.id = 'toast-message';
    toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(20, 10, 40, 0.95);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 2px solid rgba(241, 196, 15, 0.5);
        color: #f7dc6f;
        padding: 12px 24px;
        border-radius: 30px;
        z-index: 10000;
        font-weight: 600;
        text-align: center;
        max-width: 90%;
        animation: toastFadeIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastFadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add animation styles
const toastStyles = document.createElement('style');
toastStyles.textContent = `
    @keyframes toastFadeIn {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    @keyframes toastFadeOut {
        from { opacity: 1; transform: translateX(-50%) translateY(0); }
        to { opacity: 0; transform: translateX(-50%) translateY(20px); }
    }
`;
document.head.appendChild(toastStyles);

function selectGender(gender, btn) {
    selectedGender = gender;
    document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
}

// ====== PAGE NAVIGATION ======
function goToScan() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const scanPage = document.getElementById('scan');
    if (scanPage) scanPage.classList.add('active');
    resetScanUI();
    updateScanButton();
}

function goToSplash() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const splashPage = document.getElementById('splash');
    if (splashPage) splashPage.classList.add('active');
}

// ====== CONSENT ======
function checkConsent() {
    const consent = localStorage.getItem('omen_consent');
    const consentOverlay = document.getElementById('consent-overlay');

    if (consent === 'true') {
        if (consentOverlay) consentOverlay.classList.add('hidden');
    } else {
        if (consentOverlay) consentOverlay.classList.remove('hidden');
    }
}

function acceptConsent() {
    localStorage.setItem('omen_consent', 'true');
    const consentOverlay = document.getElementById('consent-overlay');
    if (consentOverlay) consentOverlay.classList.add('hidden');
}

// ====== LEGAL OVERLAYS ======
function showLegal(type) {
    if (type === 'terms') {
        document.getElementById('terms-overlay')?.classList.add('active');
    } else if (type === 'privacy') {
        document.getElementById('privacy-overlay')?.classList.add('active');
    }
}

function closeLegal(type) {
    if (type === 'terms') {
        document.getElementById('terms-overlay')?.classList.remove('active');
    } else if (type === 'privacy') {
        document.getElementById('privacy-overlay')?.classList.remove('active');
    }
}

// ====== EARN POINTS (ADSGRAM) ======
const ADSGRAM_BLOCK_ID = '32708';

function initAdsgram() {
    if (typeof window.Adsgram !== 'undefined') {
        AdController = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
        console.log('✅ Adsgram SDK initialized');
    } else {
        console.warn('⏳ Adsgram SDK not loaded, retrying...');
        setTimeout(initAdsgram, 1000);
    }
}

function showAd() {
    return new Promise((resolve, reject) => {
        if (!AdController) {
            reject('not_ready');
            return;
        }

        AdController.show()
            .then((result) => {
                console.log('✅ Ad finished:', result);
                resolve(result);
            })
            .catch((result) => {
                console.warn('⚠️ Ad error or skipped:', result);
                reject(result);
            });
    });
}

async function earnPoints() {
    if (isWatchingAds) return;
    isWatchingAds = true;

    const earnBtn = document.getElementById('earnBtn');
    const originalText = earnBtn ? earnBtn.textContent : '';

    if (earnBtn) {
        earnBtn.disabled = true;
        earnBtn.textContent = '⏳ Φόρτωση διαφήμισης...';
    }

    try {
        const result = await showAd();
        if (result && result.done) {
            addPoints(10);
            showToast('🎉 Συγχαρητήρια! Κέρδισες 10 πόντους!');
        } else {
            showToast('Η διαφήμιση δεν ολοκληρώθηκε. Δοκίμασε ξανά.');
        }
    } catch (error) {
        showToast('Σφάλμα διαφήμισης: ' + (error?.message || error));
        console.error('Adsgram error:', error);
    } finally {
        isWatchingAds = false;
        if (earnBtn) {
            earnBtn.disabled = false;
            earnBtn.textContent = originalText;
        }
        updateScanButton();
    }
}

// ====== INITIALIZATION ======
document.addEventListener('DOMContentLoaded', function() {
    initTelegramWebApp();
    loadUserData();
    updatePointsDisplay();
    checkConsent();
    updateScanButton();
    initAdsgram();
});

// Handle case where DOM is already loaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(function() {
        initTelegramWebApp();
        loadUserData();
        updatePointsDisplay();
        checkConsent();
        updateScanButton();
        initAdsgram();
    }, 1);
}

// Background stars
function initBackgroundStars() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;

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
}

// Initialize stars
initBackgroundStars();

// ====== TRANSLATION STUBS ======
function translateSingleElement(el, text, targetLang) {
    // Your existing translation logic
}

function translateResult(original, targetLang) {
    // Your existing translation logic
}

function getStoredLanguage() {
    return localStorage.getItem('omen_lang') || 'el';
}

// ====== LIFELINE ROLLUP ======
function startLifelineCycle() {
    // Your existing lifeline logic
}
