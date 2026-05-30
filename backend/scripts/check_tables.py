from app.supabase_client import supabase

try:
    res = supabase.table("profiles").select("*").limit(1).execute()
    print("profiles exists")
except Exception as e:
    print(f"profiles error: {e}")

try:
    res = supabase.table("traces").select("*").limit(1).execute()
    print("traces exists")
except Exception as e:
    print(f"traces error: {e}")
