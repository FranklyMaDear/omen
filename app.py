"""
Omen - Καφεμαντεία Mini App
Backend: Flask + python-telegram-bot v20+
Telegram Stars Payments via createInvoiceLink + openInvoice
One-Shot Analysis & Translation via Gemini 2.0 Flash
Νέο σύστημα πόντων, Shop, Referral System
"""

import logging
import os
import json
import asyncio
import base64
import threading
from datetime import datetime, date
from io import BytesIO

from flask import Flask, request, jsonify, render_template_string, send_from_directory
from flask_cors import CORS

import google.generativeai as genai

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
from PIL import Image

# ====== CONFIGURATION ======
TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
WEBHOOK_URL = os.environ.get("WEBHOOK_URL")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
MINI_APP_URL = os.environ.get("MINI_APP_URL", "https://omen.franklymadear.com")

genai.configure(api_key=GEMINI_API_KEY)

# Χρήση του νεότερου σταθερού μοντέλου
gemini_model = genai.GenerativeModel('gemini-1.5-flash')

OFFICIAL_BOT_USERNAME = "omenread_bot"

# ====== ΣΥΣΤΗΜΑ ΠΟΝΤΩΝ ======
ANALYSIS_COST = 15
WELCOME_BONUS = 15
REFERRAL_SENDER_REWARD = 30
REFERRAL_RECEIVER_BONUS = 20
MAX_INVITES_FOR_MILESTONE = 10
MILESTONE_BONUS = 100

# ====== ΠΑΚΕΤΑ STARS ======
STAR_PACKAGES = {
    "starter": {"points": 45, "stars": 50, "label": "Starter (3 αναλύσεις)"},
    "pro":     {"points": 75, "stars": 80, "label": "Pro (5 αναλύσεις)"},
    "expert":  {"points": 150, "stars": 150, "label": "Expert (10 αναλύσεις)"}
}

# ====== LOGGING ======
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

telegram_app = Application.builder().token(TOKEN).build()
bot = telegram_app.bot

DATABASE_PATH = "omen_users.db"

