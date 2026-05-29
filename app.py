"""
Omen - Καφεμαντεία Mini App
Πλήρες Backend: Flask + Telegram Bot + Gemini
Νέο σύστημα πόντων, 3-Photo Analysis, Shop
"""

import logging, os, json, asyncio, base64, threading
from datetime import datetime, date
from io import BytesIO
from flask import Flask, request, jsonify, render_template_string, send_from_directory
from flask_cors import CORS
import google.generativeai as genai
from telegram import Bot, Update, InlineKeyboardButton, InlineKeyboardMarkup, LabeledPrice, WebAppInfo
from telegram.ext import Application, CommandHandler, MessageHandler, PreCheckoutQueryHandler, CallbackContext, filters as telegram_filters
from telegram.constants import ParseMode
import sqlite3
from PIL import Image

# ====== CONFIGURATION ======
TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
WEBHOOK_URL = os.environ.get("WEBHOOK_URL")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
MINI_APP_URL = os.environ.get("MINI_APP_URL", "https://omen.franklymadear.com")

genai.configure(api_key=GEMINI_API_KEY)
gemini_model = genai.GenerativeModel('gemini-1.5-flash')
OFFICIAL_BOT_USERNAME = "omenread_bot"

# ====== ΣΥΣΤΗΜΑ ΠΟΝΤΩΝ ======
ANALYSIS_COST = 15
WELCOME_BONUS = 15
REFERRAL_SENDER_REWARD = 30
REFERRAL_RECEIVER_BONUS = 20
MAX_INVITES_FOR_MILESTONE = 10
MILESTONE_BONUS = 100
DAILY_LIMIT = 5

STAR_PACKAGES = {
    "starter": {"points": 45, "stars": 1, "label": "Starter (3 αναλύσεις) - 1€"},
    "value":   {"points": 75, "stars": 2, "label": "Value (5 αναλύσεις) - 1.50€"},
    "pro":     {"points": 150, "stars": 3, "label": "Pro (10 αναλύσεις) - 2.99€"}
}

# ====== LOGGING ======
logging.basicConfig(format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO)
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
    conn.execute("PRAGMA foreign_keys=ON")
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
    except: pass
    conn.commit()
    conn.close()

init_db()

def get_user(uid):
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE user_id=?", (uid,)).fetchone()
    conn.close()
    return dict(user) if user else None

def create_or_update_user(uid, username=None, first_name=None, referrer_id=None):
    conn = get_db()
    cur = conn.cursor()
    exist = cur.execute("SELECT user_id, welcome_bonus_granted FROM users WHERE user_id=?", (uid,)).fetchone()
    
    # Καθορισμός αρχικών πόντων
    if referrer_id and referrer_id != 0:
        base_points = REFERRAL_RECEIVER_BONUS
    else:
        base_points = WELCOME_BONUS

    if not exist:
        cur.execute('''INSERT INTO users (user_id, username, first_name, referrer_id, points, welcome_bonus_granted)
                       VALUES (?,?,?,?,?,1)''', (uid, username, first_name, referrer_id, base_points))
        # Αν έχει referral
        if referrer_id and referrer_id != uid and referrer_id != 0:
            try:
                cur.execute("INSERT OR IGNORE INTO referrals (referrer_id, referred_user_id) VALUES (?,?)",
                            (referrer_id, uid))
                # Πόντοι στον referrer
                cur.execute("UPDATE users SET points=points+?, successful_invites=successful_invites+1 WHERE user_id=?",
                            (REFERRAL_SENDER_REWARD, referrer_id))
                # Milestone check
                ref = cur.execute("SELECT successful_invites, milestone_bonus_granted FROM users WHERE user_id=?",
                                  (referrer_id,)).fetchone()
                if ref and ref['successful_invites'] >= MAX_INVITES_FOR_MILESTONE and not ref['milestone_bonus_granted']:
                    cur.execute("UPDATE users SET points=points+?, milestone_bonus_granted=1 WHERE user_id=?",
                                (MILESTONE_BONUS, referrer_id))
            except: pass
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
        try: loop.run_until_complete(coro)
        finally: loop.close()
    threading.Thread(target=run, daemon=True).start()

