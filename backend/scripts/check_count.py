from app.supabase_client import supabase

res = supabase.table("traces").select("count").execute()
print(f"Traces count: {res.data}")
