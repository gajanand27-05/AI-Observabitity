from app.config import settings

def mask(s):
    if not s: return "EMPTY"
    if len(s) < 8: return "***"
    return s[:4] + "..." + s[-4:]

print(f"SUPABASE_URL: {settings.supabase_url}")
print(f"SUPABASE_ANON_KEY: {mask(settings.supabase_anon_key)}")
print(f"SUPABASE_SERVICE_ROLE_KEY: {mask(settings.supabase_service_role_key)}")
