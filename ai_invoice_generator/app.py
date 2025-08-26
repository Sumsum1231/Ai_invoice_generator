import os

from flask import Flask, jsonify, request, abort, send_file, Response
from flask_cors import CORS
from pymongo import MongoClient, ASCENDING, DESCENDING
from bson import ObjectId
from bson.errors import InvalidId
import io
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from collections import defaultdict
from datetime import datetime
import base64
from werkzeug.utils import secure_filename
import uuid
from dotenv import load_dotenv
import ssl
# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app, resources={
    r"/*": {
        "origins": ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000"],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# MongoDB Configuration
MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/invoice_management')
client = MongoClient(MONGODB_URI)
client = MongoClient(
    MONGODB_URI,
    tls=True,
    tlsAllowInvalidCertificates=True,
    
)
db = client['invoice_management']

# Collections
clients_collection = db.clients
invoices_collection = db.invoices

# Ensure indexes
try:
    clients_collection.create_index("email", unique=True)
    clients_collection.create_index("name")
    invoices_collection.create_index("invoice_number", unique=True)
    invoices_collection.create_index("for.id")
    invoices_collection.create_index("status")
except Exception as e:
    print(f"Index creation warning: {e}")

# Logo directory setup
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
LOGOS_DIR = os.path.join(DATA_DIR, 'logos')
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)
if not os.path.exists(LOGOS_DIR):
    os.makedirs(LOGOS_DIR)

CURRENCY_SYMBOLS = {'INR': '₹', 'USD': '$', 'EUR': '€'}

# Logo configuration
ALLOWED_LOGO_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'svg'}
MAX_LOGO_SIZE = 5 * 1024 * 1024  # 5MB

def allowed_logo_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_LOGO_EXTENSIONS

def serialize_doc(doc):
    """Convert MongoDB document to JSON serializable format"""
    if doc is None:
        return None
    
    if isinstance(doc, list):
        return [serialize_doc(item) for item in doc]
    
    if isinstance(doc, dict):
        result = {}
        for key, value in doc.items():
            if key == '_id':
                result['id'] = str(value)
            elif isinstance(value, ObjectId):
                result[key] = str(value)
            elif isinstance(value, datetime):
                result[key] = value.isoformat()
            elif isinstance(value, dict):
                result[key] = serialize_doc(value)
            elif isinstance(value, list):
                result[key] = [serialize_doc(item) for item in value]
            else:
                result[key] = value
        return result
    
    return doc

def generate_invoice_number():
    """Generate unique invoice number"""
    # Find the highest invoice number
    last_invoice = invoices_collection.find().sort("invoice_number", DESCENDING).limit(1)
    last_invoice = list(last_invoice)
    
    if not last_invoice:
        return "INV-0001"
    
    last_num = last_invoice[0].get("invoice_number", "INV-0000")
    try:
        num = int(last_num.split("-")[1])
        return f"INV-{num+1:04d}"
    except (IndexError, ValueError):
        return "INV-0001"

def calculate_invoice_total(items, gst_rate):
    if not items or not isinstance(items, list):
        return 0
    
    subtotal = 0
    total_tax = 0
    
    for item in items:
        try:
            quantity = float(item.get("quantity", 0))
            unit_price = float(item.get("unit_price", 0))
            tax_rate = float(item.get("tax", 0))
            
            item_subtotal = quantity * unit_price
            item_tax = (item_subtotal * tax_rate) / 100
            
            subtotal += item_subtotal
            total_tax += item_tax
        except (ValueError, TypeError):
            continue
    
    gst_amount = (subtotal * float(gst_rate)) / 100
    return round(subtotal + total_tax + gst_amount, 2)

@app.route("/")
def home():
    try:
        client_count = clients_collection.count_documents({})
        invoice_count = invoices_collection.count_documents({})
        
        return jsonify({
            'message': 'Invoice API Running with MongoDB',
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'database': 'MongoDB',
            'collections': {
                'clients': client_count,
                'invoices': invoice_count
            },
            'endpoints': [
                'GET /clients - Get all clients',
                'POST /clients - Create client',
                'GET /clients/<id> - Get specific client',
                'PUT /clients/<id> - Update client',
                'DELETE /clients/<id> - Delete client',
                'POST /clients/bulk - Bulk import clients',
                'GET /clients/export - Export clients',
                'GET /clients/test - Test client endpoints',
                'GET /invoices - Get all invoices', 
                'POST /invoices - Create invoice',
                'PUT /invoices/<id> - Update invoice',
                'DELETE /invoices/<id> - Delete invoice',
                'GET /invoices/<id>/pdf - Generate PDF',
                'POST /invoices/<id>/pay - Record payment',
                'POST /logos/upload - Upload company logo',
                'GET /logos/<filename> - Serve logo file',
                'DELETE /logos/<filename> - Delete logo',
                'GET /logos - List all logos',
                'GET /reports/summary - Get reports data',
                'GET /reports/pdf - Download PDF report',
                'GET /health - Health check'
            ]
        })
    except Exception as e:
        return jsonify({
            'message': 'Invoice API Running',
            'status': 'warning',
            'database_error': str(e),
            'timestamp': datetime.now().isoformat()
        })

@app.route('/health')
def health():
    try:
        # Test database connection
        clients_count = clients_collection.count_documents({})
        invoices_count = invoices_collection.count_documents({})
        
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'database': 'MongoDB',
            'connection': 'active',
            'collections': {
                'clients': clients_count,
                'invoices': invoices_count
            },
            'pdf_service': 'active',
            'storage': 'mongodb',
            'data_dir': DATA_DIR,
            'logos_dir': LOGOS_DIR
        })
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

# ============= LOGO UPLOAD ROUTES (Unchanged) =============