def get_db():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY, username TEXT, first_name TEXT,
        points INTEGER DEFAULT 0, referrer_id INTEGER,
        successful_invites INTEGER DEFAULT 0,
        welcome_bonus_granted INTEGER DEFAULT 0,
        milestone_bonus_granted INTEGER DEFAULT 0)''')
    cur.execute('''CREATE TABLE IF NOT EXISTS referrals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referrer_id INTEGER, referred_user_id INTEGER UNIQUE)''')
    cur.execute('''CREATE TABLE IF NOT EXISTS star_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER, amount INTEGER, payload TEXT)''')
    try:
        cur.execute("ALTER TABLE users ADD COLUMN welcome_bonus_granted INTEGER DEFAULT 0")
        cur.execute("ALTER TABLE users ADD COLUMN milestone_bonus_granted INTEGER DEFAULT 0")
    except:
        pass
    conn.commit()
    conn.close()
    logger.info("✅ Database initialized")

init_db()

def get_user(uid):
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE user_id=?", (uid,)).fetchone()
    conn.close()
    return dict(user) if user else None

def create_or_update_user(uid, username=None, first_name=None, referrer_id=None):
    conn = get_db()
    cur = conn.cursor()
    exist = cur.execute(
        "SELECT user_id, welcome_bonus_granted FROM users WHERE user_id=?", (uid,)
    ).fetchone()

    base_points = REFERRAL_RECEIVER_BONUS if (referrer_id and referrer_id != 0) else WELCOME_BONUS

    if not exist:
        cur.execute('''INSERT INTO users (user_id, username, first_name, referrer_id, points, welcome_bonus_granted)
                       VALUES (?,?,?,?,?,1)''', (uid, username, first_name, referrer_id, base_points))
        if referrer_id and referrer_id != uid and referrer_id != 0:
            try:
                cur.execute("INSERT OR IGNORE INTO referrals (referrer_id, referred_user_id) VALUES (?,?)",
                            (referrer_id, uid))
                cur.execute("UPDATE users SET points=points+?, successful_invites=successful_invites+1 WHERE user_id=?",
                            (REFERRAL_SENDER_REWARD, referrer_id))
                ref = cur.execute(
                    "SELECT successful_invites, milestone_bonus_granted FROM users WHERE user_id=?",
                    (referrer_id,)
                ).fetchone()
                if ref and ref['successful_invites'] >= MAX_INVITES_FOR_MILESTONE and not ref['milestone_bonus_granted']:
                    cur.execute("UPDATE users SET points=points+?, milestone_bonus_granted=1 WHERE user_id=?",
                                (MILESTONE_BONUS, referrer_id))
                    logger.info(f"🏆 Milestone bonus to {referrer_id}")
            except Exception as e:
                logger.error(f"Referral error: {e}")
        logger.info(f"✅ New user {uid} with {base_points} points")
    else:
        if not exist['welcome_bonus_granted']:
            cur.execute("UPDATE users SET points=points+?, welcome_bonus_granted=1 WHERE user_id=?",
                        (base_points, uid))
        cur.execute("UPDATE users SET username=COALESCE(?,username), first_name=COALESCE(?,first_name) WHERE user_id=?",
                    (username, first_name, uid))
    conn.commit()
    conn.close()

def _run_async(coro):
    def run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(coro)
        finally:
            loop.close()
    threading.Thread(target=run, daemon=True).start()

# ====== ΓΛΩΣΣΙΚΟΣ ΧΑΡΤΗΣ ======
LANG_MAP = {
    "el": "Ελληνικά", "en": "English", "de": "Deutsch", "fr": "Français", "es": "Español",
    "it": "Italiano", "ar": "العربية", "zh-CN": "中文 (Simplified)", "ja": "日本語",
    "ru": "Русский", "tr": "Türkçe", "nl": "Nederlands", "pt": "Português",
    "sv": "Svenska", "no": "Norsk", "da": "Dansk", "fi": "Suomi", "pl": "Polski",
    "cs": "Čeština", "ro": "Română", "bg": "Български", "uk": "Українська",
    "ko": "한국어", "hi": "हिन्दी", "vi": "Tiếng Việt", "th": "ไทย",
    "id": "Bahasa Indonesia", "iw": "עברית"
}

def get_lang_name(code):
    return LANG_MAP.get(code, code)

# ====== ONE-SHOT ANALYSIS PROMPT ======
def build_analysis_prompt(user_lang, gender='f'):
    lang_name = get_lang_name(user_lang)
    gender_text = "γυναίκα" if gender == 'f' else "άντρα"
    return f"""Είσαι η Μαντάμ Ζαΐρα, μια μυστικιστική και έμπειρη αναγνώστρια φλιτζανιών καφέ.

Ανάλυσε τη φωτογραφία του φλιτζανιού που σου δίνω. Αναγνώρισε σύμβολα από τα κατακάθια:
- Γραμμές (ευθείες = ξεκάθαρη πορεία, καμπύλες = εμπόδια)
- Κύκλοι (ολοκληρωμένοι = επιτυχία, σπασμένοι = διαφωνίες)
- Τρίγωνα (κορυφή πάνω = φιλοδοξία, κάτω = εμπόδια)
- Τετράγωνα = σταθερότητα
- Ζώα: πουλί = νέα, σκύλος = φίλος, γάτα = προδοσία, ψάρι = τύχη, φίδι = κίνδυνος
- Ανθρώπινες φιγούρες, γράμματα, αριθμοί
- Δέντρα = ανάπτυξη, βουνά = φιλοδοξίες, αστέρια = ελπίδα, σταυρός = δοκιμασία, καρδιά = αγάπη

Η ανάλυση απευθύνεται σε μια {gender_text}.
Γράψε την απάντησή σου ΑΠΟΚΛΕΙΣΤΙΚΑ ΚΑΙ ΜΟΝΟ σε {lang_name}.
Μίλα στο πρώτο πρόσωπο σαν την Μαντάμ Ζαΐρα, με μυστικιστικό, ποιητικό και φιλικό ύφος.
Η απάντηση να είναι περίπου 120-180 λέξεις, σε 2-3 παραγράφους.
Ξεκίνα με χαιρετισμό, ανέφερε 2-3 σύμβολα, δώσε μια πρόβλεψη και κλείσε με μια φράση-κλειδί."""

# ====== FLASK ROUTES ======
@app.route('/')
def index():
    try:
        with open('index.html', 'r', encoding='utf-8') as f:
            return render_template_string(f.read())
    except FileNotFoundError:
        return "Not found", 404

@app.route('/script.js')
def serve_script():
    return send_from_directory('.', 'script.js')

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    uid = data.get('user_id')
    if not uid:
        return jsonify({"error": "no user_id"}), 400

    start = data.get('start_param', '')
    ref = None
    if start.startswith('ref_'):
        try:
            ref = int(start[4:])
        except ValueError:
            pass

    create_or_update_user(
        uid,
        data.get('first_name', ''),
        data.get('last_name', ''),
        ref
    )
    user = get_user(uid)
    return jsonify({
        "user_id": user['user_id'],
        "points": user['points'],
        "referral_link": f"https://t.me/{OFFICIAL_BOT_USERNAME}?start=ref_{uid}"
    })

@app.route('/api/user/<string:uid_str>')
def user_info(uid_str):
    try:
        uid = int(uid_str)
    except ValueError:
        return jsonify({"error": "invalid user_id"}), 400
    u = get_user(uid)
    if not u:
        return jsonify({"error": "user not found"}), 404
    return jsonify(u)

@app.route('/api/shop/buy', methods=['POST'])
def buy_package():
    data = request.json
    uid = data.get('user_id')
    pkg = data.get('package')
    if not uid or pkg not in STAR_PACKAGES:
        return jsonify({"error": "invalid request"}), 400

    info = STAR_PACKAGES[pkg]
    payload = f"stars_{pkg}_{uid}_{int(datetime.now().timestamp())}"

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        invoice_link = loop.run_until_complete(
            bot.create_invoice_link(
                title="Omen Shop",
                description=f"{info['points']} πόντοι ({info['label']})",
                payload=payload,
                currency="XTR",
                prices=[LabeledPrice(label=info['label'], amount=info['stars'])],
                need_name=False, need_phone_number=False, need_email=False,
                need_shipping_address=False, is_flexible=False
            )
        )
        loop.close()
        logger.info(f"Invoice link created for user {uid}: {invoice_link}")
        return jsonify({"success": True, "invoice_link": invoice_link})
    except Exception as e:
        logger.error(f"createInvoiceLink error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/analyze', methods=['POST'])
def analyze():
    try:
        data = request.get_json(force=True)
        uid = data.get('user_id')
        image_b64 = data.get('image')
        user_lang = data.get('language_code', 'el')
        gender = data.get('gender', 'f')

        if not uid or not image_b64:
            return jsonify({"success": False, "error": "Λείπουν δεδομένα"}), 400

        user = get_user(uid)
        if not user:
            return jsonify({"success": False, "error": "Ο χρήστης δεν βρέθηκε"}), 404
        if user['points'] < ANALYSIS_COST:
            return jsonify({"success": False, "error": "Δεν έχετε αρκετούς πόντους"}), 402

        # ====== ΕΠΕΞΕΡΓΑΣΙΑ ΕΙΚΟΝΑΣ ======
        if ',' in image_b64:
            image_b64 = image_b64.split(',', 1)[1]

        decoded_bytes = base64.b64decode(image_b64)
        logger.info(f"Decoded image bytes: {len(decoded_bytes)} bytes")

        pil_image = Image.open(BytesIO(decoded_bytes)).convert('RGB')
        pil_image.thumbnail((800, 800), Image.LANCZOS)
        buf = BytesIO()
        pil_image.save(buf, format='JPEG', quality=75)
        processed_bytes = buf.getvalue()
        logger.info(f"Processed image size: {len(processed_bytes)} bytes")

        # ====== ΚΛΗΣΗ GEMINI ΜΕ ΣΩΣΤΟ FORMAT ======
        prompt = build_analysis_prompt(user_lang, gender)

        response = gemini_model.generate_content(
            [
                {
                    'mime_type': 'image/jpeg',
                    'data': processed_bytes
                },
                prompt
            ],
            generation_config=genai.types.GenerationConfig(
                temperature=0.9,
                max_output_tokens=300,
            )
        )

        if not response.text:
            logger.error("Gemini returned empty response")
            return jsonify({"success": False, "error": "Το AI δεν επέστρεψε κείμενο"}), 500

        result_text = response.text.strip()
        logger.info(f"Gemini response length: {len(result_text)} chars")

        # ====== ΑΦΑΙΡΕΣΗ ΠΟΝΤΩΝ ======
        conn = get_db()
        conn.execute("UPDATE users SET points = points - ? WHERE user_id = ?", (ANALYSIS_COST, uid))
        conn.commit()
        conn.close()
        logger.info(f"Deducted {ANALYSIS_COST} points from user {uid}")

        return jsonify({
            "success": True,
            "symbols": result_text,
            "language": user_lang
        })

    except Exception as e:
        logger.error(f"Analysis error: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": f"Σφάλμα ανάλυσης: {str(e)}"
        }), 500

# ====== TELEGRAM BOT HANDLERS ======
async def start_command(update: Update, context: CallbackContext):
    user = update.effective_user
    args = context.args
    ref = None
    if args and args[0].startswith('ref_'):
        try:
            ref = int(args[0][4:])
        except ValueError:
            pass

    create_or_update_user(user.id, user.username, user.first_name, ref)
    text = "☕ *Καλωσόρισες στο Omen!* Σου κάναμε δώρο 15 πόντους. Πάτα 'Ανάλυση' για να ξεκινήσουμε!"
    if ref:
        text += f"\n🎁 Μπήκες μέσω πρόσκλησης! Κέρδισες 20 πόντους!"
    await update.message.reply_text(
        text,
        reply_markup=InlineKeyboardMarkup([[
            InlineKeyboardButton("🔮 Άνοιγμα Omen", web_app=WebAppInfo(url=MINI_APP_URL))
        ]]),
        parse_mode=ParseMode.MARKDOWN
    )

async def precheckout(update: Update, context: CallbackContext):
    await update.pre_checkout_query.answer(ok=True)

async def successful_payment(update: Update, context: CallbackContext):
    payment = update.message.successful_payment
    uid = update.effective_user.id
    payload = payment.invoice_payload
    for pkg_id, info in STAR_PACKAGES.items():
        if payload.startswith(f"stars_{pkg_id}"):
            conn = get_db()
            conn.execute("UPDATE users SET points = points + ? WHERE user_id = ?", (info['points'], uid))
            conn.commit()
            conn.close()
            await update.message.reply_text(f"✅ Αγόρασες {info['label']}! +{info['points']} πόντοι")
            return

@app.route('/webhook', methods=['POST'])
async def webhook():
    if request.method == "POST":
        try:
            update = Update.de_json(request.get_json(force=True), telegram_app.bot)
            await telegram_app.process_update(update)
            return 'ok', 200
        except Exception as e:
            logger.error(f"Webhook error: {e}")
            return 'error', 500
    return 'Method not allowed', 405

def setup_handlers():
    telegram_app.add_handler(CommandHandler("start", start_command))
    telegram_app.add_handler(PreCheckoutQueryHandler(precheckout))
    telegram_app.add_handler(
        MessageHandler(telegram_filters.SUCCESSFUL_PAYMENT, successful_payment)
    )

async def setup_webhook():
    try:
        await telegram_app.initialize()
        await telegram_app.bot.set_webhook(url=WEBHOOK_URL)
        logger.info(f"✅ Webhook set to {WEBHOOK_URL}")
    except Exception as e:
        logger.error(f"Webhook setup failed: {e}")

if __name__ == '__main__':
    setup_handlers()
    asyncio.run(setup_webhook())
    logger.info("🚀 Omen server starting...")
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 7860)), debug=False)