# ====== PROMPT ΓΙΑ ΤΙΣ 3 ΦΩΤΟ ======
ANALYSIS_PROMPT = """Είσαι η Μαντάμ Ζαΐρα, μια μυστικιστική αναγνώστρια φλιτζανιών καφέ.
Ανάλυσε τις 3 φωτογραφίες που σου δίνω (από διαφορετικές γωνίες του ίδιου φλιτζανιού).
Αναγνώρισε σχήματα και σύμβολα από τα κατακάθια:
- Γραμμές (ευθείες = ξεκάθαρη πορεία, καμπύλες = εμπόδια)
- Κύκλοι (ολοκληρωμένοι = επιτυχία, σπασμένοι = διαφωνίες)
- Τρίγωνα (κορυφή πάνω = φιλοδοξία, κάτω = εμπόδια)
- Τετράγωνα = σταθερότητα
- Ζώα: πουλί = νέα, σκύλος = φίλος, γάτα = προδοσία, ψάρι = τύχη, φίδι = κίνδυνος
- Ανθρώπινες φιγούρες, γράμματα, αριθμοί
- Δέντρα = ανάπτυξη, βουνά = φιλοδοξίες, αστέρια = ελπίδα, σταυρός = δοκιμασία, καρδιά = αγάπη

Γράψε 3-4 παραγράφους σαν να μιλάς απευθείας στον ενδιαφερόμενο.
Ξεκίνα με μια εισαγωγή, ανέφερε 2-3 συγκεκριμένα σύμβολα που βλέπεις, συνδύασέ τα σε μια μικρή ιστορία-πρόβλεψη,
και τελείωσε με μια δυνατή φράση-κλειδί.
Μίλα στο πρώτο πρόσωπο, με μυστικιστικό αλλά φιλικό ύφος."""

# ====== ROUTES ======
@app.route('/')
def index():
    try:
        with open('index.html', 'r', encoding='utf-8') as f:
            return render_template_string(f.read())
    except: return "Not found", 404

@app.route('/script.js')
def script():
    return send_from_directory('.', 'script.js')

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    uid = data.get('user_id')
    if not uid: return jsonify({"error":"no user_id"}), 400
    start = data.get('start_param','')
    ref = None
    if start.startswith('ref_'):
        try: ref = int(start[4:])
        except: pass
    create_or_update_user(uid, data.get('first_name',''), data.get('last_name',''), ref)
    user = get_user(uid)
    return jsonify({
        "user_id": user['user_id'],
        "points": user['points'],
        "referral_link": f"https://t.me/{OFFICIAL_BOT_USERNAME}?start=ref_{uid}"
    })

@app.route('/api/user/<string:uid>')
def user_info(uid):
    try: uid = int(uid)
    except: return jsonify({"error":"bad id"}), 400
    u = get_user(uid)
    if not u: return jsonify({"error":"not found"}), 404
    return jsonify(u)

@app.route('/api/shop/buy', methods=['POST'])
def buy():
    data = request.json
    uid = data.get('user_id')
    pkg = data.get('package')
    if not uid or pkg not in STAR_PACKAGES: return jsonify({"error":"invalid"}), 400
    info = STAR_PACKAGES[pkg]
    payload = f"buy_{pkg}_{uid}_{int(datetime.now().timestamp())}"
    _run_async(send_invoice(uid, info, payload))
    return jsonify({"success":True})

async def send_invoice(uid, info, payload):
    await bot.send_invoice(
        chat_id=uid, title="Omen Shop",
        description=f"{info['points']} πόντοι για αναλύσεις καφεμαντείας!",
        payload=payload, provider_token="", currency="XTR",
        prices=[LabeledPrice(label=info['label'], amount=info['stars'])],
        need_name=False, need_phone_number=False, need_email=False,
        need_shipping_address=False, is_flexible=False, protect_content=True)

