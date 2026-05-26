"""
Omen - Καφεμαντεία Mini App για Telegram
Backend: Flask + python-telegram-bot v20+
Περιλαμβάνει: Referral System, Telegram Stars (XTR), AI Analysis
Επίσημο Bot: @omenread_bot
"""

import logging
import os
import json
import asyncio
import base64
import re
from datetime import datetime, date, timedelta
from io import BytesIO

from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS

from telegram import (
    Bot, Update, InlineKeyboardButton, InlineKeyboardMarkup,
    LabeledPrice, WebAppInfo
)
from telegram.ext import (
    Application, CommandHandler, MessageHandler,
    PreCheckoutQueryHandler, CallbackContext, filters as telegram_filters
)
from telegram.constants import ParseMode

import sqlite3
import httpx
from PIL import Image

# ====== CONFIGURATION ======
TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "YOUR_BOT_TOKEN_HERE")
WEBHOOK_URL = os.environ.get("WEBHOOK_URL", "https://your-server.com/webhook")
ADMIN_USER_ID = int(os.environ.get("ADMIN_USER_ID", "123456789"))
HUGGINGFACE_API_URL = os.environ.get(
    "HUGGINGFACE_API_URL",
    "https://api-inference.huggingface.co/models/your-model-name"
)
HUGGINGFACE_API_KEY = os.environ.get("HUGGINGFACE_API_KEY", "hf_your_api_key_here")
MINI_APP_URL = os.environ.get("MINI_APP_URL", "https://your-server.com")

# ΕΠΙΣΗΜΟ BOT USERNAME
OFFICIAL_BOT_USERNAME = "omenread_bot"

# Constants
ANALYSIS_COST = 15
DAILY_LIMIT = 5
REFERRAL_REWARD = 20
MAX_SUCCESSFUL_INVITES = 10
STAR_UNLOCK_AMOUNT = 10
STORY_SHARE_BONUS = 5

# ====== LOGGING ======
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# ====== FLASK APP ======
flask_app = Flask(__name__)
CORS(flask_app)

# ====== TELEGRAM BOT APPLICATION ======
telegram_app = Application.builder().token(TOKEN).build()
bot_instance = telegram_app.bot

# ====== DATABASE SETUP ======
DATABASE_PATH = "omen_users.db"

def get_db_connection():
    """Δημιουργεί σύνδεση με τη βάση δεδομένων"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_database():
    """Αρχικοποίηση της βάσης δεδομένων με όλους τους πίνακες"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Πίνακας χρηστών
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            first_name TEXT,
            last_name TEXT,
            language_code TEXT,
            points INTEGER DEFAULT 0,
            daily_analyses INTEGER DEFAULT 0,
            last_analysis_date TEXT,
            total_analyses INTEGER DEFAULT 0,
            referrer_id INTEGER,
            successful_invites INTEGER DEFAULT 0,
            total_stars_spent INTEGER DEFAULT 0,
            stars_unlocks_remaining INTEGER DEFAULT 0,
            joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
            last_active_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (referrer_id) REFERENCES users(user_id)
        )
    ''')

    # Πίνακας παραπομπών (referrals)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS referrals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referrer_id INTEGER NOT NULL,
            referred_user_id INTEGER NOT NULL UNIQUE,
            reward_granted INTEGER DEFAULT 0,
            referred_at TEXT DEFAULT CURRENT_TIMESTAMP,
            reward_granted_at TEXT,
            FOREIGN KEY (referrer_id) REFERENCES users(user_id),
            FOREIGN KEY (referred_user_id) REFERENCES users(user_id)
        )
    ''')

    # Πίνακας συναλλαγών Stars
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS star_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount INTEGER NOT NULL,
            telegram_payment_charge_id TEXT UNIQUE,
            payload TEXT,
            status TEXT DEFAULT 'completed',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        )
    ''')

    # Πίνακας ιστορικού αναλύσεων
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS analysis_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            image_hash TEXT,
            result_text TEXT,
            gender TEXT,
            unlocked_via TEXT DEFAULT 'points',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        )
    ''')

    conn.commit()
    conn.close()
    logger.info("✅ Database initialized successfully")

init_database()

# ====== HELPER FUNCTIONS ======

