
import os
import base64
import traceback
import sys
import requests
import time  # <-- Προστέθηκε για την αναμονή (retry)
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

api_key = os.environ.get("GEMINI_API_KEY")
print(f"🔑 API Key: {'Βρέθηκε' if api_key else 'ΔΕΝ ΒΡΕΘΗΚΕ!'}")

if not api_key:
    raise ValueError("❌ Δεν βρέθηκε GEMINI_API_KEY!")

# ΑΛΛΑΓΗ 1: Χρησιμοποιούμε το gemini-1.5-flash που είναι πιο σταθερό και δεν βγάζει τόσα 503
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"

SYSTEM_INSTRUCTION = """
Είσαι η Μαντάμ Ζαΐρα, μια διάσημη, μυστηριώδης αλλά ζεστή καφετζού. 
Ανάλυσε τη φωτογραφία του φλιτζανιού καφέ που σου στέλνουν. 
Πρέπει να εντοπίσεις σχήματα και σύμβολα στα κατακάθια του καφέ.

ΛΕΞΙΚΟ ΣΥΜΒΟΛΩΝ ΚΑΦΕΜΑΝΤΕΙΑΣ:
- Άγγελος: Χαρούμενη είδηση. Ανοιχτά φτερά = γρήγορος γάμος ή ανάρρωση.
- Αγελάδες: Πλούτος και βοήθεια.
- Άλογο: Επιτυχία, κοινωνική άνοδος.
- Αλυσίδα: Ερωτικός δεσμός ή αρμονία.
- Αράχνη: Συννωμοσίες, κουτσομπολιά.
- Αστέρια: Ευτυχία στα αισθηματικά.
- Αυγό: Κέρδος, γονιμότητα.
- Αυτοκίνητο: Θετική αλλαγή.
- Βέλος: Γάμος ή απιστία.
- Βιβλίο: Κέρδη από επιχειρήσεις.
- Βουνό: Λαμπρό μέλλον.
- Γάτα: Γρουσουζιά, προδοσία.
- Γέφυρα: Ψεύτικες υποσχέσεις.
- Δαχτυλίδι: Γάμος, αρραβώνας.
- Δελφίνι: Επαγγελματική και οικογενειακή ευτυχία.
- Δέντρα: Πλούτη, πρόοδος.
- Δρόμος: Ταξίδι με θετικές εξελίξεις.
- Εκκλησία: Χαρά, ευλογία.
- Ήλιος: Απόλυτη επιτυχία.
- Θάλασσα: Δυσκολίες που ξεπερνιούνται.
- Καρδιά: Έρωτας, γάμος.
- Καράβι: Ταξίδι, αλλαγές.
- Κλειδί: Νέες ευκαιρίες, επιτυχία.
- Κύκλος: Χρήματα, ολοκλήρωση.
- Λαμπάδα: Καλά νέα (αναμμένη), αποτυχία (σβηστή).
- Μάτια: Σε παρακολουθούν.
- Μαχαίρι: Χωρισμός, καβγάδες.
- Μήλο: Επαγγελματική επιτυχία.
- Νόμισμα: Απρόσμενα κέρδη.
- Πουλιά: Ευχάριστα νέα.
- Σπιτάκια: Οικογενειακή ευτυχία, γάμος.
- Σταυρός: Δοκιμασία ή προστασία.
- Τετράγωνα: Αισθηματική επιτυχία.
- Τριαντάφυλλο: Υγεία, αγάπη.
- Τρίγωνα: Οικονομική τύχη.
- Ψάρι: Επιτυχία (ένα), προβλήματα (πολλά).

ΥΦΟΣ:
Μυστηριώδες, θεατρικό αλλά ζεστό και φιλικό.
Ξεκίνα με "Αγαπητή μου ψυχή, το φλιτζάνι μιλάει..." και κλείσε με μια ευχή.
Αν η φωτογραφία είναι θολή, ζήτα ευγενικά καλύτερη.
Γράψε σε φυσική γλώσσα, σαν να μιλάς σε φίλη.
"""

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/analyze', methods=['POST'])
def analyze():
    print("=" * 60, flush=True)
    print("📥 ΝΕΟ ΑΙΤΗΜΑ ΑΝΑΛΥΣΗΣ", flush=True)
    
    try:
        data = request.get_json()
        print(f"📦 Έλαβα δεδομένα: {list(data.keys()) if data else 'ΚΕΝΟ'}", flush=True)
        
        if 'image' not in data:
            print("❌ Δεν βρέθηκε πεδίο 'image'", flush=True)
            return jsonify({"success": False, "error": "Δεν στάλθηκε εικόνα"}), 400
            
        if "base64," not in data['image']:
            print("❌ Η εικόνα δεν είναι base64", flush=True)
            return jsonify({"success": False, "error": "Μη έγκυρη εικόνα"}), 400
            
        image_base64 = data['image'].split("base64,")[1]
        print(f"✅ Εικόνα αποκωδικοποιήθηκε, μήκος: {len(image_base64)}", flush=True)
        
        print("🤖 Ετοιμάζω αίτημα για Gemini REST API...", flush=True)
        
        payload = {
            "contents": [{
                "parts": [
                    {"text": SYSTEM_INSTRUCTION + "\nΑνάλυσε προσεκτικά αυτό το φλιτζάνι και πες μου τι βλέπεις:"},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": image_base64
                        }
                    }
                ]
            }]
        }
        
        url = f"{GEMINI_API_URL}?key={api_key}"
        print(f"🌐 URL: Μοντέλο gemini-1.5-flash", flush=True)
        
        # ΑΛΛΑΓΗ 2: Μηχανισμός Retry (Προσπαθεί έως 3 φορές αν φάει 503)
        max_retries = 3
        for attempt in range(max_retries):
            print(f"📤 Αποστολή... (Προσπάθεια {attempt + 1}/{max_retries})", flush=True)
            response = requests.post(url, json=payload, timeout=60)
            
            print(f"📥 Απάντηση: status={response.status_code}", flush=True)
            
            # Αν πετύχει, σπάμε τη λούπα και προχωράμε
            if response.status_code == 200:
                break
                
            # Αν είναι 503 (Απασχολημένο) ή 429 (Quota), περιμένουμε λίγο
            if response.status_code in [503, 429]:
                if attempt < max_retries - 1: # Αν δεν είναι η τελευταία προσπάθεια
                    wait_time = (attempt + 1) * 2
                    print(f"⚠️ Το μοντέλο είναι απασχολημένο. Αναμονή {wait_time} δευτερόλεπτα...", flush=True)
                    time.sleep(wait_time)
                    continue
                else:
                    print("⚠️ Εξαντλήθηκαν οι προσπάθειες. Επιστροφή 503.", flush=True)
                    return jsonify({
                        "success": False, 
                        "error": "Η Μαντάμ Ζαΐρα έχει πολλή δουλειά αυτή τη στιγμή! Δοκίμασε ξανά σε λίγα δευτερόλεπτα."
                    }), 503
            
            # Αν είναι άλλο σφάλμα (πχ 400), σπάμε τη λούπα και το δείχνουμε
            print(f"❌ ΣΦΑΛΜΑ API:", flush=True)
            print(response.text, flush=True)
            return jsonify({
                "success": False, 
                "error": f"Σφάλμα API ({response.status_code})"
            }), 500
            
        result = response.json()
        print("✅ Απάντηση από Gemini ελήφθη!", flush=True)
        
        text = result['candidates'][0]['content']['parts'][0]['text']
        print(f"📝 Κείμενο: {text[:100]}...", flush=True)
        
        return jsonify({"success": True, "symbols": text})

    except Exception as e:
        print(f"❌ ΣΦΑΛΜΑ: {str(e)}", flush=True)
        traceback.print_exc(file=sys.stdout)
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    print("=" * 60, flush=True)
    print("🔮 Η Μαντάμ Ζαΐρα είναι έτοιμη!", flush=True)
    print("=" * 60, flush=True)
    app.run(host='0.0.0.0', port=7860)


