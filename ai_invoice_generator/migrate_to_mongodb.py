import json
import os
from pymongo import MongoClient
from datetime import datetime

def migrate_json_to_mongodb():
    ATLAS_URI = os.getenv("MONGODB_URI")
    atlas_client = MongoClient(ATLAS_URI)

    db = atlas_client['invoice_management']

    clients_col = db.clients
    invoices_col = db.invoices

    data_dir = os.path.join(os.path.dirname(__file__), 'data')
    clients_file = os.path.join(data_dir, 'clients.json')
    invoices_file = os.path.join(data_dir, 'invoices.json')

    # Drop existing collections to avoid duplication
    clients_col.drop()
    invoices_col.drop()

    # Migrate Clients with duplicate email check
    if os.path.exists(clients_file):
        with open(clients_file, 'r') as f:
            clients_data = json.load(f)

        emails_seen = set()
        unique_clients = []
        duplicates = set()

        for client in clients_data:
            email = client.get('email', '').lower()
            if not email:
                # Optional: skip clients without email or add some rule
                continue
            if email in emails_seen:
                duplicates.add(email)
            else:
                emails_seen.add(email)
                client.setdefault('created_at', datetime.now())
                client.setdefault('updated_at', datetime.now())
                unique_clients.append(client)

        if duplicates:
            print(f"⚠️ Duplicate emails found and skipped: {duplicates}")

        if unique_clients:
            clients_col.insert_many(unique_clients)
            print(f"✅ Imported {len(unique_clients)} unique clients.")

    # Migrate Invoices normally
    if os.path.exists(invoices_file):
        with open(invoices_file, 'r') as f:
            invoices_data = json.load(f)
        for invoice in invoices_data:
            invoice.setdefault('created_at', datetime.now())
            invoice.setdefault('updated_at', datetime.now())
        if invoices_data:
            invoices_col.insert_many(invoices_data)
            print(f"✅ Imported {len(invoices_data)} invoices.")

    # Create Indexes for optimization and uniqueness
    try:
        clients_col.create_index('email', unique=True)
        invoices_col.create_index('invoice_number', unique=True)
        invoices_col.create_index('for.id')
        invoices_col.create_index('status')
        print("✅ Indexes created successfully.")
    except Exception as e:
        print(f"⚠️ Index creation error: {e}")

    print("🎉 Migration completed successfully.")

if __name__ == '__main__':
    migrate_json_to_mongodb()
