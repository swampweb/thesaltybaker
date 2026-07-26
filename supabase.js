const SUPABASE_URL = "https://fprbzavehflzqcmxvbxx.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwcmJ6YXZlaGZsenFjbXh2Ynh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MjMxNzEsImV4cCI6MjA5OTk5OTE3MX0.8_D_7kx9f2as46N7ZrNhGZen25e8TGFd2ue5p1TgTvg";

window.saltySupabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