def get_user(user_id):
    """Ανάκτηση χρήστη από τη βάση"""
    conn = get_db_connection()
    user = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(user) if user else None

def create_or_update_user(user_id, username=None, first_name=None, last_name=None, 
                          language_code=None, referrer_id=None):
    """Δημιουργεί ή ενημερώνει έναν χρήστη"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Έλεγχος ύπαρξης χρήστη
    existing = cursor.execute(
        "SELECT user_id FROM users WHERE user_id = ?", (user_id,)
    ).fetchone()

    if not existing:
        # Δημιουργία νέου χρήστη
        cursor.execute('''
            INSERT INTO users (
                user_id, username, first_name, last_name, language_code,
                referrer_id, points, daily_analyses
            ) VALUES (?, ?, ?, ?, ?, ?, 0, 0)
        ''', (user_id, username, first_name, last_name, language_code, referrer_id))

        # Αν υπάρχει referrer, καταγραφή παραπομπής
        if referrer_id and referrer_id != user_id and referrer_id != 0:
            try:
                cursor.execute('''
                    INSERT OR IGNORE INTO referrals (referrer_id, referred_user_id)
                    VALUES (?, ?)
                ''', (referrer_id, user_id))
                logger.info(f"✅ Referral recorded: {referrer_id} -> {user_id}")
            except Exception as e:
                logger.error(f"Referral insertion error: {e}")

        logger.info(f"✅ New user created: {user_id}")
    else:
        # Ενημέρωση υπάρχοντος χρήστη
        cursor.execute('''
            UPDATE users 
            SET username = COALESCE(?, username),
                first_name = COALESCE(?, first_name),
                last_name = COALESCE(?, last_name),
                last_active_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        ''', (username, first_name, last_name, user_id))

    conn.commit()
    conn.close()

def grant_referral_reward(referred_user_id):
    """Δίνει το reward στον referrer μετά την πρώτη ανάλυση"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Βρες τον referrer και την κατάσταση του reward
    referral = cursor.execute('''
        SELECT r.id, r.referrer_id, r.reward_granted, u.successful_invites
        FROM referrals r
        JOIN users u ON r.referrer_id = u.user_id
        WHERE r.referred_user_id = ? AND r.reward_granted = 0
    ''', (referred_user_id,)).fetchone()

    if referral and referral['successful_invites'] < MAX_SUCCESSFUL_INVITES:
        # Δώσε πόντους στον referrer
        cursor.execute('''
            UPDATE users 
            SET points = points + ?,
                successful_invites = successful_invites + 1
            WHERE user_id = ? AND successful_invites < ?
        ''', (REFERRAL_REWARD, referral['referrer_id'], MAX_SUCCESSFUL_INVITES))

        # Μαρκάρισε το reward ως δοσμένο
        cursor.execute('''
            UPDATE referrals 
            SET reward_granted = 1, reward_granted_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (referral['id'],))

        conn.commit()

        # Προσπάθησε να ειδοποιήσεις τον referrer
        try:
            asyncio.run(send_referral_notification(referral['referrer_id']))
        except Exception as e:
            logger.warning(f"Could not send referral notification: {e}")

        logger.info(f"✅ Referral reward granted: {referral['referrer_id']} got {REFERRAL_REWARD} points")

    conn.close()

async def send_referral_notification(referrer_id):
    """Στέλνει ειδοποίηση στον referrer"""
    try:
        await bot_instance.send_message(
            chat_id=referrer_id,
            text=(
                "🎉 *Συγχαρητήρια!*\n\n"
                "Κάποιος που κάλεσες μόλις έκανε την πρώτη του ανάλυση καφεμαντείας!\n"
                f"Κέρδισες *{REFERRAL_REWARD} πόντους*! 💎\n\n"
                "Συνέχισε να καλείς φίλους για περισσότερους πόντους! 🔮"
            ),
            parse_mode=ParseMode.MARKDOWN
        )
    except Exception as e:
        logger.error(f"Failed to notify referrer {referrer_id}: {e}")

def can_user_analyze(user_id):
    """Ελέγχει αν ο χρήστης μπορεί να κάνει ανάλυση"""
    user = get_user(user_id)
    if not user:
        return False, "User not found"

    today = date.today().isoformat()

    # Reset ημερήσιου μετρητή αν είναι νέα μέρα
    if user['last_analysis_date'] != today:
        conn = get_db_connection()
        conn.execute(
            "UPDATE users SET daily_analyses = 0, last_analysis_date = ? WHERE user_id = ?",
            (today, user_id)
        )
        conn.commit()
        conn.close()
        user['daily_analyses'] = 0

    # Έλεγχος αν έχει stars unlocks
    if user['stars_unlocks_remaining'] > 0:
        return True, "stars"

    # Έλεγχος πόντων και ημερήσιου ορίου
    if user['points'] < ANALYSIS_COST:
        return False, "insufficient_points"
    if user['daily_analyses'] >= DAILY_LIMIT:
        return False, "daily_limit"

    return True, "points"

def deduct_analysis_cost(user_id, method='points'):
    """Αφαιρεί το κόστος ανάλυσης"""
    conn = get_db_connection()
    cursor = conn.cursor()

    if method == 'stars':
        cursor.execute('''
            UPDATE users 
            SET stars_unlocks_remaining = stars_unlocks_remaining - 1,
                daily_analyses = daily_analyses + 1,
                total_analyses = total_analyses + 1,
                last_analysis_date = ?
            WHERE user_id = ? AND stars_unlocks_remaining > 0
        ''', (date.today().isoformat(), user_id))
    else:
        cursor.execute('''
            UPDATE users 
            SET points = points - ?,
                daily_analyses = daily_analyses + 1,
                total_analyses = total_analyses + 1,
                last_analysis_date = ?
            WHERE user_id = ? AND points >= ?
        ''', (ANALYSIS_COST, date.today().isoformat(), user_id, ANALYSIS_COST))

    conn.commit()
    conn.close()

def add_analysis_to_history(user_id, image_hash, result_text, gender, unlocked_via):
    """Καταγράφει την ανάλυση στο ιστορικό"""
    conn = get_db_connection()
    conn.execute('''
        INSERT INTO analysis_history (user_id, image_hash, result_text, gender, unlocked_via)
        VALUES (?, ?, ?, ?, ?)
    ''', (user_id, image_hash, result_text, gender, unlocked_via))
    conn.commit()
    conn.close()

def compress_and_hash_image(base64_image):
    """Συμπιέζει την εικόνα και δημιουργεί ένα hash"""
    try:
        # Αποκωδικοποίηση base64
        if ',' in base64_image:
            base64_image = base64_image.split(',')[1]

        image_data = base64.b64decode(base64_image)
        img = Image.open(BytesIO(image_data))

        # Συμπίεση
        img = img.convert('RGB')
        max_size = (800, 800)
        img.thumbnail(max_size, Image.LANCZOS)

        # Δημιουργία hash (απλό παράδειγμα)
        import hashlib
        img_bytes = BytesIO()
        img.save(img_bytes, format='JPEG', quality=70)
        image_hash = hashlib.md5(img_bytes.getvalue()).hexdigest()

        # Επιστροφή συμπιεσμένης εικόνας
        img_bytes.seek(0)
        compressed_base64 = base64.b64encode(img_bytes.getvalue()).decode('utf-8')

        return compressed_base64, image_hash
    except Exception as e:
        logger.error(f"Image compression error: {e}")
        # Επιστροφή της αρχικής εικόνας αν αποτύχει η συμπίεση
        return base64_image, None

# ====== FLASK API ROUTES ======

@flask_app.route('/')
def serve_mini_app():
    """Σερβίρει το Mini App"""
    try:
        with open('index.html', 'r', encoding='utf-8') as f:
            return render_template_string(f.read())
    except FileNotFoundError:
        return "Mini App index.html not found", 404

@flask_app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})

@flask_app.route('/api/user/<int:user_id>', methods=['GET'])
def get_user_info(user_id):
    """Επιστρέφει πλήρεις πληροφορίες χρήστη"""
    user = get_user(user_id)
    if not user:
        # Δοκίμασε να δημιουργήσεις τον χρήστη
        create_or_update_user(user_id)
        user = get_user(user_id)

    if not user:
        return jsonify({"error": "Failed to create user"}), 500

    # ΧΡΗΣΗ ΤΟΥ ΕΠΙΣΗΜΟΥ BOT USERNAME
    referral_link = f"https://t.me/{OFFICIAL_BOT_USERNAME}?start={user_id}"

    response = {
        "user_id": user['user_id'],
        "username": user['username'],
        "first_name": user['first_name'],
        "points": user['points'],
        "daily_analyses": user['daily_analyses'],
        "total_analyses": user['total_analyses'],
        "successful_invites": user['successful_invites'],
        "total_stars_spent": user['total_stars_spent'],
        "stars_unlocks_remaining": user['stars_unlocks_remaining'],
        "referral_link": referral_link,
        "max_invites": MAX_SUCCESSFUL_INVITES,
        "analysis_cost": ANALYSIS_COST,
        "daily_limit": DAILY_LIMIT,
        "referral_reward": REFERRAL_REWARD
    }

    return jsonify(response)

async def get_bot_username():
    """Επιστρέφει το username του bot"""
    try:
        bot_info = await bot_instance.get_me()
        return bot_info.username
    except:
        return OFFICIAL_BOT_USERNAME  # Fallback στο επίσημο username

@flask_app.route('/api/create-invoice', methods=['POST'])
def create_invoice():
    """Δημιουργεί invoice για Telegram Stars"""
    try:
        data = request.json
        user_id = data.get('user_id')

        if not user_id:
            return jsonify({"error": "Missing user_id"}), 400

        # Δημιουργία μοναδικού payload
        timestamp = int(datetime.now().timestamp())
        payload = f"unlock_analysis_{user_id}_{timestamp}"

        # Δημιουργία invoice μέσω Telegram API
        invoice_result = asyncio.run(send_invoice_async(
            user_id, payload
        ))

        return jsonify({
            "success": True,
            "message": "Invoice sent to Telegram chat",
            "payload": payload
        })

    except Exception as e:
        logger.error(f"Invoice creation error: {e}")
        return jsonify({"error": str(e)}), 500

async def send_invoice_async(user_id, payload):
    """Ασύγχρονη αποστολή invoice"""
    return await bot_instance.send_invoice(
        chat_id=user_id,
        title="Ξεκλείδωμα Ανάλυσης Καφεμαντείας",
        description=(
            "Απόκτησε άμεση πρόσβαση στην ανάλυση του φλιτζανιού σου!\n"
            "• Παράκαμψη ημερήσιου ορίου\n"
            "• Άμεση ανάλυση χωρίς αναμονή\n"
            "• Υποστήριξε την Μαντάμ Ζαΐρα"
        ),
        payload=payload,
        provider_token="",  # Κενό για Telegram Stars
        currency="XTR",
        prices=[LabeledPrice(label="Ανάλυση Φλιτζανιού", amount=STAR_UNLOCK_AMOUNT)],
        start_parameter="unlock_analysis",
        need_name=False,
        need_phone_number=False,
        need_email=False,
        need_shipping_address=False,
        is_flexible=False,
        protect_content=True
    )

@flask_app.route('/api/analyze', methods=['POST'])
def analyze():
    """Κύριο endpoint ανάλυσης εικόνας"""
    try:
        data = request.json
        user_id = data.get('user_id')
        image_base64 = data.get('image')
        gender = data.get('gender', 'f')

        # Επικύρωση δεδομένων
        if not user_id:
            return jsonify({"success": False, "error": "Missing user_id"}), 400
        if not image_base64:
            return jsonify({"success": False, "error": "Missing image data"}), 400

        # Έλεγχος αν ο χρήστης μπορεί να κάνει ανάλυση
        can_analyze, method = can_user_analyze(user_id)
        if not can_analyze:
            error_messages = {
                "insufficient_points": f"Χρειάζεσαι {ANALYSIS_COST} πόντους",
                "daily_limit": f"Έφτασες το ημερήσιο όριο ({DAILY_LIMIT} αναλύσεις)"
            }
            return jsonify({
                "success": False,
                "error": error_messages.get(method, "Cannot analyze"),
                "reason": method
            }), 403

        # Συμπίεση εικόνας
        compressed_image, image_hash = compress_and_hash_image(image_base64)

        # Κλήση στο Hugging Face API (placeholder)
        analysis_result = asyncio.run(call_huggingface_api(compressed_image, gender))

        if not analysis_result:
            return jsonify({
                "success": False,
                "error": "Η ανάλυση απέτυχε. Προσπάθησε ξανά."
            }), 500

        # Αφαίρεση κόστους
        deduct_analysis_cost(user_id, method)

        # Αν είναι η πρώτη ανάλυση, δώσε referral reward
        user = get_user(user_id)
        if user and user['total_analyses'] == 0:
            grant_referral_reward(user_id)

        # Καταγραφή στο ιστορικό
        add_analysis_to_history(user_id, image_hash, analysis_result, gender, method)

        return jsonify({
            "success": True,
            "symbols": analysis_result,
            "method_used": method,
            "analysis_number": (user['total_analyses'] + 1) if user else 1
        })

    except Exception as e:
        logger.error(f"Analysis error: {e}")
        return jsonify({
            "success": False,
            "error": "Εσωτερικό σφάλμα κατά την ανάλυση"
        }), 500

async def call_huggingface_api(image_base64, gender):
    """Καλεί το Hugging Face API για ανάλυση εικόνας"""
    try:
        # Προετοιμασία του prompt με βάση το φύλο
        gender_text = "γυναίκα" if gender == 'f' else "άντρα"

        prompt = (
            "Είσαι η Μαντάμ Ζαΐρα, μια έμπειρη και μυστηριώδης αναγνώστρια φλιτζανιών καφέ. "
            "Ανάλυσε την εικόνα του φλιτζανιού που βλέπεις και δώσε μια λεπτομερή, "
            "ποιητική και μυστικιστική ανάλυση των μοτίβων του καφέ. "
            f"Η ανάλυση απευθύνεται σε μια {gender_text}. "
            "Χρησιμοποίησε παραδοσιακά σύμβολα καφεμαντείας, μετάφρασέ τα σε προσωπικά μηνύματα "
            "και ολοκλήρωσε με μια φράση-κλειδί για το μέλλον.\n\n"
            "Μίλησε στο πρώτο πρόσωπο σαν να είσαι η Μαντάμ Ζαΐρα.\n"
            "Ανάφερε συγκεκριμένα σχήματα ή μοτίβα που 'βλέπεις' στο φλιτζάνι.\n"
            "Κράτησε έναν τόνο μυστηριακό αλλά φιλικό, με δόσεις χιούμορ.\n"
            "Η απάντηση να είναι 3-4 παραγράφους."
        )

        # Σημείωση: Αυτό είναι placeholder - χρησιμοποίησε το δικό σου μοντέλο
        # Για testing, επέστρεψε ένα mock αποτέλεσμα
        mock_result = (
            "🔮 *Η Μαντάμ Ζαΐρα ομιλεί...*\n\n"
            "Αχ, βλέπω τα σκοτεινά μονοπάτια του καφέ να σχηματίζουν έναν αετό στην αριστερή πλευρά του φλιτζανιού. "
            "Ο αετός, αγαπητή μου, είναι το σύμβολο της δύναμης και της ανεξαρτησίας. "
            "Σου ψιθυρίζει ότι σύντομα θα βρεθείς μπροστά σε μια μεγάλη απόφαση που θα αλλάξει τη ζωή σου.\n\n"
            "Στο κέντρο διακρίνω ένα μικρό αστέρι, κρυμμένο ανάμεσα στα κατακάθια. "
            "Αυτό είναι σημάδι ελπίδας και απροσδόκητης βοήθειας. "
            "Κάποιος από το παρελθόν σου θα επιστρέψει με νέα που θα σε εκπλήξουν ευχάριστα.\n\n"
            "Στον πάτο του φλιτζανιού, οι γραμμές ενώνονται σαν ποτάμι. "
            "Το νερό συμβολίζει τα συναισθήματα - να είσαι έτοιμη για μια περίοδο έντονης δημιουργικότητας και έμπνευσης.\n\n"
            "✨ *Μάντρα της ημέρας:* Αγκάλιασε την αλλαγή, γιατί το σύμπαν συνωμοτεί υπέρ σου."
        )

        # TODO: Ενεργοποίησε αυτό όταν έχεις το πραγματικό API key
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                HUGGINGFACE_API_URL,
                headers={
                    "Authorization": f"Bearer {HUGGINGFACE_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "inputs": {
                        "image": image_base64,
                        "prompt": prompt
                    }
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                return result.get('generated_text', mock_result)
            else:
                logger.error(f"HuggingFace API error: {response.status_code}")
                return mock_result
        """

        return mock_result

    except Exception as e:
        logger.error(f"HuggingFace API call error: {e}")
        return None

@flask_app.route('/api/share-story', methods=['POST'])
def share_story():
    """Επιβραβεύει τον χρήστη που μοιράστηκε το αποτέλεσμα ως story"""
    try:
        data = request.json
        user_id = data.get('user_id')

        if not user_id:
            return jsonify({"error": "Missing user_id"}), 400

        conn = get_db_connection()
        conn.execute(
            "UPDATE users SET points = points + ? WHERE user_id = ?",
            (STORY_SHARE_BONUS, user_id)
        )
        conn.commit()
        conn.close()

        return jsonify({
            "success": True,
            "bonus_points": STORY_SHARE_BONUS,
            "message": f"Κέρδισες {STORY_SHARE_BONUS} πόντους!"
        })

    except Exception as e:
        logger.error(f"Story share error: {e}")
        return jsonify({"error": str(e)}), 500

@flask_app.route('/api/check-payment-status', methods=['POST'])
def check_payment_status():
    """Ελέγχει αν μια πληρωμή ολοκληρώθηκε"""
    try:
        data = request.json
        user_id = data.get('user_id')

        if not user_id:
            return jsonify({"error": "Missing user_id"}), 400

        user = get_user(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        return jsonify({
            "has_stars_access": user['stars_unlocks_remaining'] > 0,
            "stars_unlocks_remaining": user['stars_unlocks_remaining'],
            "total_stars_spent": user['total_stars_spent']
        })

    except Exception as e:
        logger.error(f"Payment status check error: {e}")
        return jsonify({"error": str(e)}), 500

# ====== TELEGRAM BOT HANDLERS ======

async def start_command(update: Update, context: CallbackContext):
    """Χειρίζεται την εντολή /start και το deep linking"""
    user = update.effective_user
    args = context.args

    # Ανίχνευση referrer_id από deep link
    referrer_id = None
    if args and len(args) > 0:
        try:
            referrer_id = int(args[0])
        except ValueError:
            referrer_id = None

    # Δημιουργία ή ενημέρωση χρήστη
    create_or_update_user(
        user_id=user.id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        language_code=user.language_code,
        referrer_id=referrer_id
    )

    # Μήνυμα καλωσορίσματος
    welcome_text = (
        "☕ *Καλωσόρισες στο Omen - Καφεμαντεία!*\n\n"
        "Η Μαντάμ Ζαΐρα είναι έτοιμη να διαβάσει τα μυστικά του φλιτζανιού σου.\n"
        "Ανακάλυψε τι σου επιφυλάσσει το μέλλον μέσα από τα κατακάθια του καφέ!\n\n"
        "🔮 *Διαθέσιμες ενέργειες:*\n"
        "• Ανάλυση φλιτζανιού με AI\n"
        "• Κέρδισε πόντους με προσκλήσεις φίλων\n"
        "• Ξεκλείδωσε με Telegram Stars\n"
        "• Μοιράσου τα αποτελέσματά σου"
    )

    if referrer_id and referrer_id != user.id:
        welcome_text += (
            f"\n\n🎁 *Ήρθες μέσω πρόσκλησης!*\n"
            f"Μόλις ολοκληρώσεις την πρώτη σου ανάλυση, "
            f"ο φίλος σου θα κερδίσει {REFERRAL_REWARD} πόντους!"
        )

    # Δημιουργία inline keyboard με το Mini App button
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton(
            text="🔮 Άνοιγμα Omen - Καφεμαντεία",
            web_app=WebAppInfo(url=MINI_APP_URL)
        )],
        [
            InlineKeyboardButton(
                text="📢 Κανάλι Ενημερώσεων",
                url="https://t.me/your_channel"
            ),
            InlineKeyboardButton(
                text="💬 Ομάδα Συζήτησης",
                url="https://t.me/your_group"
            )
        ]
    ])

    await update.message.reply_text(
        welcome_text,
        reply_markup=keyboard,
        parse_mode=ParseMode.MARKDOWN
    )

async def precheckout_callback(update: Update, context: CallbackContext):
    """Επιβεβαιώνει το PreCheckoutQuery"""
    query = update.pre_checkout_query

    # Μπορείς να προσθέσεις επιπλέον επαλήθευση εδώ
    # Π.χ., έλεγχος αν το payload είναι έγκυρο

    await query.answer(ok=True)
    logger.info(f"✅ PreCheckoutQuery approved for user {query.from_user.id}")

async def successful_payment_handler(update: Update, context: CallbackContext):
    """Χειρίζεται επιτυχημένες πληρωμές σε Telegram Stars"""
    payment = update.message.successful_payment
    user_id = update.effective_user.id
    payload = payment.invoice_payload

    logger.info(f"💰 Payment received from user {user_id}: {payment.total_amount} XTR")

    # Καταγραφή συναλλαγής
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Εισαγωγή συναλλαγής
        cursor.execute('''
            INSERT INTO star_transactions 
            (user_id, amount, telegram_payment_charge_id, payload)
            VALUES (?, ?, ?, ?)
        ''', (user_id, payment.total_amount, payment.telegram_payment_charge_id, payload))

        # Ενημέρωση χρήστη
        unlocks_to_add = payment.total_amount // STAR_UNLOCK_AMOUNT
        cursor.execute('''
            UPDATE users 
            SET total_stars_spent = total_stars_spent + ?,
                stars_unlocks_remaining = stars_unlocks_remaining + ?
            WHERE user_id = ?
        ''', (payment.total_amount, unlocks_to_add, user_id))

        conn.commit()

        # Μήνυμα επιβεβαίωσης
        await update.message.reply_text(
            f"✅ *Η πληρωμή ολοκληρώθηκε επιτυχώς!*\n\n"
            f"Απέκτησες *{unlocks_to_add} άμεσες αναλύσεις*!\n"
            f"Μπορείς να τις χρησιμοποιήσεις οποιαδήποτε στιγμή, "
            f"ακόμα κι αν έχεις φτάσει το ημερήσιο όριο.\n\n"
            f"Επίστρεψε στο Omen για να κάνεις την ανάλυσή σου! 🔮",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton(
                    text="🔮 Συνέχεια στο Omen",
                    web_app=WebAppInfo(url=MINI_APP_URL)
                )]
            ]),
            parse_mode=ParseMode.MARKDOWN
        )

    except Exception as e:
        logger.error(f"Payment processing error: {e}")
        await update.message.reply_text(
            "❌ Παρουσιάστηκε σφάλμα κατά την επεξεργασία της πληρωμής. "
            "Παρακαλώ επικοινώνησε με την υποστήριξη."
        )
    finally:
        conn.close()

# ====== WEBHOOK ROUTE ======

@flask_app.route('/webhook', methods=['POST'])
async def webhook():
    """Webhook για λήψη updates από το Telegram"""
    if request.method == "POST":
        try:
            update = Update.de_json(request.get_json(force=True), telegram_app.bot)
            await telegram_app.process_update(update)
            return 'ok', 200
        except Exception as e:
            logger.error(f"Webhook error: {e}")
            return 'error', 500

    return 'Method not allowed', 405

# ====== APPLICATION SETUP ======

def setup_telegram_handlers():
    """Ρύθμιση των handlers του Telegram bot"""
    telegram_app.add_handler(CommandHandler("start", start_command))
    telegram_app.add_handler(PreCheckoutQueryHandler(precheckout_callback))
    telegram_app.add_handler(
        MessageHandler(telegram_filters.SUCCESSFUL_PAYMENT, successful_payment_handler)
    )
    logger.info("✅ Telegram handlers setup complete")

async def setup_webhook():
    """Ρύθμιση του webhook στο Telegram"""
    try:
        await telegram_app.bot.set_webhook(url=WEBHOOK_URL)
        logger.info(f"✅ Webhook set to: {WEBHOOK_URL}")
    except Exception as e:
        logger.error(f"Failed to set webhook: {e}")

# ====== MAIN EXECUTION ======

if __name__ == '__main__':
    # Ρύθμιση handlers
    setup_telegram_handlers()

    # Ρύθμιση webhook
    asyncio.run(setup_webhook())

    # Εκκίνηση Flask server
    logger.info("🚀 Starting Omen Mini App server...")
    flask_app.run(
        host='0.0.0.0',
        port=int(os.environ.get('PORT', 5000)),
        debug=False
    )