@app.route('/logos/upload', methods=['POST'])
def upload_logo():
    try:
        print("🎨 Logo upload request received")
        
        if 'logo' not in request.files:
            return jsonify({'error': 'No logo file provided'}), 400
        
        file = request.files['logo']
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_logo_file(file.filename):
            return jsonify({'error': 'Invalid file type. Allowed: PNG, JPG, JPEG, GIF, SVG'}), 400
        
        # Check file size
        file.seek(0, 2)  # Seek to end
        file_size = file.tell()
        file.seek(0)  # Reset to beginning
        
        if file_size > MAX_LOGO_SIZE:
            return jsonify({'error': 'File too large. Maximum size: 5MB'}), 400
        
        # Generate unique filename
        file_extension = file.filename.rsplit('.', 1)[1].lower()
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        filepath = os.path.join(LOGOS_DIR, unique_filename)
        
        # Save file
        file.save(filepath)
        
        print(f"✅ Logo saved: {unique_filename}")
        
        return jsonify({
            'success': True,
            'logo': {
                'id': str(uuid.uuid4()),
                'filename': unique_filename,
                'original_name': secure_filename(file.filename),
                'url': f'/logos/{unique_filename}',
                'size': file_size
            }
        }), 200
        
    except Exception as e:
        print(f"❌ Logo upload error: {e}")
        return jsonify({'error': f'Failed to upload logo: {str(e)}'}), 500

@app.route('/logos/<filename>')
def serve_logo(filename):
    try:
        return send_file(
            os.path.join(LOGOS_DIR, secure_filename(filename)),
            as_attachment=False
        )
    except Exception as e:
        print(f"❌ Error serving logo: {e}")
        return jsonify({'error': 'Logo not found'}), 404

@app.route('/logos/<filename>', methods=['DELETE'])
def delete_logo(filename):
    try:
        filepath = os.path.join(LOGOS_DIR, secure_filename(filename))
        if os.path.exists(filepath):
            os.remove(filepath)
            return jsonify({'message': 'Logo deleted successfully'}), 200
        else:
            return jsonify({'error': 'Logo not found'}), 404
    except Exception as e:
        print(f"❌ Error deleting logo: {e}")
        return jsonify({'error': 'Failed to delete logo'}), 500

@app.route('/logos', methods=['GET'])
def list_logos():
    try:
        logos = []
        if os.path.exists(LOGOS_DIR):
            for filename in os.listdir(LOGOS_DIR):
                if allowed_logo_file(filename):
                    filepath = os.path.join(LOGOS_DIR, filename)
                    logos.append({
                        'filename': filename,
                        'url': f'/logos/{filename}',
                        'size': os.path.getsize(filepath),
                        'created': datetime.fromtimestamp(os.path.getctime(filepath)).isoformat()
                    })
        
        return jsonify({
            'success': True,
            'logos': logos,
            'count': len(logos)
        }), 200
        
    except Exception as e:
        print(f"❌ Error listing logos: {e}")
        return jsonify({'error': 'Failed to list logos'}), 500

# ============= CLIENT ROUTES - MongoDB Version =============

@app.route("/clients", methods=["GET"])
def get_clients():
    try:
        clients = list(clients_collection.find().sort("created_at", DESCENDING))
        return jsonify(serialize_doc(clients)), 200
    except Exception as e:
        print(f"Error getting clients: {e}")
        return jsonify({'error': 'Failed to fetch clients'}), 500

@app.route("/clients", methods=["POST"])
def add_client():
    try:
        if not request.json:
            return jsonify({'error': 'No data provided'}), 400
            
        client_data = request.json.copy()
        
        # Validate required fields
        if not client_data.get('name') or not client_data.get('email'):
            return jsonify({'error': 'Name and email are required'}), 400
        
        # Check for duplicate email
        existing_client = clients_collection.find_one({'email': client_data['email'].lower()})
        if existing_client:
            return jsonify({'error': 'Client with this email already exists'}), 400
        
        # Prepare client data
        client_data['email'] = client_data['email'].lower()
        client_data['created_at'] = datetime.now()
        client_data['updated_at'] = datetime.now()
        
        # Insert client
        result = clients_collection.insert_one(client_data)
        
        # Get the created client
        created_client = clients_collection.find_one({'_id': result.inserted_id})
        
        return jsonify(serialize_doc(created_client)), 201
            
    except Exception as e:
        print(f"Error adding client: {e}")
        return jsonify({'error': 'Failed to create client'}), 500

@app.route("/clients/<client_id>", methods=["GET"])
def get_client(client_id):
    try:
        # Try to find by MongoDB _id or custom id
        try:
            if ObjectId.is_valid(client_id):
                client = clients_collection.find_one({'_id': ObjectId(client_id)})
            else:
                client = clients_collection.find_one({'id': int(client_id)})
        except (ValueError, InvalidId):
            client = clients_collection.find_one({'id': int(client_id)})
        
        if not client:
            return jsonify({'error': 'Client not found'}), 404
            
        return jsonify(serialize_doc(client)), 200
        
    except Exception as e:
        print(f"Error getting client: {e}")
        return jsonify({'error': 'Failed to fetch client'}), 500

@app.route("/clients/<client_id>", methods=["PUT"])
def update_client(client_id):
    try:
        if not request.json:
            return jsonify({'error': 'No data provided'}), 400
        
        # Find client
        try:
            if ObjectId.is_valid(client_id):
                client = clients_collection.find_one({'_id': ObjectId(client_id)})
                client_filter = {'_id': ObjectId(client_id)}
            else:
                client = clients_collection.find_one({'id': int(client_id)})
                client_filter = {'id': int(client_id)}
        except (ValueError, InvalidId):
            client = clients_collection.find_one({'id': int(client_id)})
            client_filter = {'id': int(client_id)}
        
        if not client:
            return jsonify({'error': 'Client not found'}), 404

        update_data = request.json.copy()
        
        # Validate required fields
        if not update_data.get('name') or not update_data.get('email'):
            return jsonify({'error': 'Name and email are required'}), 400
        
        # Check for duplicate email (excluding current client)
        existing_client = clients_collection.find_one({
            'email': update_data['email'].lower(),
            '_id': {'$ne': client['_id']}
        })
        if existing_client:
            return jsonify({'error': 'Another client with this email already exists'}), 400
        
        # Prepare update data
        update_data['email'] = update_data['email'].lower()
        update_data['updated_at'] = datetime.now()
        
        # Remove fields that shouldn't be updated
        update_data.pop('_id', None)
        update_data.pop('id', None)
        update_data.pop('created_at', None)
        
        # Update client
        result = clients_collection.update_one(client_filter, {'$set': update_data})
        
        if result.modified_count == 0 and result.matched_count == 0:
            return jsonify({'error': 'Client not found'}), 404
        
        # Get updated client
        updated_client = clients_collection.find_one(client_filter)
        return jsonify(serialize_doc(updated_client)), 200
            
    except Exception as e:
        print(f"Error updating client: {e}")
        return jsonify({'error': f'Failed to update client: {str(e)}'}), 500

