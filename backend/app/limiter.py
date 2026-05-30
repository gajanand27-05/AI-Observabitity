from slowapi import Limiter
from slowapi.util import get_remote_address

# Use remote address as default key, but we will often override with user_id
limiter = Limiter(key_func=get_remote_address)
