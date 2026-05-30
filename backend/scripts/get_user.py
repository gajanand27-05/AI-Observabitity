from app.supabase_client import supabase

res = supabase.table("profiles").select("id").limit(1).execute()
if res.data:
    print(res.data[0]["id"])
else:
    print("No users found")