@app.route("/clients/<client_id>", methods=["DELETE"])
def delete_client(client_id):
    try:
        print(f"🗑️ Delete request for client ID: {client_id}")
        
        # Find client
        try:
            if ObjectId.is_valid(client_id):
                client = clients_collection.find_one({'_id': ObjectId(client_id)})
                client_filter = {'_id': ObjectId(client_id)}
                search_id = client['_id'] if client else None
            else:
                client_id_int = int(client_id)
                client = clients_collection.find_one({'id': client_id_int})
                client_filter = {'id': client_id_int}
                search_id = client_id_int
        except (ValueError, InvalidId):
            client_id_int = int(client_id)
            client = clients_collection.find_one({'id': client_id_int})
            client_filter = {'id': client_id_int}
            search_id = client_id_int
        
        if not client:
            return jsonify({'error': 'Client not found'}), 404
        
        print(f"🔍 Found client to delete: {client.get('name', 'Unknown')}")
        
        # Check if client is used in any invoices
        client_invoices = list(invoices_collection.find({'for.id': search_id}))
        
        if client_invoices:
            invoice_numbers = [inv.get("invoice_number", f"#{inv.get('_id')}") for inv in client_invoices]
            print(f"⚠️ Client has {len(client_invoices)} invoices: {invoice_numbers}")
            return jsonify({
                'error': f'Cannot delete client. Client has {len(client_invoices)} associated invoices: {", ".join(invoice_numbers[:3])}{"..." if len(invoice_numbers) > 3 else ""}'
            }), 400
        
        # Delete client
        result = clients_collection.delete_one(client_filter)
        
        if result.deleted_count == 0:
            return jsonify({'error': 'Client not found'}), 404
        
        print(f"✅ Client deleted successfully")
        return jsonify({"message": f"Client '{client.get('name', 'Unknown')}' deleted successfully"}), 200
            
    except Exception as e:
        print(f"❌ Error deleting client: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to delete client'}), 500

@app.route("/clients/bulk", methods=["POST"])
def bulk_create_clients():
    """Bulk create clients (for import functionality)"""
    try:
        if not request.json or not isinstance(request.json, list):
            return jsonify({'error': 'Data must be a list of client objects'}), 400
            
        results = {"successful": 0, "failed": 0, "errors": []}
        
        # Get existing emails
        existing_emails = set()
        for client in clients_collection.find({}, {'email': 1}):
            existing_emails.add(client.get('email', '').lower())
        
        clients_to_insert = []
        
        for index, client_data in enumerate(request.json):
            try:
                # Validate required fields
                if not client_data.get('name') or not client_data.get('email'):
                    results["failed"] += 1
                    results["errors"].append(f"Row {index + 1}: Missing required fields (name and email)")
                    continue
                
                # Check for duplicate email
                email = client_data.get('email', '').lower()
                if email in existing_emails:
                    results["failed"] += 1
                    results["errors"].append(f"Row {index + 1}: Email '{client_data.get('email')}' already exists")
                    continue
                
                # Clean and prepare data
                clean_data = {
                    "name": str(client_data.get('name', '')).strip(),
                    "email": email,
                    "phone": str(client_data.get('phone', '')).strip(),
                    "company": str(client_data.get('company', '')).strip(),
                    "billing_address": str(client_data.get('billing_address', '')).strip(),
                    "actual_address": str(client_data.get('actual_address', '')).strip(),
                    "notes": str(client_data.get('notes', '')).strip(),
                    "created_at": datetime.now(),
                    "updated_at": datetime.now()
                }
                
                clients_to_insert.append(clean_data)
                existing_emails.add(email)
                results["successful"] += 1
                
            except Exception as e:
                results["failed"] += 1
                results["errors"].append(f"Row {index + 1}: {str(e)}")
        
        # Insert all valid clients at once
        if clients_to_insert:
            clients_collection.insert_many(clients_to_insert)
        
        return jsonify(results), 200
            
    except Exception as e:
        print(f"Error bulk creating clients: {e}")
        return jsonify({'error': f'Failed to bulk create clients: {str(e)}'}), 500

@app.route("/clients/export", methods=["GET"])
def export_clients():
    """Export all clients as JSON"""
    try:
        clients = list(clients_collection.find({}, {
            '_id': 0, 'name': 1, 'email': 1, 'phone': 1, 'company': 1,
            'billing_address': 1, 'actual_address': 1, 'notes': 1, 'created_at': 1
        }))
        
        # Convert datetime objects to ISO strings
        for client in clients:
            if 'created_at' in client and isinstance(client['created_at'], datetime):
                client['created_at'] = client['created_at'].isoformat()
        
        return jsonify({
            'success': True,
            'data': clients,
            'count': len(clients),
            'exported_at': datetime.now().isoformat()
        }), 200
        
    except Exception as e:
        print(f"Error exporting clients: {e}")
        return jsonify({
            'success': False,
            'error': f'Failed to export clients: {str(e)}'
        }), 500

@app.route("/clients/test", methods=["GET"])
def test_clients():
    """Test endpoint to verify client routes are working"""
    try:
        client_count = clients_collection.count_documents({})
        sample_client = clients_collection.find_one()
        
        return jsonify({
            "success": True,
            "message": "Client endpoints are working with MongoDB",
            "data_status": {
                "clients_loaded": client_count,
                "database_connected": True,
                "sample_client": serialize_doc(sample_client) if sample_client else None
            }
        }), 200
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# ============= INVOICE ROUTES - MongoDB Version =============

@app.route("/invoices", methods=["GET"])
def get_invoices():
    try:
        invoices = list(invoices_collection.find().sort("created_at", DESCENDING))
        return jsonify(serialize_doc(invoices)), 200
    except Exception as e:
        print(f"Error getting invoices: {e}")
        return jsonify({'error': 'Failed to fetch invoices'}), 500

@app.route("/invoices", methods=["POST"])
def create_invoice():
    try:
        if not request.json:
            return jsonify({'error': 'No data provided'}), 400
            
        invoice_data = request.json.copy()
        
        # Validate required fields
        items = invoice_data.get("items", [])
        if not items or not isinstance(items, list):
            return jsonify({'error': "'items' must be a non-empty list"}), 400

        # Set defaults
        invoice_data["from"] = invoice_data.get("from", {})
        invoice_data["for"] = invoice_data.get("for", {})
        currency = invoice_data.get("currency", "INR")
        gst_rate = float(invoice_data.get("gst_rate", 18))
        
        # Calculate total
        total = calculate_invoice_total(items, gst_rate)
        
        # Set invoice properties
        invoice_data["invoice_number"] = generate_invoice_number()
        invoice_data["total"] = total
        invoice_data["status"] = "unpaid"
        invoice_data["amount_paid"] = 0.0
        invoice_data["currency"] = currency
        invoice_data["gst_rate"] = gst_rate
        invoice_data["created_at"] = datetime.now()
        invoice_data["updated_at"] = datetime.now()
        
        # Insert invoice
        result = invoices_collection.insert_one(invoice_data)
        
        # Get created invoice
        created_invoice = invoices_collection.find_one({'_id': result.inserted_id})
        
        return jsonify(serialize_doc(created_invoice)), 201
            
    except Exception as e:
        print(f"Error creating invoice: {e}")
        return jsonify({'error': f'Failed to create invoice: {str(e)}'}), 500

@app.route("/invoices/<invoice_id>", methods=["PUT"])
def update_invoice(invoice_id):
    try:
        if not request.json:
            return jsonify({'error': 'No data provided'}), 400
        
        # Find invoice
        try:
            if ObjectId.is_valid(invoice_id):
                invoice = invoices_collection.find_one({'_id': ObjectId(invoice_id)})
                invoice_filter = {'_id': ObjectId(invoice_id)}
            else:
                invoice = invoices_collection.find_one({'id': int(invoice_id)})
                invoice_filter = {'id': int(invoice_id)}
        except (ValueError, InvalidId):
            invoice = invoices_collection.find_one({'id': int(invoice_id)})
            invoice_filter = {'id': int(invoice_id)}
        
        if not invoice:
            return jsonify({'error': 'Invoice not found'}), 404

        update_data = request.json.copy()
        
        # Validate items
        items = update_data.get("items", [])
        if not items or not isinstance(items, list):
            return jsonify({'error': "'items' must be a non-empty list"}), 400

        # Set defaults
        update_data["from"] = update_data.get("from", {})
        update_data["for"] = update_data.get("for", {})
        currency = update_data.get("currency", invoice.get("currency", "INR"))
        gst_rate = float(update_data.get("gst_rate", invoice.get("gst_rate", 18)))
        
        # Calculate total
        total = calculate_invoice_total(items, gst_rate)
        
        update_data["total"] = total
        update_data["currency"] = currency
        update_data["gst_rate"] = gst_rate
        update_data["updated_at"] = datetime.now()
        
        # Preserve payment info unless explicitly updated
        if "amount_paid" not in update_data:
            update_data["amount_paid"] = invoice.get("amount_paid", 0)
        if "status" not in update_data:
            update_data["status"] = invoice.get("status", "unpaid")

        # Remove fields that shouldn't be updated
        update_data.pop('_id', None)
        update_data.pop('id', None)
        update_data.pop('invoice_number', None)
        update_data.pop('created_at', None)

        # Update invoice
        result = invoices_collection.update_one(invoice_filter, {'$set': update_data})
        
        if result.modified_count == 0 and result.matched_count == 0:
            return jsonify({'error': 'Invoice not found'}), 404
        
        # Get updated invoice
        updated_invoice = invoices_collection.find_one(invoice_filter)
        return jsonify(serialize_doc(updated_invoice)), 200
            
    except Exception as e:
        print(f"Error updating invoice: {e}")
        return jsonify({'error': f'Failed to update invoice: {str(e)}'}), 500

@app.route("/invoices/<invoice_id>", methods=["DELETE"])
def delete_invoice(invoice_id):
    try:
        # Find and delete invoice
        try:
            if ObjectId.is_valid(invoice_id):
                result = invoices_collection.delete_one({'_id': ObjectId(invoice_id)})
            else:
                result = invoices_collection.delete_one({'id': int(invoice_id)})
        except (ValueError, InvalidId):
            result = invoices_collection.delete_one({'id': int(invoice_id)})
        
        if result.deleted_count == 0:
            return jsonify({'error': 'Invoice not found'}), 404
        
        return jsonify({"message": f"Invoice {invoice_id} deleted successfully"}), 200
            
    except Exception as e:
        print(f"Error deleting invoice: {e}")
        return jsonify({'error': 'Failed to delete invoice'}), 500

@app.route("/invoices/<invoice_id>/pay", methods=["POST"])
def pay_invoice(invoice_id):
    try:
        if not request.json:
            return jsonify({'error': 'No payment data provided'}), 400
        
        # Find invoice
        try:
            if ObjectId.is_valid(invoice_id):
                invoice = invoices_collection.find_one({'_id': ObjectId(invoice_id)})
                invoice_filter = {'_id': ObjectId(invoice_id)}
            else:
                invoice = invoices_collection.find_one({'id': int(invoice_id)})
                invoice_filter = {'id': int(invoice_id)}
        except (ValueError, InvalidId):
            invoice = invoices_collection.find_one({'id': int(invoice_id)})
            invoice_filter = {'id': int(invoice_id)}
        
        if not invoice:
            return jsonify({'error': 'Invoice not found'}), 404

        try:
            payment = float(request.json.get("amount", 0))
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid payment amount'}), 400
            
        if payment <= 0:
            return jsonify({'error': 'Payment amount must be positive'}), 400

        # Calculate new payment status
        current_paid = float(invoice.get("amount_paid", 0))
        total = float(invoice.get("total", 0))
        new_paid = current_paid + payment
        
        # Update status
        if new_paid >= total:
            status = "paid"
        elif new_paid > 0:
            status = "partial"
        else:
            status = "unpaid"

        # Update invoice
        update_result = invoices_collection.update_one(
            invoice_filter,
            {
                '$set': {
                    'amount_paid': round(new_paid, 2),
                    'status': status,
                    'updated_at': datetime.now()
                }
            }
        )

        if update_result.modified_count == 0:
            return jsonify({'error': 'Failed to record payment'}), 500

        # Get updated invoice
        updated_invoice = invoices_collection.find_one(invoice_filter)
        return jsonify(serialize_doc(updated_invoice)), 200
            
    except Exception as e:
        print(f"Error recording payment: {e}")
        return jsonify({'error': 'Failed to record payment'}), 500

# ============= PDF GENERATION (Same functionality) =============

@app.route('/invoices/<invoice_id>/pdf', methods=['GET'])
def generate_invoice_pdf(invoice_id):
    try:
        print(f"🔥 PDF Request for Invoice ID: {invoice_id}")
        
        # Find invoice
        try:
            if ObjectId.is_valid(invoice_id):
                invoice = invoices_collection.find_one({'_id': ObjectId(invoice_id)})
            else:
                invoice = invoices_collection.find_one({'id': int(invoice_id)})
        except (ValueError, InvalidId):
            invoice = invoices_collection.find_one({'id': int(invoice_id)})
        
        if not invoice:
            print(f"❌ Invoice not found: {invoice_id}")
            return jsonify({'error': f'Invoice not found (ID: {invoice_id})'}), 404
        
        print(f"✅ Invoice data retrieved successfully")
        
        # Load client data
        client = None
        if invoice.get('for') and invoice['for'].get('id'):
            client_id = invoice['for']['id']
            try:
                if ObjectId.is_valid(str(client_id)):
                    client = clients_collection.find_one({'_id': ObjectId(client_id)})
                else:
                    client = clients_collection.find_one({'id': int(client_id)})
            except:
                client = clients_collection.find_one({'id': int(client_id)})
            
            if client:
                print(f"👤 Client data retrieved for ID: {client_id}")
            else:
                print(f"⚠️ Client not found for ID: {client_id}")
        
        # Convert MongoDB document to dict for PDF generation
        invoice_dict = serialize_doc(invoice)
        client_dict = serialize_doc(client) if client else None
        
        # Generate PDF
        try:
            print("📊 Using ReportLab for PDF generation")
            pdf_buffer = generate_invoice_pdf_reportlab(invoice_dict, client_dict)
            
            filename = f"invoice-{invoice.get('invoice_number', invoice_id)}.pdf"
            print(f"✅ PDF generated successfully: {filename}")
            
            return send_file(
                pdf_buffer,
                mimetype='application/pdf',
                as_attachment=True,
                download_name=filename
            )
                
        except Exception as pdf_error:
            print(f"❌ ReportLab PDF generation failed: {str(pdf_error)}")
            import traceback
            traceback.print_exc()
            
            # HTML fallback
            print("⚠️ Falling back to HTML")
            html_content = generate_invoice_html(invoice_dict, client_dict)
            return Response(
                html_content, 
                mimetype='text/html',
                headers={'Content-Disposition': f'attachment; filename=invoice-{invoice_id}.html'}
            )
        
    except Exception as e:
        print(f"❌ PDF Generation Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': f'PDF generation failed: {str(e)}',
            'invoice_id': invoice_id
        }), 500