@app.route('/api/analyze-multi', methods=['POST'])
def analyze():
    data = request.json
    uid = data.get('user_id')
    images = data.get('images', [])
    gender = data.get('gender','f')
    if not uid or len(images) != 3:
        return jsonify({"success":False, "error":"Χρειάζονται ακριβώς 3 φωτογραφίες"}), 400
    
    user = get_user(uid)
    if not user or user['points'] < ANALYSIS_COST:
        return jsonify({"success":False, "error":"Δεν έχετε αρκετούς πόντους"}), 403
    
    try:
        compressed = []
        for img in images:
            if ',' in img: img = img.split(',')[1]
            img_bytes = base64.b64decode(img)
            pic = Image.open(BytesIO(img_bytes)).convert('RGB')
            pic.thumbnail((800,800))
            buf = BytesIO()
            pic.save(buf, format='JPEG', quality=70)
            compressed.append(buf.getvalue())
        
        prompt = ANALYSIS_PROMPT + f"\n\n(Η ανάλυση απευθύνεται σε {'γυναίκα' if gender=='f' else 'άντρα'}.)"
        response = gemini_model.generate_content(compressed + [prompt])
        
        conn = get_db()
        conn.execute("UPDATE users SET points=points-? WHERE user_id=?", (ANALYSIS_COST, uid))
        conn.commit()
        conn.close()
        
        return jsonify({"success":True, "symbols":response.text})
    except Exception as e:
        logger.error(f"Analysis error: {e}")
        return jsonify({"success":False, "error":"Σφάλμα κατά την ανάλυση"}), 500

# ====== TELEGRAM HANDLERS ======
async def start(update, context):
    user = update.effective_user
    args = context.args
    ref = None
    if args and args[0].startswith('ref_'):
        try: ref = int(args[0][4:])
        except: pass
    create_or_update_user(user.id, user.username, user.first_name, ref)
    text = "☕ *Καλωσόρισες στο Omen!* Σου κάναμε δώρο 15 πόντους. Ανέβασε 3 φωτογραφίες για ανάλυση!"
    if ref: text += f"\n🎁 Μπήκες μέσω πρόσκλησης! Κέρδισες 20 πόντους!"
    await update.message.reply_text(text,
        reply_markup=InlineKeyboardMarkup([[
            InlineKeyboardButton("🔮 Άνοιγμα Omen", web_app=WebAppInfo(url=MINI_APP_URL))
        ]]), parse_mode=ParseMode.MARKDOWN)

async def precheckout(update, context):
    await update.pre_checkout_query.answer(ok=True)

async def successful_payment(update, context):
    payment = update.message.successful_payment
    uid = update.effective_user.id
    payload = payment.invoice_payload
    for pkg_id, info in STAR_PACKAGES.items():
        if payload.startswith(f"buy_{pkg_id}"):
            conn = get_db()
            conn.execute("UPDATE users SET points=points+? WHERE user_id=?", (info['points'], uid))
            conn.commit()
            conn.close()
            await update.message.reply_text(f"✅ Απέκτησες {info['points']} πόντους! Καλές αναλύσεις!")
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

def setup_handlers():
    telegram_app.add_handler(CommandHandler("start", start))
    telegram_app.add_handler(PreCheckoutQueryHandler(precheckout))
    telegram_app.add_handler(MessageHandler(telegram_filters.SUCCESSFUL_PAYMENT, successful_payment))

async def setup_webhook():
    try:
        await telegram_app.initialize()
        await telegram_app.bot.set_webhook(url=WEBHOOK_URL)
        logger.info("Webhook set successfully")
    except Exception as e:
        logger.error(f"Webhook setup failed: {e}")

if __name__ == '__main__':
    setup_handlers()
    asyncio.run(setup_webhook())
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT',7860)), debug=False)