def generate_invoice_pdf_reportlab(invoice, client):
    """Generate PDF using ReportLab with logo support"""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=1*inch)
    styles = getSampleStyleSheet()
    story = []
    
    # Check for logo
    logo_path = None
    company_logo = invoice.get('from', {}).get('logo')
    if company_logo:
        logo_filename = company_logo.get('filename') or company_logo.get('url', '').split('/')[-1]
        if logo_filename:
            logo_path = os.path.join(LOGOS_DIR, secure_filename(logo_filename))
            if not os.path.exists(logo_path):
                logo_path = None
                print(f"⚠️ Logo file not found: {logo_path}")
    
    # Header with logo
    if logo_path:
        try:
            from reportlab.platypus import Image
            
            # Create header table with logo and company info
            header_data = []
            
            # Logo cell
            img = Image(logo_path, width=2*inch, height=1*inch, kind='proportional')
            
            # Company info
            company_info = []
            if invoice.get('from', {}).get('name'):
                company_info.append(f"<b>{invoice['from']['name']}</b>")
            if invoice.get('from', {}).get('email'):
                company_info.append(invoice['from']['email'])
            if invoice.get('from', {}).get('phone'):
                company_info.append(invoice['from']['phone'])
            if invoice.get('from', {}).get('address'):
                company_info.append(invoice['from']['address'])
            
            company_text = '<br/>'.join(company_info)
            
            header_data.append([img, Paragraph(company_text, styles['Normal'])])
            
            header_table = Table(header_data, colWidths=[2.5*inch, 3.5*inch])
            header_table.setStyle(TableStyle([
                ('ALIGN', (0, 0), (0, -1), 'LEFT'),
                ('ALIGN', (1, 0), (1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ]))
            
            story.append(header_table)
            story.append(Spacer(1, 30))
            
        except Exception as e:
            print(f"⚠️ Error adding logo to PDF: {e}")
            # Fallback to text header
            story.append(Paragraph(f"<b>{invoice.get('from', {}).get('name', 'Your Company')}</b>", styles['Heading1']))
            story.append(Spacer(1, 20))
    else:
        # Text-only header
        story.append(Paragraph(f"<b>{invoice.get('from', {}).get('name', 'Your Company')}</b>", styles['Heading1']))
        story.append(Spacer(1, 20))
    
    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1976d2'),
        alignment=1,
        spaceAfter=20
    )
    
    invoice_num = invoice.get('invoice_number', f"INV-{invoice.get('id')}")
    story.append(Paragraph(f"<b>INVOICE {invoice_num}</b>", title_style))
    story.append(Spacer(1, 20))
    
    # Invoice metadata
    meta_style = styles['Normal']
    story.append(Paragraph(f"<b>Date:</b> {invoice.get('date', '')}", meta_style))
    story.append(Paragraph(f"<b>Due Date:</b> {invoice.get('dueDate', '')}", meta_style))
    story.append(Paragraph(f"<b>Status:</b> {invoice.get('status', 'unpaid').upper()}", meta_style))
    story.append(Spacer(1, 20))
    
    # Company and client info
    info_data = [
        ['From:', 'To:'],
        [
            invoice.get('from', {}).get('name', 'Your Company'),
            client.get('name', 'Client') if client else 'Client'
        ],
        [
            invoice.get('from', {}).get('email', ''),
            client.get('email', '') if client else ''
        ],
        [
            invoice.get('from', {}).get('phone', ''),
            client.get('phone', '') if client else ''
        ]
    ]
    
    if invoice.get('from', {}).get('address') or (client and client.get('billing_address')):
        info_data.append([
            invoice.get('from', {}).get('address', ''),
            client.get('billing_address', '') if client else ''
        ])
    
    info_table = Table(info_data, colWidths=[3*inch, 3*inch])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1976d2')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'TOP')
    ]))
    story.append(info_table)
    story.append(Spacer(1, 30))
    
    # Items table
    if invoice.get('items'):
        items_data = [['Description', 'Qty', 'Unit Price', 'Tax %', 'Total']]
        
        currency_symbol = CURRENCY_SYMBOLS.get(invoice.get('currency', 'INR'), '₹')
        subtotal = 0
        total_tax = 0
        
        for item in invoice['items']:
            try:
                quantity = float(item.get('quantity', 0))
                unit_price = float(item.get('unit_price', 0))
                tax_rate = float(item.get('tax', 0))
                
                item_subtotal = quantity * unit_price
                item_tax_amount = (item_subtotal * tax_rate) / 100
                item_total = item_subtotal + item_tax_amount
                
                subtotal += item_subtotal
                total_tax += item_tax_amount
                
                items_data.append([
                    item.get('description', ''),
                    str(int(quantity)),
                    f"{currency_symbol}{unit_price:.2f}",
                    f"{tax_rate:.1f}%",
                    f"{currency_symbol}{item_total:.2f}"
                ])
            except (ValueError, TypeError):
                continue
        
        # Add GST
        gst_rate = float(invoice.get('gst_rate', 0))
        gst_amount = (subtotal * gst_rate) / 100
        final_total = subtotal + total_tax + gst_amount
        
        items_data.extend([
            ['', '', '', '', ''],
            ['', '', '', 'Subtotal:', f"{currency_symbol}{subtotal:.2f}"],
            ['', '', '', 'Item Tax:', f"{currency_symbol}{total_tax:.2f}"],
            ['', '', '', f'GST ({gst_rate:.1f}%):', f"{currency_symbol}{gst_amount:.2f}"],
            ['', '', '', 'TOTAL:', f"{currency_symbol}{final_total:.2f}"]
        ])
        
        items_table = Table(items_data, colWidths=[2.5*inch, 0.8*inch, 1*inch, 1*inch, 1.2*inch])
        items_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1976d2')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('ALIGN', (0, 1), (0, -6), 'LEFT'),  # Description left-aligned
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 11),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -6), colors.beige),
            ('BACKGROUND', (0, -4), (-1, -1), colors.lightgrey),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#1976d2')),
            ('TEXTCOLOR', (0, -1), (-1, -1), colors.whitesmoke),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -6), 1, colors.black),
            ('GRID', (0, -4), (-1, -1), 1, colors.black)
        ]))
        story.append(items_table)
    
    # Payment information if any
    amount_paid = float(invoice.get('amount_paid', 0))
    if amount_paid > 0:
        story.append(Spacer(1, 30))
        payment_style = styles['Normal']
        story.append(Paragraph(f"<b>Amount Paid:</b> {currency_symbol}{amount_paid:.2f}", payment_style))
        balance = final_total - amount_paid
        if balance > 0:
            story.append(Paragraph(f"<b>Balance Due:</b> {currency_symbol}{balance:.2f}", payment_style))
    
    # Footer
    story.append(Spacer(1, 50))
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.grey,
        alignment=1
    )
    story.append(Paragraph("Thank you for your business!", footer_style))
    story.append(Paragraph(f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", footer_style))
    
    # Build PDF
    doc.build(story)
    buffer.seek(0)
    
    return buffer

def generate_invoice_html(invoice, client):
    """Generate HTML template for invoice with logo support"""
    currency_symbol = CURRENCY_SYMBOLS.get(invoice.get('currency', 'INR'), '₹')
    
    # Calculate totals
    items = invoice.get('items', [])
    subtotal = 0
    total_tax = 0
    
    for item in items:
        try:
            item_total = float(item.get('quantity', 0)) * float(item.get('unit_price', 0))
            item_tax = (item_total * float(item.get('tax', 0))) / 100
            subtotal += item_total
            total_tax += item_tax
        except (ValueError, TypeError):
            continue
    
    gst_rate = float(invoice.get('gst_rate', 0))
    gst_amount = (subtotal * gst_rate) / 100
    final_total = subtotal + total_tax + gst_amount
    
    # Generate items HTML
    items_html = ""
    for item in items:
        try:
            item_subtotal = float(item.get('quantity', 0)) * float(item.get('unit_price', 0))
            item_tax_amount = (item_subtotal * float(item.get('tax', 0))) / 100
            item_total = item_subtotal + item_tax_amount
            
            items_html += f"""
            <tr>
                <td>{item.get('description', '')}</td>
                <td style="text-align: center">{item.get('quantity', 0)}</td>
                <td style="text-align: right">{currency_symbol}{float(item.get('unit_price', 0)):.2f}</td>
                <td style="text-align: center">{float(item.get('tax', 0)):.1f}%</td>
                <td style="text-align: right"><strong>{currency_symbol}{item_total:.2f}</strong></td>
            </tr>
            """
        except (ValueError, TypeError):
            continue
    
    # Company and client info
    company_name = invoice.get('from', {}).get('name', 'Your Company')
    company_email = invoice.get('from', {}).get('email', '')
    
    client_name = client.get('name', 'Client Name') if client else 'Client Name'
    client_email = client.get('email', '') if client else ''
    
    # Logo handling
    logo_html = ""
    company_logo = invoice.get('from', {}).get('logo')
    if company_logo:
        logo_url = company_logo.get('url', '')
        if logo_url:
            # Convert relative URL to absolute for HTML
            if logo_url.startswith('/logos/'):
                logo_url = f"http://localhost:5000{logo_url}"
            logo_html = f'<img src="{logo_url}" alt="Company Logo" style="max-height: 80px; max-width: 200px; margin-bottom: 10px;">'
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Invoice {invoice.get('invoice_number', invoice.get('id'))}</title>
        <style>
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            body {{ font-family: Arial, sans-serif; font-size: 14px; color: #333; }}
            .invoice-container {{ max-width: 800px; margin: 0 auto; padding: 40px 20px; }}
            .header {{ display: flex; justify-content: space-between; margin-bottom: 40px; border-bottom: 3px solid #1976d2; padding-bottom: 20px; align-items: flex-start; }}
            .company-info {{ flex: 1; }}
            .company-info img {{ max-height: 80px; max-width: 200px; margin-bottom: 10px; }}
            .company-info h1 {{ color: #1976d2; font-size: 28px; margin-bottom: 8px; }}
            .invoice-meta {{ text-align: right; flex: 0 0 auto; }}
            .invoice-meta h2 {{ color: #1976d2; font-size: 24px; margin-bottom: 10px; }}
            table {{ width: 100%; border-collapse: collapse; margin-bottom: 30px; }}
            th, td {{ padding: 12px 8px; border: 1px solid #ddd; }}
            th {{ background-color: #1976d2; color: white; }}
            .final-total {{ background-color: #1976d2; color: white; font-weight: bold; }}
        </style>
    </head>
    <body>
        <div class="invoice-container">
            <div class="header">
                <div class="company-info">
                    {logo_html}
                    <h1>{company_name}</h1>
                    <p>{company_email}</p>
                </div>
                <div class="invoice-meta">
                    <h2>INVOICE</h2>
                    <p>#{invoice.get('invoice_number', invoice.get('id'))}</p>
                    <p>{invoice.get('date', '')}</p>
                </div>
            </div>
            
            <div style="margin-bottom: 30px;">
                <h3>Bill To: {client_name}</h3>
                <p>{client_email}</p>
            </div>
            
            <table>
                <thead>
                    <tr><th>Description</th><th>Qty</th><th>Price</th><th>Tax</th><th>Total</th></tr>
                </thead>
                <tbody>{items_html}</tbody>
            </table>
            
            <div style="text-align: right;">
                <p><strong>Final Total: {currency_symbol}{final_total:.2f}</strong></p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return html_content

# ============= REPORTS ROUTES - MongoDB Version =============

@app.route("/reports/summary", methods=["GET"])
def reports_summary():
    try:
        # Get data from MongoDB
        invoices = list(invoices_collection.find())
        clients = list(clients_collection.find())

        total_invoiced = 0
        total_paid = 0
        total_outstanding = 0
        client_revenue = defaultdict(float)
        status_breakdown = {"paid": 0, "partial": 0, "unpaid": 0}
        monthly_data = defaultdict(float)

        for inv in invoices:
            try:
                # Use the actual total from invoice
                invoice_total = float(inv.get("total", 0))
                amount_paid = float(inv.get("amount_paid", 0))
                status = inv.get("status", "unpaid")
                
                total_invoiced += invoice_total
                total_paid += amount_paid
                
                # Status breakdown
                if status in status_breakdown:
                    status_breakdown[status] += 1
                
                # Client revenue
                client_id = inv.get("for", {}).get("id")
                if client_id:
                    client_revenue[client_id] += invoice_total
                
                # Monthly data
                invoice_date = inv.get("date", "")
                if invoice_date:
                    try:
                        month_key = invoice_date[:7]  # YYYY-MM format
                        monthly_data[month_key] += invoice_total
                    except (IndexError, ValueError):
                        pass
                        
            except (ValueError, TypeError) as e:
                print(f"Error processing invoice {inv.get('_id')}: {e}")
                continue

        total_outstanding = total_invoiced - total_paid

        # Top clients
        top_clients = []
        client_dict = {c.get("id", c.get("_id")): c for c in clients}
        
        for client_id, revenue in client_revenue.items():
            if revenue > 0 and client_id in client_dict:
                client = client_dict[client_id]
                top_clients.append({
                    "id": client_id,
                    "name": client.get("name", f"Client {client_id}"),
                    "email": client.get("email", ""),
                    "revenue": round(revenue, 2)
                })
        
        top_clients.sort(key=lambda c: c["revenue"], reverse=True)

        # Monthly data for charts
        monthly_list = []
        for month, amount in sorted(monthly_data.items()):
            try:
                month_name = datetime.strptime(month + "-01", "%Y-%m-%d").strftime("%B %Y")
                monthly_list.append({
                    "month": month_name,
                    "amount": round(amount, 2)
                })
            except ValueError:
                continue

        return jsonify({
            "success": True,
            "data": {
                "total_invoiced": round(total_invoiced, 2),
                "total_paid": round(total_paid, 2),
                "total_outstanding": round(total_outstanding, 2),
                "invoice_count": len(invoices),
                "client_count": len(clients),
                "status_breakdown": status_breakdown,
                "top_clients": top_clients[:5],
                "monthly_data": monthly_list[-6:],  # Last 6 months
                "average_invoice": round(total_invoiced / len(invoices), 2) if invoices else 0,
                "collection_rate": round((total_paid / total_invoiced * 100), 2) if total_invoiced > 0 else 0
            }
        }), 200
        
    except Exception as e:
        print(f"Error generating reports summary: {e}")
        return jsonify({
            "success": False,
            "error": f"Failed to generate reports: {str(e)}"
        }), 500

@app.route("/reports/pdf", methods=["GET"])
def reports_pdf():
    try:
        # Get the summary data first
        summary_response = reports_summary()
        summary_data = summary_response[0].get_json()
        
        if not summary_data.get("success"):
            return jsonify({"error": "Failed to get report data"}), 500
            
        data = summary_data["data"]
        
        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter

        y = height - inch

        # Title
        p.setFont("Helvetica-Bold", 20)
        p.drawString(inch, y, "Invoice Management Report")
        y -= 0.7 * inch

        # Report date
        p.setFont("Helvetica", 10)
        p.drawString(width - 3*inch, y + 0.5*inch, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")

        # Summary section
        p.setFont("Helvetica-Bold", 16)
        p.drawString(inch, y, "Financial Summary")
        y -= 0.4 * inch

        p.setFont("Helvetica", 12)
        summary_items = [
            f"Total Invoiced: ₹{data['total_invoiced']:.2f}",
            f"Total Paid: ₹{data['total_paid']:.2f}",
            f"Outstanding: ₹{data['total_outstanding']:.2f}",
            f"Collection Rate: {data['collection_rate']:.1f}%",
            f"Average Invoice: ₹{data['average_invoice']:.2f}",
            f"Total Invoices: {data['invoice_count']}",
            f"Total Clients: {data['client_count']}"
        ]

        for item in summary_items:
            p.drawString(inch, y, item)
            y -= 0.25 * inch
        
        y -= 0.3 * inch

        # Status breakdown
        p.setFont("Helvetica-Bold", 14)
        p.drawString(inch, y, "Invoice Status Breakdown")
        y -= 0.3 * inch

        p.setFont("Helvetica", 12)
        status_items = [
            f"Paid: {data['status_breakdown']['paid']} invoices",
            f"Partially Paid: {data['status_breakdown']['partial']} invoices", 
            f"Unpaid: {data['status_breakdown']['unpaid']} invoices"
        ]

        for item in status_items:
            p.drawString(inch, y, item)
            y -= 0.25 * inch

        y -= 0.3 * inch

        # Top clients section
        if data['top_clients']:
            p.setFont("Helvetica-Bold", 14)
            p.drawString(inch, y, "Top 5 Clients by Revenue")
            y -= 0.3 * inch

            p.setFont("Helvetica-Bold", 11)
            p.drawString(inch, y, "Client Name")
            p.drawString(4 * inch, y, "Revenue")
            y -= 0.2 * inch
            p.line(inch, y, width - inch, y)
            y -= 0.3 * inch

            p.setFont("Helvetica", 11)
            for client in data['top_clients']:
                if y < 2 * inch:  # New page if needed
                    p.showPage()
                    y = height - inch
                
                p.drawString(inch, y, client["name"][:40])  # Truncate long names
                p.drawRightString(width - inch, y, f"₹{client['revenue']:.2f}")
                y -= 0.25 * inch

        # Monthly data section
        if data['monthly_data']:
            y -= 0.3 * inch
            if y < 4 * inch:  # New page if needed
                p.showPage()
                y = height - inch

            p.setFont("Helvetica-Bold", 14)
            p.drawString(inch, y, "Monthly Revenue (Last 6 Months)")
            y -= 0.3 * inch

            p.setFont("Helvetica-Bold", 11)
            p.drawString(inch, y, "Month")
            p.drawString(4 * inch, y, "Revenue")
            y -= 0.2 * inch
            p.line(inch, y, width - inch, y)
            y -= 0.3 * inch

            p.setFont("Helvetica", 11)
            for month_data in data['monthly_data']:
                if y < 2 * inch:
                    p.showPage()
                    y = height - inch
                
                p.drawString(inch, y, month_data["month"])
                p.drawRightString(width - inch, y, f"₹{month_data['amount']:.2f}")
                y -= 0.25 * inch

        p.showPage()
        p.save()
        buffer.seek(0)
        
        return send_file(
            buffer, 
            mimetype="application/pdf", 
            as_attachment=True, 
            download_name=f"invoice-report-{datetime.now().strftime('%Y%m%d')}.pdf"
        )
        
    except Exception as e:
        print(f"Error generating PDF report: {e}")
        return jsonify({"error": f"Failed to generate PDF report: {str(e)}"}), 500

@app.route("/reports/test", methods=["GET"])
def test_reports():
    """Test endpoint to verify reports are working"""
    try:
        invoice_count = invoices_collection.count_documents({})
        client_count = clients_collection.count_documents({})
        
        return jsonify({
            "success": True,
            "message": "Reports endpoint is working with MongoDB",
            "data_status": {
                "invoices_loaded": invoice_count,
                "clients_loaded": client_count,
                "database_connected": True
            }
        }), 200
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

if __name__ == '__main__':
    try:
        # Test database connection
        client.admin.command('ping')
        print("✅ MongoDB connection successful!")
        print(f"📊 Database: {db.name}")
        print(f"📋 Clients: {clients_collection.count_documents({})}")
        print(f"📄 Invoices: {invoices_collection.count_documents({})}")
    except Exception as e:
        print(f"❌ MongoDB connection failed: {e}")
        print("Please make sure MongoDB is running!")
    
    print("🚀 Starting Invoice Management API with MongoDB...")
    print("🌐 Flask running on http://localhost:5000")
    print("📈 Reports available at /reports/summary and /reports/pdf")
    print("👥 Complete client CRUD with Excel import/export")
    print("🎨 Logo upload support for professional invoices")
    print("📄 PDF generation with MongoDB backend")
    print("=" * 60)
    
    app.run(debug=True, host='0.0.0.0', port=5000)
